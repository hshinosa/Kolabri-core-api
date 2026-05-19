import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listUsersInRoom, roomUsers, trackUserInRoom } from './presence.js';

describe('presence room tracking', () => {
    beforeEach(() => {
        roomUsers.clear();
    });

    afterEach(() => {
        roomUsers.clear();
    });

    it('returns empty list for unknown room', async () => {
        expect(await listUsersInRoom('room-x')).toEqual([]);
    });

    it('tracks a single user', async () => {
        await trackUserInRoom('room-1', { userId: 'u1', userName: 'alice', socketId: 's1' });
        expect(await listUsersInRoom('room-1')).toEqual([{ userId: 'u1', userName: 'alice' }]);
    });

    it('tracks multiple users in same room', async () => {
        await trackUserInRoom('room-1', { userId: 'u1', userName: 'alice', socketId: 's1' });
        await trackUserInRoom('room-1', { userId: 'u2', userName: 'bob', socketId: 's2' });
        const users = await listUsersInRoom('room-1');
        expect(users).toHaveLength(2);
        expect(users).toEqual(expect.arrayContaining([
            { userId: 'u1', userName: 'alice' },
            { userId: 'u2', userName: 'bob' },
        ]));
    });

    it('replaces existing user when same userId joins again with new socket', async () => {
        await trackUserInRoom('room-1', { userId: 'u1', userName: 'alice', socketId: 's1' });
        await trackUserInRoom('room-1', { userId: 'u1', userName: 'alice-renamed', socketId: 's2' });
        const users = await listUsersInRoom('room-1');
        expect(users).toHaveLength(1);
        expect(users[0]).toMatchObject({ userId: 'u1', userName: 'alice-renamed' });
    });

    it('isolates rooms', async () => {
        await trackUserInRoom('room-1', { userId: 'u1', userName: 'alice', socketId: 's1' });
        await trackUserInRoom('room-2', { userId: 'u2', userName: 'bob', socketId: 's2' });
        expect(await listUsersInRoom('room-1')).toEqual([{ userId: 'u1', userName: 'alice' }]);
        expect(await listUsersInRoom('room-2')).toEqual([{ userId: 'u2', userName: 'bob' }]);
    });

    it('excludes socketId from public list output', async () => {
        await trackUserInRoom('room-1', { userId: 'u1', userName: 'alice', socketId: 's1' });
        const list = await listUsersInRoom('room-1');
        for (const u of list) {
            expect(u).not.toHaveProperty('socketId');
        }
    });
});
