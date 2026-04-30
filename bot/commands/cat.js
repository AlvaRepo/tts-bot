// =============================
// Comandos: gatito (TheCatAPI)
// Following pokemon.js pattern
// =============================

export async function gatitoHandler({ parsed, reply, catApi, catStore }) {
  const breedName = parsed.args.join(' ').trim();
  
  try {
    let breedData = null;
    let imageData = null;

    if (breedName) {
      // Search for breed by name (case-insensitive)
      const breeds = await catApi.searchBreed(breedName);
      
      if (breeds.length > 0) {
        // Use first match
        breedData = breeds[0];
        // Fetch image for this breed
        imageData = await catApi.getRandomImage(breedData.id);
      } else {
        // No exact match found, fall back to random
        await reply(`🔍 No se encontró la raza "${breedName}". Mostrando un gatito aleatorio.`);
        imageData = await catApi.getRandomImage();
      }
    } else {
      // No breed specified, get random image
      imageData = await catApi.getRandomImage();
    }

    // Process the image data
    if (imageData && imageData.url) {
      // Extract breed info if available from image data
      const breedFromImage = imageData.breeds?.[0] || null;
      
      // Prepare cat data for storage
      const catData = {
        name: breedData?.name || breedFromImage?.name || 'Gatito Aleatorio',
        origin: breedData?.origin || breedFromImage?.origin || 'Desconocido',
        temperament: breedData?.temperament || breedFromImage?.temperament || 'Desconocido',
        description: breedData?.description || breedFromImage?.description || 'Sin descripción disponible',
        imageUrl: imageData.url,
        breedId: breedData?.id || breedFromImage?.id || null
      };

      // Store in catStore
      catStore.setLastGatito(catData);

      // Send message with image using metadata:image pattern
      await reply(`😺 ${catData.name}`, {
        metadata: { image: catData.imageUrl }
      });

      return {
        handled: true,
        action: 'gatito',
        data: catData
      };
    } else {
      await reply('❌ No se pudo obtener imagen de gatito');
      return { handled: true, error: 'no image data' };
    }
  } catch (error) {
    console.error('[gatitoHandler] Error:', error);
    await reply('❌ Error al buscar gatito');
    return { handled: true, error: error.message };
  }
}

export async function gatitoInfoHandler({ reply, catStore }) {
  try {
    const lastCat = catStore.getLastGatito();
    
    if (!lastCat) {
      await reply('😺 Aún no se ha mostrado ningún gatito. Usa !gatito primero para ver información.');
      return { handled: true };
    }

    const infoMessage = `
😺 Información del último gatito:
Nombre: ${lastCat.name}
Origen: ${lastCat.origin}
Temperamento: ${lastCat.temperament}
Descripción: ${lastCat.description}
`.trim();

    await reply(infoMessage);
    return { handled: true, data: lastCat };
  } catch (error) {
    console.error('[gatitoInfoHandler] Error:', error);
    await reply('❌ Error al obtener información del gatito');
    return { handled: true, error: error.message };
  }
}