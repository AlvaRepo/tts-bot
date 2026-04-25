// =============================
// Plugin: Mensajes Fijados
// =============================

export function createPinnedPlugin() {
  return {
    shouldHandle(event) {
      // Detectar si el mensaje está pinned
      return event.pinned === true || event.isPinned === true
    },

    async handle(event, deps) {
      console.log('[plugin:pinned] Mensaje fijdo detectado:', event.content)
      // Lógica para manejar mensajes fijados
      // Por ejemplo: guardar en historial, notificar al streamer, etc.
      return { handled: true, plugin: 'pinned', content: event.content }
    }
  }
}