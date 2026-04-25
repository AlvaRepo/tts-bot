// =============================
// Sistema de Plugins
// =============================

// Los plugins detectan eventos especiales (no comandos)
// y se ejecutan ANTES de verificar comandos

export function createPluginManager() {
  const plugins = []

  function register(plugin) {
    plugins.push(plugin)
  }

  async function handleEvent(event, deps) {
    for (const plugin of plugins) {
      if (plugin.shouldHandle?.(event)) {
        const result = await plugin.handle?.(event, deps)
        if (result) return result
      }
    }
    return null
  }

  return { register, handleEvent }
}