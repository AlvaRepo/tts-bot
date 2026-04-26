// =============================
// Comandos: randomquote
// =============================

const QUOTES = [
  "La vida es lo que sucede mientras estás ocupado haciendo otros planes. - John Lennon",
  "El único modo de hacer un gran trabajo es amar lo que haces. - Steve Jobs",
  "Innovar distingue entre un líder y un seguidor. - Steve Jobs",
  "La vida es realmente simple, pero nosotros insistimos en hacerla complicada. - Confucio",
  "Sé el cambio que deseas ver en el mundo. - Mahatma Gandhi",
  "El éxito no es final, el fracaso no es fatal: lo que vale es el coraje para continuar. - Winston Churchill",
  "No hay que temer al desconocido, sino a no intentar conocerlo. - Anónimo",
  "El que tiene un por qué para vivir, puede soportar casi cualquier cómo. - Friedrich Nietzsche"
];

export async function randomquoteHandler({ reply }) {
  const randomIndex = Math.floor(Math.random() * QUOTES.length);
  const quote = QUOTES[randomIndex];

  const response = `
Que hace: Muestra una cita aleatoria de nuestra colección.
Como usar: !randomquote en el chat.
Que esperar: Una cita seleccionada al azar de la lista de citas disponibles.
Ejemplo: !randomquote -> "${quote}"
  `.trim()

  await reply(`${response}
Cita: "${quote}"`)
  return { handled: true, action: 'randomquote' }
}