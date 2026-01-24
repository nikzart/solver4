/**
 * Fact Cache - Store verified facts during session
 */

export interface CachedFact {
  fact: string;
  sources: string[];
  verified: boolean;
  timestamp: number;
}

class FactCache {
  private cache: Map<string, CachedFact> = new Map();

  /**
   * Normalize a key for consistent lookups
   */
  private normalizeKey(key: string): string {
    return key.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  /**
   * Store a fact with its source
   */
  store(key: string, fact: string, source?: string): void {
    const normalizedKey = this.normalizeKey(key);
    const existing = this.cache.get(normalizedKey);

    if (existing) {
      if (source && !existing.sources.includes(source)) {
        existing.sources.push(source);
      }
      // Mark as verified if we have 2+ sources
      existing.verified = existing.sources.length >= 2;
    } else {
      this.cache.set(normalizedKey, {
        fact,
        sources: source ? [source] : [],
        verified: false,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Retrieve a cached fact
   */
  retrieve(key: string): CachedFact | null {
    const normalizedKey = this.normalizeKey(key);
    return this.cache.get(normalizedKey) || null;
  }

  /**
   * Check if a fact is verified (2+ sources)
   */
  isVerified(key: string): boolean {
    const fact = this.retrieve(key);
    return fact?.verified || false;
  }

  /**
   * Find facts related to keywords
   */
  findRelated(keywords: string[]): CachedFact[] {
    const results: CachedFact[] = [];

    for (const [key, fact] of this.cache.entries()) {
      const keyMatches = keywords.some((kw) => key.includes(kw.toLowerCase()));
      const factMatches = keywords.some((kw) => fact.fact.toLowerCase().includes(kw.toLowerCase()));

      if (keyMatches || factMatches) {
        results.push(fact);
      }
    }

    return results;
  }

  /**
   * Get all verified facts
   */
  getVerifiedFacts(): CachedFact[] {
    return Array.from(this.cache.values()).filter((f) => f.verified);
  }

  /**
   * Clear the cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { total: number; verified: number } {
    const facts = Array.from(this.cache.values());
    return {
      total: facts.length,
      verified: facts.filter((f) => f.verified).length,
    };
  }
}

// Singleton instance
export const factCache = new FactCache();
