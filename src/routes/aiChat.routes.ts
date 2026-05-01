import { Router } from 'express';
import { AiChatController } from '../controllers/aiChat.controller.js';
import { verifyToken, requireStudent } from '../middleware/auth.js';
import { validateBody } from '../validators/validate.js';
import { z } from 'zod';

const router = Router();

// Validation schemas
const createChatSchema = z.object({
    title: z.string().max(100).optional(),
});

const sendMessageSchema = z.object({
    content: z.string().min(1).max(10000),
});

const updateTitleSchema = z.object({
    title: z.string().min(1).max(100),
});

// All routes require authentication and student role
router.use(verifyToken);
router.use(requireStudent);

// Chat CRUD
router.post('/', validateBody(createChatSchema), AiChatController.create);
router.get('/', AiChatController.index);
router.get('/:id', AiChatController.show);
router.patch('/:id', validateBody(updateTitleSchema), AiChatController.updateTitle);
router.delete('/:id', AiChatController.delete);

// Messages
router.get('/:id/messages', AiChatController.getMessages);
router.post('/:id/messages', validateBody(sendMessageSchema), AiChatController.sendMessage);
router.post('/:id/messages/stream', validateBody(sendMessageSchema), AiChatController.streamMessage);

export default router;
