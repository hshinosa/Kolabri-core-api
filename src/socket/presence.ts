import type { Server } from 'socket.io';
import { logger } from '../utils/logger.js';
import { socketRateLimiter } from '../utils/socketRateLimiter.js';
import { typingSchema } from '../validators/socket.validator.js';
import type { AuthenticatedSocket } from './types.js';

export interface RoomUser {
    userId: string;
    userName: string;
    socketId: string;
}

export const roomUsers = new Map<string, Map<string, RoomUser>>();

export function trackUserInRoom(roomId: string, user: RoomUser): void {
    if (!roomUsers.has(roomId)) {
        roomUsers.set(roomId, new Map());
    }
    roomUsers.get(roomId)!.set(user.userId, user);
}

export function listUsersInRoom(roomId: string): Array<{ userId: string; userName: string }> {
    const users = roomUsers.get(roomId);
    if (!users) return [];
    return Array.from(users.values()).map((u) => ({
        userId: u.userId,
        userName: u.userName,
    }));
}

function removeUserFromRoom(socket: AuthenticatedSocket, roomId: string): void {
    if (!socket.user) return;
    const users = roomUsers.get(roomId);
    if (!users) return;

    users.delete(socket.user.userId);
    socket.to(roomId).emit('user_left', { userId: socket.user.userId });
    if (users.size === 0) {
        roomUsers.delete(roomId);
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
            removeUserFromRoom(socket, roomId);
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
            removeUserFromRoom(socket, socket.currentRoom);
        }
        logger.info(`User disconnected: ${socket.user?.userId} (${socket.id})`);
    });
}
