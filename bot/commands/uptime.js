// =============================
// Comandos: uptime
// =============================

export async function uptimeHandler({ reply }) {
  const uptimeSeconds = process.uptime();
  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = Math.floor(uptimeSeconds % 60);
  
  const uptimeString = [
    hours > 0 ? `${hours}h` : '',
    minutes > 0 ? `${minutes}m` : '',
    `${seconds}s`
  ].filter(part => part).join(' ') || '0s';

  const response = `
Que hace: Muestra cuánto tiempo lleva el bot en funcionamiento.
Como usar: !uptime en el chat.
Que esperar: El tiempo transcurrido desde que el bot se inició, en formato legible (horas, minutos, segundos).
Ejemplo: !uptime -> "Bot activo desde hace 2h 30m 15s"
  `.trim()

  await reply(`${response}
Tu consulta: Bot activo desde hace ${uptimeString}`)
  return { handled: true, action: 'uptime' }
}