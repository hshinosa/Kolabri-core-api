// Short TTL: security state (deactivation, soft-delete) must propagate fast.
// 30s = bounded window for compromise/abuse, low enough to not leak access.
const CACHE_TTL_MS = 30 * 1000;

interface CacheEntry {
    value: boolean;
    expiresAt: number;
}

class UserActiveCache {
    private store = new Map<string, CacheEntry>();

    get(userId: string): boolean | null {
        const entry = this.store.get(userId);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            this.store.delete(userId);
            return null;
        }
        return entry.value;
    }

    set(userId: string, isActive: boolean): void {
        this.store.set(userId, {
            value: isActive,
            expiresAt: Date.now() + CACHE_TTL_MS,
        });
    }

    invalidate(userId: string): void {
        this.store.delete(userId);
    }

    invalidateAll(): void {
        this.store.clear();
    }
}

export const userActiveCache = new UserActiveCache();
