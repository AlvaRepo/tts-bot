import { synthesize } from './tts.js'
import { updateMessage } from './db.js'

const MAX_RETRIES = parseInt(process.env.MAX_RETRIES ?? '3', 10)

export class MessageQueue {
  #queue = []
  #state = 'idle'
  #current = null
  #resolveAudio = null
  #broadcast = null
  #playbackTimeout = null

  init(broadcastFn) {
    this.#broadcast = broadcastFn
  }

  add(msg) {
    if (this.#state === 'stopped') {
      this.#state = 'idle'
    }
    msg.status = 'QUEUED'
    updateMessage(msg.id, { status: 'QUEUED' })
    this.#queue.push(msg)
    this.#broadcast?.({ type: 'queue:updated', pending: this.#queue.length })
    if (this.#state === 'idle') void this.#processNext()
  }

  audioEnded(id) {
    if (this.#current?.id === id && this.#resolveAudio) {
      this.#clearPlaybackTimeout()
      this.#resolveAudio()
      this.#resolveAudio = null
    }
  }

  discard(id, reason = 'CANCELLED') {
    if (this.#current?.id === id) {
      this.#current.status = 'SKIPPED'
      updateMessage(id, { status: 'SKIPPED', error_msg: reason })
      this.#clearPlaybackTimeout()
      this.#broadcast?.({ type: 'message:done', id })
      if (this.#resolveAudio) {
        this.#resolveAudio()
        this.#resolveAudio = null
      }
      return true
    }

    const index = this.#queue.findIndex(item => item.id === id)
    if (index === -1) return false

    const [removed] = this.#queue.splice(index, 1)
    updateMessage(removed.id, { status: 'SKIPPED', error_msg: reason })
    this.#broadcast?.({ type: 'queue:updated', pending: this.#queue.length })
    return true
  }

  control(action) {
    switch (action) {
      case 'pause':
        if (this.#state === 'playing') {
          this.#state = 'paused'
          if (this.#current) {
            this.#current.status = 'PAUSED'
            updateMessage(this.#current.id, { status: 'PAUSED' })
            this.#clearPlaybackTimeout()
          }
          this.#broadcast?.({ type: 'queue:paused' })
        }
        break
      case 'resume':
        if (this.#state === 'paused') {
          this.#state = 'playing'
          if (this.#current) {
            this.#current.status = 'PLAYING'
            updateMessage(this.#current.id, { status: 'PLAYING' })
            this.#armPlaybackTimeout(this.#current)
          }
          this.#broadcast?.({ type: 'queue:resumed' })
        }
        break
      case 'stop': {
        this.#state = 'stopped'
        if (this.#current) {
          this.#current.status = 'SKIPPED'
          updateMessage(this.#current.id, { status: 'SKIPPED' })
        }
        this.#clearPlaybackTimeout()
        for (const pending of this.#queue) {
          updateMessage(pending.id, { status: 'SKIPPED' })
        }
        this.#queue = []
        this.#current = null
        if (this.#resolveAudio) {
          this.#resolveAudio()
          this.#resolveAudio = null
        }
        this.#broadcast?.({ type: 'queue:stopped' })
        break
      }
      case 'skip':
        if (this.#current) this.discard(this.#current.id, 'SKIPPED')
        break
    }
  }

  get pendingCount() {
    return this.#queue.length
  }

  snapshot() {
    return {
      state: this.#state,
      pendingCount: this.#queue.length,
      current: this.#current
        ? {
            id: this.#current.id,
            text: this.#current.text,
            donor_name: this.#current.donor_name ?? null,
            amount: this.#current.amount ?? null,
            status: this.#current.status
          }
        : null
    }
  }

  async #processNext() {
    if (this.#queue.length === 0 || this.#state === 'paused' || this.#state === 'stopped') {
      this.#state = 'idle'
      return
    }

    this.#current = this.#queue.shift()
    this.#state = 'playing'
    await this.#processMessage(this.#current)
    this.#current = null
    void this.#processNext()
  }

  async #processMessage(msg) {
    let audioPath = null
    let attempt = 0

    while (attempt < MAX_RETRIES && audioPath === null) {
      updateMessage(msg.id, { status: 'SYNTHESIZING', retries: attempt })
      try {
        audioPath = await synthesize(msg.id, msg.text)
      } catch (err) {
        attempt += 1
        if (attempt >= MAX_RETRIES) {
          updateMessage(msg.id, { status: 'FAILED', error_msg: err.message })
          this.#broadcast?.({ type: 'message:failed', id: msg.id, error: err.message })
          return
        }
        await sleep(1000 * Math.pow(2, attempt - 1))
      }
    }

    updateMessage(msg.id, { status: 'READY', audio_path: audioPath })
    msg.status = 'READY'
    this.#broadcast?.({
      type: 'message:start',
      id: msg.id,
      text: msg.text,
      donor_name: msg.donor_name ?? null,
      amount: msg.amount ?? null,
      audioUrl: `/audio/${msg.id}`
    })
    updateMessage(msg.id, { status: 'PLAYING' })
    msg.status = 'PLAYING'

    this.#armPlaybackTimeout(msg)

    await new Promise(resolve => {
      this.#resolveAudio = resolve
    })

    this.#clearPlaybackTimeout()
    this.#resolveAudio = null

    if (msg.status !== 'SKIPPED') {
      updateMessage(msg.id, { status: 'DONE' })
      this.#broadcast?.({ type: 'message:done', id: msg.id })
    }
  }

  #armPlaybackTimeout(msg) {
    this.#clearPlaybackTimeout()

    const timeoutMs = Math.min(45000, Math.max(8000, msg.text.length * 120))
    this.#playbackTimeout = setTimeout(() => {
      if (this.#resolveAudio) {
        this.#resolveAudio()
        this.#resolveAudio = null
      }
    }, timeoutMs)
    this.#playbackTimeout.unref?.()
  }

  #clearPlaybackTimeout() {
    if (this.#playbackTimeout) clearTimeout(this.#playbackTimeout)
    this.#playbackTimeout = null
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export const queue = new MessageQueue()
