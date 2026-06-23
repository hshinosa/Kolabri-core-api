import { describe, expect, it } from 'vitest';
import { roomNames } from './rooms.js';

describe('roomNames', () => {
    it('sessionDiscussion returns the raw sessionDiscussionId for compatibility with socket.join', () => {
        expect(roomNames.sessionDiscussion('abc')).toBe('abc');
    });

    it('user returns a namespaced room', () => {
        expect(roomNames.user('u1')).toBe('user_u1');
    });
});
