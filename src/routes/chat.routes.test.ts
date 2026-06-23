import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

 const { chatLogMock } = vi.hoisted(() => {
     const mockSave = vi.fn().mockImplementation(function (this: any) {
         return Promise.resolve(this);
     });
     const mockFind: any = vi.fn();
     const mockFindById: any = vi.fn(() => Promise.resolve(null));
 
     return {
         chatLogMock: {
             find: mockFind,
             findById: mockFindById,
             prototype: { save: mockSave },
         },
     };
 });
 
 vi.mock('../models/ChatLog.js', () => ({
     ChatLog: {
         find: (query: any) => chatLogMock.find(query),
         findById: (id: any) => chatLogMock.findById(id),
     },
 }));
 
 vi.mock('../middleware/chatMembership.js', () => ({
     assertChatMembership: (_req: any, _res: any, next: any) => {
         next();
     },
 }));

vi.mock('../middleware/auth.js', () => ({
    verifyToken: (req: any, _res: any, next: any) => {
        req.user = { userId: 'user-1', role: 'student' };
        next();
    },
}));

import chatRoutes from './chat.routes.js';

function makeApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/chat', chatRoutes);
    return app;
}

describe('chat.routes', () => {
    let app: express.Express;

    beforeEach(() => {
        vi.clearAllMocks();
        app = makeApp();
    });

    describe('GET /messages/search', () => {
        it('returns 400 when conversation_id is missing', async () => {
            const res = await request(app).get('/api/chat/messages/search?q=hello');
            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('BAD_REQUEST');
        });

        it('returns 400 when q is too short', async () => {
            const res = await request(app).get('/api/chat/messages/search?conversation_id=cs-1&q=a');
            expect(res.status).toBe(400);
        });

        it('returns search results for valid query', async () => {
            const mockDocs = [
                {
                    _id: { toString: () => '507f1f77bcf86cd799439011' },
                    content: 'hello world',
                    senderName: 'Alice',
                    createdAt: new Date('2026-01-01'),
                },
                {
                    _id: { toString: () => 'msg-2' },
                    content: 'hello again',
                    senderName: 'Bob',
                    createdAt: new Date('2026-01-02'),
                },
            ];

            const limitFn = vi.fn().mockReturnThis();
            const selectFn = vi.fn().mockResolvedValue(mockDocs);
            const sortFn = vi.fn(() => ({ limit: limitFn, select: selectFn }));

            chatLogMock.find.mockReturnValue({ sort: sortFn });

            const res = await request(app).get(
                '/api/chat/messages/search?conversation_id=cs-1&q=hello'
            );

            expect(res.status).toBe(200);
            expect(res.body.data).toHaveLength(2);
            expect(res.body.data[0].id).toBe('507f1f77bcf86cd799439011');
            expect(res.body.data[0].content).toBe('hello world');
            expect(res.body.data[0].sender_name).toBe('Alice');
            expect(res.body.pagination.has_more).toBe(false);
            expect(chatLogMock.find).toHaveBeenCalledWith({
                sessionDiscussionId: 'cs-1',
                content: { $regex: 'hello', $options: 'i' },
                deletedAt: null,
            });
        });

        it('handles database error gracefully', async () => {
            const sortFn = vi.fn(() => {
                throw new Error('DB error');
            });
            chatLogMock.find.mockReturnValue({ sort: sortFn });

            const res = await request(app).get(
                '/api/chat/messages/search?conversation_id=cs-1&q=hello'
            );

            expect(res.status).toBe(500);
        });
    });

    describe('GET /messages/pinned', () => {
        it('returns 400 when conversation_id is missing', async () => {
            const res = await request(app).get('/api/chat/messages/pinned');
            expect(res.status).toBe(400);
        });

        it('returns pinned messages sorted by pinnedAt descending', async () => {
            const pinnedAt = new Date('2026-06-01');
            const mockPinned = [
                {
                    _id: { toString: () => 'pin-1' },
                    content: 'Important note',
                    senderName: 'Lecturer',
                    pinnedAt,
                    pinnedBy: 'lecturer-1',
                    sessionDiscussionId: 'cs-1',
                    createdAt: new Date('2026-01-01'),
                },
            ];

            const selectFn = vi.fn().mockResolvedValue(mockPinned);
            const limitFn = vi.fn(() => ({ select: selectFn }));
            const sortFn = vi.fn(() => ({ limit: limitFn }));
            chatLogMock.find.mockReturnValue({ sort: sortFn });

            const res = await request(app).get(
                '/api/chat/messages/pinned?conversation_id=cs-1'
            );

            expect(res.status).toBe(200);
            expect(res.body.data).toHaveLength(1);
            expect(res.body.data[0].message_id).toBe('pin-1');
            expect(res.body.data[0].content).toBe('Important note');
            expect(res.body.data[0].pinned_by).toBe('lecturer-1');
            expect(chatLogMock.find).toHaveBeenCalledWith({
                sessionDiscussionId: 'cs-1',
                isPinned: true,
                deletedAt: null,
            });
        });

        it('returns pinned_by as "unknown" when not set', async () => {
            const mockPinned = [
                {
                    _id: { toString: () => 'pin-1' },
                    content: 'test',
                    senderName: 'Alice',
                    pinnedAt: null,
                    pinnedBy: null as string | null,
                    sessionDiscussionId: 'cs-1',
                    createdAt: new Date('2026-01-01'),
                },
            ];

            const selectFn = vi.fn().mockResolvedValue(mockPinned);
            const limitFn = vi.fn(() => ({ select: selectFn }));
            const sortFn = vi.fn(() => ({ limit: limitFn }));
            chatLogMock.find.mockReturnValue({ sort: sortFn });

            const res = await request(app).get(
                '/api/chat/messages/pinned?conversation_id=cs-1'
            );

            expect(res.body.data[0].pinned_by).toBe('unknown');
        });
    });

    describe('POST /messages/:id/pin', () => {
        it('returns 404 when message not found', async () => {
            chatLogMock.findById.mockResolvedValue(null);

            const res = await request(app)
                .post('/api/chat/messages/507f1f77bcf86cd799439011/pin')
                .send({ conversation_id: 'cs-1' });

            expect(res.status).toBe(404);
        });

        it('pins a message and returns data', async () => {
            const pinnedAt = new Date('2026-06-01');
            const mockMessage = {
                _id: { toString: () => '507f1f77bcf86cd799439011' },
                content: 'Pin me',
                senderName: 'Bob',
                sessionDiscussionId: 'cs-1',
                isPinned: false,
                pinnedAt: null as Date | null,
                pinnedBy: null as string | null,
                save: vi.fn().mockImplementation(function (this: any) {
                    Object.assign(this, { isPinned: true, pinnedAt, pinnedBy: 'user-1' });
                    return Promise.resolve(this);
                }),
            };

            chatLogMock.findById.mockResolvedValue(mockMessage);

            const res = await request(app)
                .post('/api/chat/messages/507f1f77bcf86cd799439011/pin')
                .send({
                    conversation_id: 'cs-1',
                    content: 'Pin me',
                    sender_name: 'Bob',
                });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.message_id).toBe('507f1f77bcf86cd799439011');
            expect(res.body.data.pinned_by).toBe('user-1');
            expect(mockMessage.save).toHaveBeenCalled();
        });

        it('returns 404 when message does not belong to conversation', async () => {
            chatLogMock.findById.mockResolvedValue({
                sessionDiscussionId: 'cs-other',
            });

            const res = await request(app)
                .post('/api/chat/messages/507f1f77bcf86cd799439011/pin')
                .send({ conversation_id: 'cs-1' });

            expect(res.status).toBe(404);
        });
    });

    describe('POST /messages/:id/unpin', () => {
        it('returns 404 when message not found', async () => {
            chatLogMock.findById.mockResolvedValue(null);

            const res = await request(app).post('/api/chat/messages/507f1f77bcf86cd799439011/unpin');

            expect(res.status).toBe(404);
        });

        it('unpins a message', async () => {
            const mockMessage = {
                isPinned: true,
                pinnedAt: new Date(),
                pinnedBy: 'user-1',
                save: vi.fn().mockImplementation(function (this: any) {
                    Object.assign(this, { isPinned: false, pinnedAt: undefined, pinnedBy: undefined });
                    return Promise.resolve(this);
                }),
            };

            chatLogMock.findById.mockResolvedValue(mockMessage);

            const res = await request(app).post('/api/chat/messages/507f1f77bcf86cd799439011/unpin');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(mockMessage.save).toHaveBeenCalled();
        });
    });

    describe('DELETE /messages/:id/pin', () => {
        it('returns 404 when message not found', async () => {
            chatLogMock.findById.mockResolvedValue(null);

            const res = await request(app).delete('/api/chat/messages/507f1f77bcf86cd799439011/pin');

            expect(res.status).toBe(404);
        });

        it('unpins a message via DELETE', async () => {
            const mockMessage = {
                isPinned: true,
                pinnedAt: new Date(),
                pinnedBy: 'user-1',
                save: vi.fn().mockImplementation(function (this: any) {
                    Object.assign(this, { isPinned: false, pinnedAt: undefined, pinnedBy: undefined });
                    return Promise.resolve(this);
                }),
            };

            chatLogMock.findById.mockResolvedValue(mockMessage);

            const res = await request(app).delete('/api/chat/messages/507f1f77bcf86cd799439011/pin');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(mockMessage.save).toHaveBeenCalled();
        });
    });

    describe('PATCH /messages/:id/topic', () => {
        it('returns 404 when message not found', async () => {
            chatLogMock.findById.mockResolvedValue(null);

            const res = await request(app)
                .patch('/api/chat/messages/507f1f77bcf86cd799439011/topic')
                .send({ topic: 'Q1 Analysis', conversation_id: 'cs-1' });

            expect(res.status).toBe(404);
        });

        it('sets topic on a message', async () => {
            const mockMessage = {
                _id: { toString: () => '507f1f77bcf86cd799439011' },
                sessionDiscussionId: 'cs-1',
                topic: undefined as string | undefined,
                save: vi.fn().mockImplementation(function (this: any) {
                    this.topic = 'Q1 Analysis';
                    return Promise.resolve(this);
                }),
            };

            chatLogMock.findById.mockResolvedValue(mockMessage);

            const res = await request(app)
                .patch('/api/chat/messages/507f1f77bcf86cd799439011/topic')
                .send({ topic: 'Q1 Analysis', conversation_id: 'cs-1' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.topic).toBe('Q1 Analysis');
            expect(mockMessage.save).toHaveBeenCalled();
        });

        it('clears topic when given empty string', async () => {
            const mockMessage = {
                _id: { toString: () => '507f1f77bcf86cd799439011' },
                sessionDiscussionId: 'cs-1',
                topic: 'Old Topic',
                save: vi.fn().mockImplementation(function (this: any) {
                    this.topic = undefined;
                    return Promise.resolve(this);
                }),
            };

            chatLogMock.findById.mockResolvedValue(mockMessage);

            const res = await request(app)
                .patch('/api/chat/messages/507f1f77bcf86cd799439011/topic')
                .send({ topic: '   ', conversation_id: 'cs-1' });

            expect(res.status).toBe(200);
            expect(res.body.data.topic).toBeUndefined();
        });
    });
});
