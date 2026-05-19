import type { Server } from 'socket.io';
import { logger } from '../utils/logger.js';
import { socketRateLimiter } from '../utils/socketRateLimiter.js';
import { typingSchema } from '../validators/socket.validator.js';
import { getRedis } from '../config/redis.js';
import type { AuthenticatedSocket } from './types.js';

export interface RoomUser {
    userId: string;
    userName: string;
    socketId: string;
}

export const roomUsers = new Map<string, Map<string, RoomUser>>();

const PRESENCE_KEY_PREFIX = 'presence:';
const PRESENCE_TTL_SECONDS = 24 * 60 * 60;

function userKey(roomId: string): string {
    return `${PRESENCE_KEY_PREFIX}${roomId}`;
}

export async function trackUserInRoom(roomId: string, user: RoomUser): Promise<void> {
    if (!roomUsers.has(roomId)) {
        roomUsers.set(roomId, new Map());
    }
    roomUsers.get(roomId)!.set(user.userId, user);

    const redis = getRedis();
    if (redis) {
        try {
            await redis.hset(userKey(roomId), user.userId, `${user.userName}|${user.socketId}`);
            await redis.expire(userKey(roomId), PRESENCE_TTL_SECONDS);
        } catch (err) {
            logger.warn('presence redis HSET failed', err as Error);
        }
    }
}

export async function listUsersInRoom(roomId: string): Promise<Array<{ userId: string; userName: string }>> {
    const redis = getRedis();
    if (redis) {
        try {
            const entries = await redis.hgetall(userKey(roomId));
            return Object.entries(entries).map(([userId, payload]) => {
                const [userName] = (payload as string).split('|');
                return { userId, userName };
            });
        } catch (err) {
            logger.warn('presence redis HGETALL failed, falling back to local', err as Error);
        }
    }
    const users = roomUsers.get(roomId);
    if (!users) return [];
    return Array.from(users.values()).map((u) => ({
        userId: u.userId,
        userName: u.userName,
    }));
}

async function removeUserFromRoom(socket: AuthenticatedSocket, roomId: string): Promise<void> {
    if (!socket.user) return;
    const users = roomUsers.get(roomId);
    if (users) {
        users.delete(socket.user.userId);
        if (users.size === 0) {
            roomUsers.delete(roomId);
        }
    }
    socket.to(roomId).emit('user_left', { userId: socket.user.userId });

    const redis = getRedis();
    if (redis) {
        try {
            await redis.hdel(userKey(roomId), socket.user.userId);
        } catch (err) {
            logger.warn('presence redis HDEL failed', err as Error);
        }
    }
}

export function registerPresence(_io: Server, socket: AuthenticatedSocket): void {
    socket.on('typing', (data: { roomId: string; isTyping: boolean }) => {
        if (!socketRateLimiter.isAllowed(socket.id, 'typing')) return;
        const typingParsed = typingSchema.safeParse(data);
        if (!typingParsed.success) return;
        if (!socket.user) return;

        socket.to(data.roomId).emit('user_typing', {
            userId: socket.user.userId,
            userName: socket.user.email.split('@')[0],
            isTyping: data.isTyping,
        });
    });

    socket.on('leave_room', (roomId: string) => {
        if (socket.user) {
            socket.to(roomId).emit('user_typing', {
                userId: socket.user.userId,
                userName: socket.user.email.split('@')[0],
                isTyping: false,
            });
            removeUserFromRoom(socket, roomId).catch((err) => {
                logger.warn('removeUserFromRoom failed', err as Error);
            });
        }
        socket.leave(roomId);
        socket.currentRoom = undefined;
        logger.info(`User ${socket.user?.userId} left room ${roomId}`);
    });

    socket.on('disconnect', () => {
        socketRateLimiter.cleanup(socket.id);
        if (socket.user && socket.currentRoom) {
            socket.to(socket.currentRoom).emit('user_typing', {
                userId: socket.user.userId,
                userName: socket.user.email.split('@')[0],
                isTyping: false,
            });
            removeUserFromRoom(socket, socket.currentRoom).catch((err) => {
                logger.warn('removeUserFromRoom failed', err as Error);
            });
        }
        logger.info(`User disconnected: ${socket.user?.userId} (${socket.id})`);
    });
}
