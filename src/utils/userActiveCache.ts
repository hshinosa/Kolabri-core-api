// Short TTL: security state (deactivation, soft-delete, ROLE change) must
// propagate fast. 30s = bounded window for compromise/abuse.
const CACHE_TTL_MS = 30 * 1000;

// P2-02 (pass2 HIGH): selain isActive, cache juga menyimpan role TERBARU
// dari DB supaya verifyToken bisa meng-override klaim role pada token lama.
export interface CachedUserState {
    isActive: boolean;
    role: string | null;
}

interface CacheEntry {
    value: CachedUserState;
    expiresAt: number;
}

class UserActiveCache {
    private store = new Map<string, CacheEntry>();

    get(userId: string): CachedUserState | null {
        const entry = this.store.get(userId);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            this.store.delete(userId);
            return null;
        }
        return entry.value;
    }

    set(userId: string, isActive: boolean, role: string | null = null): void {
        this.store.set(userId, {
            value: { isActive, role },
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
