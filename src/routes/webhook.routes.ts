import { Router, Request, Response } from 'express';
import prisma from '../config/database.js';
import { ChatLog } from '../models/ChatLog.js';
import { getIO } from '../socket/index.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.post('/ai-intervention', async (req: Request, res: Response) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.CORE_API_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { groupId, message, type, metadata } = req.body;
    if (!groupId || !message) {
        return res.status(400).json({ error: 'groupId and message are required' });
    }

    try {
        const io = getIO();
        if (!io) {
            return res.status(503).json({ error: 'Socket.IO not initialized' });
        }

        const group = await prisma.group.findFirst({
            where: { id: groupId, deletedAt: null },
            include: {
                course: { select: { id: true } },
                chatSpaces: {
                    where: { closedAt: null },
                    select: { id: true },
                },
            },
        });

        if (!group) {
            return res.status(404).json({ error: 'Group not found' });
        }

        let delivered = 0;
        for (const chatSpace of group.chatSpaces) {
            const roomId = `course_${group.course.id}_group_${groupId}_space_${chatSpace.id}`;

            const chatLog = new ChatLog({
                courseId: group.course.id,
                groupId,
                chatSpaceId: chatSpace.id,
                senderId: 'ai',
                senderName: 'AI Assistant',
                senderType: 'ai',
                content: message,
                isIntervention: true,
            });
            await chatLog.save();

            io.to(roomId).emit('receive_message', {
                id: chatLog._id?.toString(),
                senderId: 'ai',
                senderName: 'AI Assistant',
                senderType: 'ai',
                content: message,
                isIntervention: true,
                interventionType: type,
                createdAt: chatLog.createdAt.toISOString(),
            });

            io.to(roomId).emit('quality_intervention', {
                chatSpaceId: chatSpace.id,
                interventionType: type,
                metadata: metadata || {},
                timestamp: new Date().toISOString(),
            });

            delivered++;
        }

        logger.info(`AI intervention delivered to ${delivered} rooms for group ${groupId}`);
        return res.json({ success: true, delivered });
    } catch (error) {
        logger.error('Webhook ai-intervention error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
