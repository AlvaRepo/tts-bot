// =============================
// Plugin: Encuestas
// =============================

export function createPollPlugin() {
  return {
    shouldHandle(event) {
      // Detectar si es inicio de encuesta
      return event.type === 'poll' || event.pollStarted === true
    },

    async handle(event, deps) {
      console.log('[plugin:poll] Encuesta detectada:', event.poll)
      // Lógica para encuestas
      return { handled: true, plugin: 'poll', poll: event.poll }
    }
  }
}