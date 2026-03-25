/**
 * In-memory TTL cache for scraped data.
 * Prevents excessive HTTP requests and keeps response times fast.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

// Default TTLs by data type (ms)
export const TTL = {
  NEWS: 30 * 60 * 1000,           // 30 minutes
  JOBS: 2 * 60 * 60 * 1000,       // 2 hours
  COMPANIES: 24 * 60 * 60 * 1000, // 24 hours
  INSURANCE: 12 * 60 * 60 * 1000, // 12 hours
  REGULATORY: 6 * 60 * 60 * 1000, // 6 hours
  PENSION: 24 * 60 * 60 * 1000,   // 24 hours
  TENDERS: 1 * 60 * 60 * 1000,    // 1 hour
  REAL_ESTATE: 4 * 60 * 60 * 1000,// 4 hours
  DEMOGRAPHICS: 7 * 24 * 60 * 60 * 1000, // 7 days
};

class Cache {
  private store = new Map<string, CacheEntry<any>>();

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

export const cache = new Cache();

/**
 * Rate limiter: enforces minimum interval between requests to the same domain.
 */
const lastRequestMap = new Map<string, number>();
const MIN_INTERVAL_MS = 2000;

export async function rateLimitWait(domain: string): Promise<void> {
  const last = lastRequestMap.get(domain);
  if (last) {
    const elapsed = Date.now() - last;
    if (elapsed < MIN_INTERVAL_MS) {
      await new Promise(resolve => setTimeout(resolve, MIN_INTERVAL_MS - elapsed));
    }
  }
  lastRequestMap.set(domain, Date.now());
}
