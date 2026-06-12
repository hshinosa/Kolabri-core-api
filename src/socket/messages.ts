import type { Server } from 'socket.io';
import { logger } from '../utils/logger.js';
import { ChatLog } from '../models/ChatLog.js';
import { socketRateLimiter } from '../utils/socketRateLimiter.js';
import { deleteMessageSchema, emitValidationError } from '../validators/socket.validator.js';
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

            const { roomId, messageId } = parsed.data;

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

            if (message.chatSpaceId !== roomId) {
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
