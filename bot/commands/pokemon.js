// =============================
// Comandos: pokemon (OCULTO)
// =============================

export async function pokemonHandler({ parsed, enqueueMessage, reply }) {
  const nameOrId = parsed.args.join(' ').trim().toLowerCase()
  if (!nameOrId) {
    await reply('❌ Faltan parámetros')
    return { handled: true, error: 'missing name' }
  }

  try {
    const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${nameOrId}`)
    
    if (!response.ok) {
      await reply('❌ Pokémon no encontrado')
      return { handled: true, error: 'not found' }
    }

    const data = await response.json()
    
    // Intentar varias imágenes en orden de prioridad
    const images = [
      data.sprites?.other?.['official-artwork']?.front_default,
      data.sprites?.other?.dream_world?.front_default,
      data.sprites?.front_default,
      data.sprites?.versions?.['generation-v']?.['black-white']?.animated?.front_default
    ].filter(Boolean)

    const image = images[0] || ''

     const result = {
       name: data.name,
       id: data.id,
       image: image,
       audioUrl: data.cries?.latest || null
     }

     // Usa el cry del Pokémon si está disponible, sino el nombre
     const ttsMessage = result.name
    
     try {
       const enqueued = enqueueMessage({
         source: 'command',
         donor_name: 'pokemon',
         amount: null,
         text: ttsMessage,
         audioUrl: result.audioUrl,
         metadata: { image: result.image }
       })

      await reply(`🔍 #${result.id} ${result.name}`)

      return {
        handled: true,
        action: 'pokemon',
        data: result,
        message: ttsMessage,
        enqueued: enqueued?.id
      }
    } catch (enqueueError) {
      console.error('[pokemon] enqueue error:', enqueueError.message)
      await reply('❌ Error al encolar mensaje')
      return { handled: true, error: enqueueError.message }
    }
  } catch (error) {
    await reply('❌ Error al buscar Pokémon')
    return { handled: true, error: error.message }
  }
}