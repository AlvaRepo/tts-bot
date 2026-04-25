// =============================
// Comandos: pokemon (OCULTO)
// =============================

export async function pokemonHandler({ parsed, reply }) {
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
    
    const result = {
      name: data.name,
      id: data.id,
      types: data.types.map(t => t.type.name).join(', '),
      height: data.height / 10,
      weight: data.weight / 10,
      abilities: data.abilities.map(a => a.ability.name).join(', ')
    }

    const ttsMessage = `${result.name} tipo ${result.types}. Altura ${result.height}m, peso ${result.weight}kg. Habilidades: ${result.abilities}`
    
    await reply(`🔍 #${result.id} ${result.name} - ${result.types}`)

    return {
      handled: true,
      action: 'pokemon',
      data: result,
      message: ttsMessage
    }
  } catch (error) {
    await reply('❌ Error al buscar Pokémon')
    return { handled: true, error: error.message }
  }
}