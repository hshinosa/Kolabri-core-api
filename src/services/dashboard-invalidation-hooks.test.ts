import { describe, expect, it, vi } from 'vitest';

/**
 * NFR-PERF-02 task 3.4: invalidation contract.
 * Wired in: socket/index.ts (send_message, join_room), socket/presence.ts (leave),
 * reflection.service.ts (createReflection).
 */

const { cacheMock } = vi.hoisted(() => ({
    cacheMock: {
        invalidatePattern: vi.fn(),
    },
}));

vi.mock('../utils/cache.js', () => ({
    cache: cacheMock,
}));

import { invalidateDashboardCache } from './dashboard.service.js';

describe('Dashboard invalidation hooks (NFR-PERF-02 section 3.4)', () => {
    it('invalidateDashboardCache clears all dashboard:stats keys', () => {
        invalidateDashboardCache();
        expect(cacheMock.invalidatePattern).toHaveBeenCalledWith('dashboard:stats:');
    });
});