import type { Server } from 'socket.io';
import { logger } from '../utils/logger.js';
import { ChatLog } from '../models/ChatLog.js';
import { socketRateLimiter } from '../utils/socketRateLimiter.js';
import {
    deleteMessageSchema,
    editMessageSchema,
    emitValidationError,
    resolveRoomId,
} from '../validators/socket.validator.js';
import type { AuthenticatedSocket } from './types.js';

export function registerDeleteMessage(io: Server, socket: AuthenticatedSocket): void {
    socket.on('delete_message', async (data: { roomId: string; messageId: string }) => {
        try {
            if (!socketRateLimiter.isAllowed(socket.id, 'delete_message')) {
                const violations = socketRateLimiter.recordViolation(socket.id);
                socket.emit('rate_limit_exceeded', {
                    event: 'delete_message',
                    retryAfter: socketRateLimiter.getRetryAfter(socket.id, 'delete_message'),
                });
                if (violations >= socketRateLimiter.disconnectThreshold) socket.disconnect(true);
                return;
            }

            const parsed = deleteMessageSchema.safeParse(data);
            if (!parsed.success) {
                emitValidationError(socket, 'delete_message', parsed.error.issues);
                return;
            }

            const roomId = resolveRoomId(parsed.data);
            const { messageId } = parsed.data;

            if (!socket.user) {
                socket.emit('error', { message: 'Not authenticated' });
                return;
            }

            if (!socket.rooms.has(roomId)) {
                socket.emit('error', { message: 'You must be in the room to delete messages' });
                return;
            }

            const message = await ChatLog.findById(messageId);

            if (!message) {
                socket.emit('error', { message: 'Message not found' });
                return;
            }

            if (message.sessionDiscussionId !== roomId) {
                socket.emit('error', { message: 'Message does not belong to this room' });
                return;
            }

            if (message.senderId !== socket.user.userId) {
                socket.emit('error', { message: 'You can only delete your own messages' });
                return;
            }

            message.deletedAt = new Date();
            await message.save();

            io.to(roomId).emit('message_deleted', { messageId });

            logger.info(`Message ${messageId} deleted by user ${socket.user.userId}`);
        } catch (error) {
            logger.error('Delete message error:', error);
            socket.emit('error', { message: 'Failed to delete message' });
        }
    });
}

/**
 * Persists message edits.
 *
 * The client already emits `edit_message` after a successful REST edit, but the
 * server never listened for it, so edited content only ever landed in
 * `chat_message_audit` and reverted on reload.
 */
export function registerEditMessage(io: Server, socket: AuthenticatedSocket): void {
    socket.on(
        'edit_message',
        async (data: {
            messageId?: string;
            content?: string;
            roomId?: string;
            sessionDiscussionId?: string;
        }) => {
            try {
                if (!socketRateLimiter.isAllowed(socket.id, 'edit_message')) {
                    const violations = socketRateLimiter.recordViolation(socket.id);
                    socket.emit('rate_limit_exceeded', {
                        event: 'edit_message',
                        retryAfter: socketRateLimiter.getRetryAfter(socket.id, 'edit_message'),
                    });
                    if (violations >= socketRateLimiter.disconnectThreshold) socket.disconnect(true);
                    return;
                }

                const parsed = editMessageSchema.safeParse(data);
                if (!parsed.success) {
                    emitValidationError(socket, 'edit_message', parsed.error.issues);
                    return;
                }

                const roomId = resolveRoomId(parsed.data);
                const { messageId, content } = parsed.data;

                if (!socket.user) {
                    socket.emit('error', { message: 'Not authenticated' });
                    return;
                }

                if (!socket.rooms.has(roomId)) {
                    socket.emit('error', { message: 'You must be in the room to edit messages' });
                    return;
                }

                const message = await ChatLog.findById(messageId);
                if (!message) {
                    socket.emit('error', { message: 'Message not found' });
                    return;
                }

                if (message.sessionDiscussionId !== roomId) {
                    socket.emit('error', { message: 'Message does not belong to this room' });
                    return;
                }

                if (message.senderId !== socket.user.userId) {
                    socket.emit('error', { message: 'You can only edit your own messages' });
                    return;
                }

                // Same window the REST controller enforces (422 past 24 hours).
                const ageMs = Date.now() - new Date(message.createdAt).getTime();
                if (ageMs > 24 * 60 * 60 * 1000) {
                    socket.emit('error', { message: 'Pesan hanya bisa diedit dalam 24 jam pertama' });
                    return;
                }

                message.content = content;
                message.editedAt = new Date();
                message.version = (message.version ?? 0) + 1;
                await message.save();

                io.to(roomId).emit('message_edited', {
                    messageId,
                    content,
                    editedAt: message.editedAt.toISOString(),
                });

                logger.info(`Message ${messageId} edited by user ${socket.user.userId}`);
            } catch (error) {
                logger.error('Edit message error:', error);
                socket.emit('error', { message: 'Failed to edit message' });
            }
        },
    );
}
