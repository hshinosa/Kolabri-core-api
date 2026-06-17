 import { Router } from 'express';
 import mongoose from 'mongoose';
 import { verifyToken } from '../middleware/auth.js';
 import { assertChatMembership } from '../middleware/chatMembership.js';
 import { ChatLog } from '../models/ChatLog.js';
 
 const router = Router();
 
 const isValidObjectId = (id: string): boolean => mongoose.Types.ObjectId.isValid(id);
 
 // All message routes require auth
 router.use(verifyToken);
 
 // All message routes require chat membership verification
 router.use(assertChatMembership);
router.get('/messages/search', async (req, res, next) => {
  try {
    const { conversation_id, q, limit = '20' } = req.query as Record<string, string>;

    if (!conversation_id || !q || q.trim().length < 2) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'conversation_id and q (min 2 chars) required' } });
    }

    const messages = await ChatLog.find({
      chatSpaceId: conversation_id,
      content: { $regex: q.trim(), $options: 'i' },
      deletedAt: null,
    })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit, 10))
      .select('_id content senderName createdAt');

    const data = messages.map((m) => ({
      id: m._id.toString(),
      content: m.content,
      highlighted_content: m.content,
      sender_name: m.senderName,
      created_at: m.createdAt.toISOString(),
    }));

    res.json({
      data,
      pagination: {
        has_more: false,
        next_cursor: null,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/messages/pinned', async (req, res, next) => {
  try {
    const { conversation_id } = req.query as Record<string, string>;

    if (!conversation_id) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'conversation_id required' } });
    }

    const pinned = await ChatLog.find({
      chatSpaceId: conversation_id,
      isPinned: true,
      deletedAt: null,
    })
      .sort({ pinnedAt: -1, createdAt: -1 })
      .limit(100)
      .select('_id content senderName pinnedAt pinnedBy createdAt');

    const data = pinned.map((m) => ({
      id: m._id.toString(),
      message_id: m._id.toString(),
      conversation_id: m.chatSpaceId,
      pinned_by: m.pinnedBy || 'unknown',
      content: m.content,
      sender_name: m.senderName,
      pinned_at: (m.pinnedAt || m.createdAt).toISOString(),
    }));

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.post('/messages/:id/pin', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(404).json({ message: 'Message not found in this conversation' });
    const { conversation_id, content, sender_name } = req.body || {};
    const user = (req as any).user;

    const message = await ChatLog.findById(id);
    if (!message || message.chatSpaceId !== conversation_id) {
      return res.status(404).json({ message: 'Message not found in this conversation' });
    }

    message.isPinned = true;
    message.pinnedAt = new Date();
    message.pinnedBy = user?.userId || sender_name || 'unknown';
    await message.save();

    const pinnedData = {
      id: message._id.toString(),
      message_id: message._id.toString(),
      conversation_id: message.chatSpaceId,
      pinned_by: message.pinnedBy,
      content: message.content,
      sender_name: message.senderName,
      pinned_at: message.pinnedAt!.toISOString(),
    };

    res.json({ success: true, data: pinnedData });
  } catch (error) {
    next(error);
  }
});

router.post('/messages/:id/unpin', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(404).json({ message: 'Message not found' });

    const message = await ChatLog.findById(id);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    message.isPinned = false;
    message.pinnedAt = undefined;
    message.pinnedBy = undefined;
    await message.save();

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.delete('/messages/:id/pin', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(404).json({ message: 'Message not found' });

    const message = await ChatLog.findById(id);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    message.isPinned = false;
    message.pinnedAt = undefined;
    message.pinnedBy = undefined;
    await message.save();

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.patch('/messages/:id/topic', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(404).json({ message: 'Message not found' });
    const { topic, conversation_id } = req.body || {};

    const message = await ChatLog.findById(id);
    if (!message || message.chatSpaceId !== conversation_id) {
      return res.status(404).json({ message: 'Message not found' });
    }

    message.topic = topic && topic.trim() ? topic.trim() : undefined;
    await message.save();

    res.json({ success: true, data: { id: message._id.toString(), topic: message.topic } });
  } catch (error) {
    next(error);
  }
});

export default router;
