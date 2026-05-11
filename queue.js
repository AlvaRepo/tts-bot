import { synthesize } from './tts.js'
import { updateMessage } from './supabase-db.js'

const MAX_RETRIES = parseInt(process.env.MAX_RETRIES ?? '3', 10)

function persistUpdate(id, fields, context) {
  void updateMessage(id, fields).catch(error => {
    console.error(`[queue] ${context} failed for ${id}:`, error?.message ?? error)
  })
}

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
    persistUpdate(msg.id, { status: 'QUEUED' }, 'queue.add')
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
      persistUpdate(id, { status: 'SKIPPED', error_msg: reason }, 'discard-current')
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
    persistUpdate(removed.id, { status: 'SKIPPED', error_msg: reason }, 'discard-pending')
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
            persistUpdate(this._current.id, { status: 'PAUSED' }, 'pause')
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
            persistUpdate(this._current.id, { status: 'PLAYING' }, 'resume')
            this._armPlaybackTimeout(this._current)
          }
          this._broadcast?.({ type: 'queue:resumed' })
        }
        break
      case 'stop': {
        this._state = 'stopped'
        if (this._current) {
          this._current.status = 'SKIPPED'
          persistUpdate(this._current.id, { status: 'SKIPPED' }, 'stop-current')
        }
        this._clearPlaybackTimeout()
        for (const pending of this._queue) {
          persistUpdate(pending.id, { status: 'SKIPPED' }, 'stop-pending')
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
    const current = this._current

    try {
      await this._processMessage(current)
    } catch (error) {
      console.error('[queue] Unhandled playback error:', error)
      if (current) {
        current.status = 'FAILED'
        persistUpdate(current.id, { status: 'FAILED', error_msg: error?.message ?? String(error) }, 'processNext')
        this._broadcast?.({ type: 'message:failed', id: current.id, error: error?.message ?? String(error) })
      }
    } finally {
      this._current = null
      void this._processNext()
    }
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
        persistUpdate(msg.id, { status: 'SYNTHESIZING', retries: attempt }, 'synthesize')
        try {
          audioPath = await synthesize(msg.id, msg.text)
        } catch (err) {
          attempt += 1
          if (attempt >= MAX_RETRIES) {
            persistUpdate(msg.id, { status: 'FAILED', error_msg: err.message }, 'synthesize-failed')
            this._broadcast?.({ type: 'message:failed', id: msg.id, error: err.message })
            return
          }
          await sleep(1000 * Math.pow(2, attempt - 1))
        }
      }
    }

    persistUpdate(msg.id, { status: 'READY', audio_path: audioPath }, 'ready')
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
    
    persistUpdate(msg.id, { status: 'PLAYING' }, 'playing')
    msg.status = 'PLAYING'

    this._armPlaybackTimeout(msg)

    await new Promise(resolve => {
      this._resolveAudio = resolve
    })

    this._clearPlaybackTimeout()
    this._resolveAudio = null

    if (msg.status !== 'SKIPPED') {
      persistUpdate(msg.id, { status: 'DONE' }, 'done')
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
