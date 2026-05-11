import { randomUUID } from 'crypto'

function toTrimmedString(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toAmount(value) {
  if (value === null || value === undefined || value === '') return null
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : null
}

export function validateMessagePayload(body, maxLength) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'body inválido'
  if (!body.text || typeof body.text !== 'string') return 'text es requerido'
  if (body.text.trim().length === 0) return 'text no puede estar vacío'
  if (body.text.length > maxLength) return `text excede ${maxLength} caracteres`
  if (!['manual', 'webhook', 'command'].includes(body.source)) return 'source debe ser manual, webhook o command'
  if (body.donor_name !== undefined && body.donor_name !== null && typeof body.donor_name !== 'string') {
    return 'donor_name inválido'
  }
  if (body.amount !== undefined && body.amount !== null && toAmount(body.amount) === null) {
    return 'amount inválido'
  }
  return null
}

export function buildMessageRecord(body) {
  return {
    id: randomUUID(),
    source: body.source,
    donor_name: body.donor_name ?? null,
    amount: toAmount(body.amount),
    text: body.text.trim(),
    status: 'PENDING',
    retries: 0,
    audio_path: null,
    audioUrl: body.audioUrl ?? null,
    created_at: Date.now(),
    updated_at: Date.now(),
    error_msg: null,
    metadata: body.metadata ?? null
  }
}

export function createMessageService({ insertMessage, queue, maxMessageLength = 300, filterMessage = null }) {
  function persistRecord(record, { queueAfterInsert = true, label = 'insertMessage' } = {}) {
    Promise.resolve(insertMessage(record))
      .then(() => {
        if (queueAfterInsert) queue.add(record)
      })
      .catch(error => {
        console.error(`[message-service] ${label} failed for ${record.id}:`, error?.message ?? error)
      })
  }

  function enqueueMessage(body) {
    const error = validateMessagePayload(body, maxMessageLength)
    if (error) {
      const err = new Error(error)
      err.statusCode = 400
      throw err
    }

    const record = buildMessageRecord(body)
    const filterResult = typeof filterMessage === 'function' ? filterMessage(record.text, record) : { blocked: false, reason: null }
    if (filterResult?.blocked) {
      record.status = 'SKIPPED'
      record.error_msg = filterResult.reason ?? 'FILTERED'
      persistRecord(record, { queueAfterInsert: false, label: 'filtered-message' })
      return record
    }

    persistRecord(record)
    return record
  }

  function handleHttpMessage(req, res) {
    try {
      const body = {
        ...req.body,
        source: req.body?.source ?? 'manual'
      }
      const message = enqueueMessage(body)
      res.status(201).json({ id: message.id })
    } catch (error) {
      res.status(error.statusCode ?? 500).json({ error: error.message })
    }
  }

  return {
    enqueueMessage,
    handleHttpMessage,
    validateMessagePayload,
    buildMessageRecord
  }
}
