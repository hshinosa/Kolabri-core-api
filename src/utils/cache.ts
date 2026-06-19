// PERF-CACHE-03: Stampede protection - deduplicate concurrent cache misses

interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

class SimpleCache {
    private cache: Map<string, CacheEntry<unknown>> = new Map();
    private defaultTTL: number = 5 * 60 * 1000;
    private inFlightPromises: Map<string, Promise<unknown>> = new Map();

    set<T>(key: string, data: T, ttl?: number): void {
        this.cache.set(key, {
            data,
            timestamp: Date.now() + (ttl || this.defaultTTL),
        });
    }

    get<T>(key: string): T | null {
        const entry = this.cache.get(key);
        
        if (!entry) return null;
        
        if (Date.now() > entry.timestamp) {
            this.cache.delete(key);
            return null;
        }
        
        return entry.data as T;
    }

    invalidate(key: string): void {
        this.cache.delete(key);
    }

    invalidatePattern(pattern: string): void {
        const regex = new RegExp(pattern);
        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                this.cache.delete(key);
            }
        }
    }

    clear(): void {
        this.cache.clear();
    }

    // PERF-CACHE-03: Get value with stampede protection
    async getOrFetch<T>(
        key: string,
        fetchFn: () => Promise<T>,
        ttl?: number
    ): Promise<T | null> {
        const cached = this.get<T>(key);
        if (cached !== null) return cached;

        // Check if another request is already fetching this key
        const existingPromise = this.inFlightPromises.get(key) as Promise<T> | undefined;
        if (existingPromise) {
            return existingPromise;
        }

        // Create new promise for this fetch
        const fetchPromise = fetchFn()
            .then((result) => {
                if (result !== null) {
                    this.set(key, result, ttl);
                }
                return result;
            })
            .finally(() => {
                this.inFlightPromises.delete(key);
            });

        this.inFlightPromises.set(key, fetchPromise);
        return fetchPromise;
    }
}

export const cache = new SimpleCache();
