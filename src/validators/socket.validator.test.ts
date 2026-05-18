import { describe, expect, it, vi } from 'vitest';
import { sendMessageSchema, emitValidationError } from './socket.validator.js';

describe('sendMessageSchema', () => {
    const baseValid = {
        roomId: 'room-1',
        content: 'Hello world',
        courseId: 'course-1',
        groupId: 'group-1',
    };

    it('accepts a non-empty content message', () => {
        const result = sendMessageSchema.safeParse(baseValid);
        expect(result.success).toBe(true);
    });

    it('accepts a message with no content but with attachments', () => {
        const result = sendMessageSchema.safeParse({
            ...baseValid,
            content: '',
            attachments: [
                { id: 'a1', name: 'file.png', type: 'image/png', size: 1024, url: 'http://x/a.png' },
            ],
        });
        expect(result.success).toBe(true);
    });

    it('rejects when content is whitespace only and there are no attachments', () => {
        const result = sendMessageSchema.safeParse({ ...baseValid, content: '   ' });
        expect(result.success).toBe(false);
        if (!result.success) {
            const msg = result.error.issues.map((i) => i.message).join(' ');
            expect(msg).toContain('Message must have content or at least one attachment');
        }
    });

    it('rejects when content is empty and attachments is an empty array', () => {
        const result = sendMessageSchema.safeParse({
            ...baseValid,
            content: '',
            attachments: [],
        });
        expect(result.success).toBe(false);
    });

    it('rejects content over 10000 characters', () => {
        const result = sendMessageSchema.safeParse({
            ...baseValid,
            content: 'a'.repeat(10001),
        });
        expect(result.success).toBe(false);
    });
});

describe('emitValidationError', () => {
    it('emits a validation_error event with mapped issues', () => {
        const emit = vi.fn();
        emitValidationError({ emit }, 'send_message', [
            { path: ['content'], message: 'Empty' },
            { path: ['attachments', 0, 'size'], message: 'Too big' },
        ]);
        expect(emit).toHaveBeenCalledWith('validation_error', {
            event: 'send_message',
            details: [
                { field: 'content', message: 'Empty' },
                { field: 'attachments.0.size', message: 'Too big' },
            ],
        });
    });
});
