// =============================
// Store: Cat State Management
// Following queue.js MessageQueue pattern for singleton export
// =============================

export class CatStore {
  constructor() {
    this.lastGatito = null;
    this.breedsCache = null;
  }

  /**
   * Set the last displayed gatito
   * @param {Object} catData - Cat data to store
   */
  setLastGatito(catData) {
    this.lastGatito = catData;
  }

  /**
   * Get the last displayed gatito
   * @returns {Object|null} Last gatito data or null
   */
  getLastGatito() {
    return this.lastGatito;
  }

  /**
   * Set breeds cache
   * @param {Array} breeds - Array of breed objects
   */
  setBreedsCache(breeds) {
    this.breedsCache = breeds;
  }

  /**
   * Get breeds cache
   * @returns {Array|null} Breeds cache or null
   */
  getBreedsCache() {
    return this.breedsCache;
  }
}

// Singleton instance following queue.js pattern
export const catStore = new CatStore();