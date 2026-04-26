// =============================
// Comandos: quote
// =============================

const QUOTES = [
  "La vida es lo que sucede mientras estás ocupado haciendo otros planes. - John Lennon",
  "El único modo de hacer un gran trabajo es amar lo que haces. - Steve Jobs",
  "Innovar distingue entre un líder y un seguidor. - Steve Jobs",
  "La vida es realmente simple, pero nosotros insistimos en hacerla complicada. - Confucio",
  "Sé el cambio que deseas ver en el mundo. - Mahatma Gandhi"
];

export async function quoteHandler({ reply }) {
  const quote = QUOTES[0]; // First quote

  const response = `
Que hace: Muestra una cita inspiradora.
Como usar: !quote en el chat.
Que esperar: Una cita preseleccionada de la lista de citas disponibles.
Ejemplo: !quote -> "${quote}"
  `.trim()

  await reply(`${response}
Cita: "${quote}"`)
  return { handled: true, action: 'quote' }
}