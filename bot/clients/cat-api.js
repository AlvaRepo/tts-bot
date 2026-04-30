// =============================
// Client: TheCatAPI Integration
// Using Node.js fetch pattern from Context7: /nodejs/node
// =============================

export class CatApiClient {
  /**
   * Fetch a random cat image
   * @param {string} breedId - Optional breed ID to filter by
   * @returns {Promise<Object>} Image data from The Cat API
   */
  async getRandomImage(breedId = null) {
    try {
      let url = 'https://api.thecatapi.com/v1/images/search?limit=1';
      if (breedId) {
        url += `&breed_ids=${breedId}`;
      }
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      return data[0]; // Return first image object
    } catch (error) {
      console.error('[CatApiClient] Error fetching random image:', error);
      throw error;
    }
  }

  /**
   * Fetch all breeds from The Cat API
   * @returns {Promise<Array>} Array of breed objects
   */
  async getAllBreeds() {
    try {
      const response = await fetch('https://api.thecatapi.com/v1/breeds');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('[CatApiClient] Error fetching breeds:', error);
      throw error;
    }
  }

  /**
   * Fetch breed by ID
   * @param {string} id - Breed ID
   * @returns {Promise<Object>} Breed data
   */
  async getBreedById(id) {
    try {
      const response = await fetch(`https://api.thecatapi.com/v1/breeds/${id}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('[CatApiClient] Error fetching breed by ID:', error);
      throw error;
    }
  }

  /**
   * Search breeds by name (case-insensitive)
   * @param {string} name - Breed name to search for
   * @returns {Promise<Array>} Array of matching breed objects
   */
  async searchBreed(name) {
    try {
      const response = await fetch(`https://api.thecatapi.com/v1/breeds/search?q=${encodeURIComponent(name)}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('[CatApiClient] Error searching breeds:', error);
      throw error;
    }
  }
}