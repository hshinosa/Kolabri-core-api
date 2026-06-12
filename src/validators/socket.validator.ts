import { z } from 'zod';
import type { Socket } from 'socket.io';

export const joinRoomSchema = z.object({
    courseId: z.string().uuid('Invalid course ID'),
    groupId: z.string().uuid('Invalid group ID'),
    chatSpaceId: z.string().uuid('Invalid chat space ID'),
});

export const sendMessageSchema = z
    .object({
        roomId: z.string().min(1, 'Room ID is required'),
        clientId: z.string().min(1).optional(),
        content: z.string().max(10000, 'Message too long').default(''),
        courseId: z.string().min(1, 'Course ID is required'),
        groupId: z.string().min(1, 'Group ID is required'),
        replyTo: z.object({
            messageId: z.string(),
            senderId: z.string(),
            senderName: z.string(),
            content: z.string(),
        }).optional(),
        attachments: z.array(z.object({
            id: z.string(),
            name: z.string(),
            type: z.string(),
            size: z.number(),
            url: z.string(),
            previewUrl: z.string().optional(),
        })).max(10, 'Maximum 10 attachments allowed').optional(),
        mentions: z.array(z.string()).max(50, 'Maximum 50 mentions allowed').optional(),
    })
    .refine(
        (data) => data.content.trim().length > 0 || (data.attachments && data.attachments.length > 0),
        {
            message: 'Message must have content or at least one attachment',
            path: ['content'],
        },
    );

export const typingSchema = z.object({
    roomId: z.string().min(1, 'Room ID is required'),
    isTyping: z.boolean(),
});

export const deleteMessageSchema = z.object({
    messageId: z.string().min(1, 'Message ID is required'),
    roomId: z.string().min(1, 'Room ID is required'),
});

export const loadMoreMessagesSchema = z.object({
    chatSpaceId: z.string().uuid('Invalid chat space ID'),
    beforeMessageId: z
        .string()
        .regex(/^[a-fA-F0-9]{24}$/, 'Invalid message ID'),
    limit: z.number().int().min(1).max(100).optional().default(50),
});

export function emitValidationError(
    socket: Pick<Socket, 'emit'>,
    event: string,
    issues: Array<{ path: (string | number)[]; message: string }>
): void {
    socket.emit('validation_error', {
        event,
        details: issues.map(issue => ({
            field: issue.path.join('.') || 'unknown',
            message: issue.message,
        })),
    });
}
