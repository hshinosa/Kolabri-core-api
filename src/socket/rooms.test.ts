import { describe, expect, it } from 'vitest';
import { roomNames } from './rooms.js';

describe('roomNames', () => {
    it('chatSpace returns the raw chatSpaceId for compatibility with socket.join', () => {
        expect(roomNames.chatSpace('abc')).toBe('abc');
    });

    it('user returns a namespaced room', () => {
        expect(roomNames.user('u1')).toBe('user_u1');
    });
});
