import { synthesize } from './tts.js'
import { updateMessage } from './supabase-db.js'

const MAX_RETRIES = parseInt(process.env.MAX_RETRIES ?? '3', 10)

export class MessageQueue {
  constructor() {
    this._queue = []
    this._state = 'idle'
    this._current = null
    this._resolveAudio = null
    this._broadcast = null
    this._playbackTimeout = null
  }

  init(broadcastFn) {
    this._broadcast = broadcastFn
  }

  add(msg) {
    if (this._state === 'stopped') {
      this._state = 'idle'
    }
    msg.status = 'QUEUED'
    updateMessage(msg.id, { status: 'QUEUED' })
    this._queue.push(msg)
    this._broadcast?.({ type: 'queue:updated', pending: this._queue.length })
    if (this._state === 'idle') void this._processNext()
  }

  audioEnded(id) {
    if (this._current?.id === id && this._resolveAudio) {
      this._clearPlaybackTimeout()
      this._resolveAudio()
      this._resolveAudio = null
    }
  }

  discard(id, reason = 'CANCELLED') {
    if (this._current?.id === id && this._current) {
      this._current.status = 'SKIPPED'
      updateMessage(id, { status: 'SKIPPED', error_msg: reason })
      this._clearPlaybackTimeout()
      this._broadcast?.({ type: 'message:done', id })
      if (this._resolveAudio) {
        this._resolveAudio()
        this._resolveAudio = null
      }
      return true
    }

    const index = this._queue.findIndex(item => item.id === id)
    if (index === -1) return false

    const [removed] = this._queue.splice(index, 1)
    updateMessage(removed.id, { status: 'SKIPPED', error_msg: reason })
    this._broadcast?.({ type: 'queue:updated', pending: this._queue.length })
    return true
  }

  control(action) {
    switch (action) {
      case 'pause':
        if (this._state === 'playing') {
          this._state = 'paused'
          if (this._current) {
            this._current.status = 'PAUSED'
            updateMessage(this._current.id, { status: 'PAUSED' })
            this._clearPlaybackTimeout()
          }
          this._broadcast?.({ type: 'queue:paused' })
        }
        break
      case 'resume':
        if (this._state === 'paused') {
          this._state = 'playing'
          if (this._current) {
            this._current.status = 'PLAYING'
            updateMessage(this._current.id, { status: 'PLAYING' })
            this._armPlaybackTimeout(this._current)
          }
          this._broadcast?.({ type: 'queue:resumed' })
        }
        break
      case 'stop': {
        this._state = 'stopped'
        if (this._current) {
          this._current.status = 'SKIPPED'
          updateMessage(this._current.id, { status: 'SKIPPED' })
        }
        this._clearPlaybackTimeout()
        for (const pending of this._queue) {
          updateMessage(pending.id, { status: 'SKIPPED' })
        }
        this._queue = []
        this._current = null
        if (this._resolveAudio) {
          this._resolveAudio()
          this._resolveAudio = null
        }
        this._broadcast?.({ type: 'queue:stopped' })
        break
      }
      case 'skip':
        if (this._current) this.discard(this._current.id, 'SKIPPED')
        break
    }
  }

  get pendingCount() {
    return this._queue.length
  }

  snapshot() {
    return {
      state: this._state,
      pendingCount: this._queue.length,
      current: this._current
        ? {
            id: this._current.id,
            text: this._current.text,
            donor_name: this._current.donor_name ?? null,
            amount: this._current.amount ?? null,
            status: this._current.status
          }
        : null
    }
  }

  async _processNext() {
    if (this._queue.length === 0 || this._state === 'paused' || this._state === 'stopped') {
      this._state = 'idle'
      return
    }

    this._current = this._queue.shift()
    this._state = 'playing'
    await this._processMessage(this._current)
    this._current = null
    void this._processNext()
  }

  async _processMessage(msg) {
    let audioPath = null
    let attempt = 0

    // Check if we have a direct audio URL (like Pokemon cry)
    if (msg.audioUrl) {
      audioPath = msg.audioUrl
    } else {
      // Otherwise, synthesize the text
      while (attempt < MAX_RETRIES && audioPath === null) {
        updateMessage(msg.id, { status: 'SYNTHESIZING', retries: attempt })
        try {
          audioPath = await synthesize(msg.id, msg.text)
        } catch (err) {
          attempt += 1
          if (attempt >= MAX_RETRIES) {
            updateMessage(msg.id, { status: 'FAILED', error_msg: err.message })
            this._broadcast?.({ type: 'message:failed', id: msg.id, error: err.message })
            return
          }
          await sleep(1000 * Math.pow(2, attempt - 1))
        }
      }
    }

    updateMessage(msg.id, { status: 'READY', audio_path: audioPath })
    msg.status = 'READY'
    
    // DEBUG: Log what we're broadcasting
    const broadcastPayload = {
      type: 'message:start',
      id: msg.id,
      text: msg.text,
      donor_name: msg.donor_name ?? null,
      amount: msg.amount ?? null,
      audioUrl: msg.audioUrl || `/audio/${msg.id}`,
      metadata: msg.metadata ?? null
    }
    console.log('[queue] Broadcasting to overlay:', broadcastPayload)
    
    this._broadcast?.(broadcastPayload)
    
    updateMessage(msg.id, { status: 'PLAYING' })
    msg.status = 'PLAYING'

    this._armPlaybackTimeout(msg)

    await new Promise(resolve => {
      this._resolveAudio = resolve
    })

    this._clearPlaybackTimeout()
    this._resolveAudio = null

    if (msg.status !== 'SKIPPED') {
      updateMessage(msg.id, { status: 'DONE' })
      this._broadcast?.({ type: 'message:done', id: msg.id })
    }
  }

  _armPlaybackTimeout(msg) {
    this._clearPlaybackTimeout()

    const timeoutMs = Math.min(45000, Math.max(8000, msg.text.length * 120))
    this._playbackTimeout = setTimeout(() => {
      if (this._resolveAudio) {
        this._resolveAudio()
        this._resolveAudio = null
      }
    }, timeoutMs)
    this._playbackTimeout.unref?.()
  }

  _clearPlaybackTimeout() {
    if (this._playbackTimeout) clearTimeout(this._playbackTimeout)
    this._playbackTimeout = null
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export const queue = new MessageQueue()
