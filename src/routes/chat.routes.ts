import { Router } from "express";
import mongoose from "mongoose";
import { verifyToken } from "../middleware/auth.js";
import { assertChatMembership } from "../middleware/chatMembership.js";
import { ChatLog } from "../models/ChatLog.js";
import { validateQuery } from "../validators/validate.js";
import {
  chatPinnedQuerySchema,
  chatSearchQuerySchema,
  type ChatSearchQuery,
} from "../validators/chat.validator.js";
import { escapeRegExp } from "../utils/regex.js";

const router = Router();

const isValidObjectId = (id: string): boolean =>
  mongoose.Types.ObjectId.isValid(id);

// All message routes require auth
router.use(verifyToken);

// Semua route pesan memasang `assertChatMembership` PER ROUTE (bukan
// router.use): middleware route-level masih memiliki `req.params.id`,
// sehingga `GET /messages/:id` bisa resolve membership dari message tsb
// (router.use membuat param kosong →400 → F1 regresi M9).
// Middleware juga menolak `conversation_id` non-string/non-UUID (NoSQL).

router.get(
  "/messages/search",
  assertChatMembership,
  // Type + length validation: object/array `conversation_id` and oversized `q`
  // are rejected with 400 before reaching the Mongo filter.
  validateQuery(chatSearchQuerySchema),
  async (req, res, next) => {
    try {
      const { conversation_id, q, limit } =
        req.query as unknown as ChatSearchQuery;

      const messages = await ChatLog.find({
        sessionDiscussionId: conversation_id,
        // `q` is user input compiled by MongoDB: escape it so metacharacters
        // stay literal (no wildcard bypass, no ReDoS, no 500 on `[a-`).
        content: { $regex: escapeRegExp(q), $options: "i" },
        deletedAt: null,
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .select("_id content senderName createdAt");

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
  },
);

router.get(
  "/messages/pinned",
  assertChatMembership,
  validateQuery(chatPinnedQuerySchema),
  async (req, res, next) => {
    try {
      const { conversation_id } = req.query as unknown as {
        conversation_id: string;
      };

      const pinned = await ChatLog.find({
        sessionDiscussionId: conversation_id,
        isPinned: true,
        deletedAt: null,
      })
        .sort({ pinnedAt: -1, createdAt: -1 })
        .limit(100)
        .select("_id content senderName pinnedAt pinnedBy createdAt");

      const data = pinned.map((m) => ({
        id: m._id.toString(),
        message_id: m._id.toString(),
        conversation_id: m.sessionDiscussionId,
        pinned_by: m.pinnedBy || "unknown",
        content: m.content,
        sender_name: m.senderName,
        pinned_at: (m.pinnedAt || m.createdAt).toISOString(),
      }));

      res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

router.post("/messages/:id/pin", assertChatMembership, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id))
      return res
        .status(404)
        .json({ message: "Message not found in this conversation" });
    const { conversation_id, content, sender_name } = req.body || {};
    const user = (req as any).user;

    const message = await ChatLog.findById(id);
    if (!message || message.sessionDiscussionId !== conversation_id) {
      return res
        .status(404)
        .json({ message: "Message not found in this conversation" });
    }

    message.isPinned = true;
    message.pinnedAt = new Date();
    message.pinnedBy = user?.userId || sender_name || "unknown";
    await message.save();

    const pinnedData = {
      id: message._id.toString(),
      message_id: message._id.toString(),
      conversation_id: message.sessionDiscussionId,
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

router.post("/messages/:id/unpin", assertChatMembership, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id))
      return res.status(404).json({ message: "Message not found" });

    const message = await ChatLog.findById(id);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
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

router.delete("/messages/:id/pin", assertChatMembership, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id))
      return res.status(404).json({ message: "Message not found" });

    const message = await ChatLog.findById(id);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
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

router.patch("/messages/:id/topic", assertChatMembership, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id))
      return res.status(404).json({ message: "Message not found" });
    const { topic, conversation_id } = req.body || {};

    const message = await ChatLog.findById(id);
    if (!message || message.sessionDiscussionId !== conversation_id) {
      return res.status(404).json({ message: "Message not found" });
    }

    message.topic = topic && topic.trim() ? topic.trim() : undefined;
    await message.save();

    res.json({
      success: true,
      data: { id: message._id.toString(), topic: message.topic },
    });
  } catch (error) {
    next(error);
  }
});

// M9: fetch a single message (ownership + conversation binding checks).
// `assertChatMembership` above already resolved membership from the message's
// REAL conversation, so this endpoint cannot be used to read foreign chats.
router.get("/messages/:id", assertChatMembership, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id))
      return res.status(404).json({ message: "Message not found" });

    const message = await ChatLog.findById(id);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    res.json({
      data: {
        id: message._id.toString(),
        conversation_id: message.sessionDiscussionId,
        group_id: message.groupId,
        course_id: message.courseId,
        sender_id: message.senderId,
        sender_name: message.senderName,
        sender_type: message.senderType,
        content: message.content,
        version: message.version,
        created_at: message.createdAt
          ? message.createdAt.toISOString()
          : null,
        edited_at: message.editedAt ? message.editedAt.toISOString() : null,
        deleted_at: message.deletedAt ? message.deletedAt.toISOString() : null,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
