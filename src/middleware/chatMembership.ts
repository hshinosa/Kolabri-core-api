import { Response, NextFunction } from "express";
import { ChatLog } from "../models/ChatLog.js";
import prisma from "../config/database.js";
import { logger } from "../utils/logger.js";
import { AuthenticatedRequest } from "./auth.js";
import { conversationIdSchema } from "../validators/chat.validator.js";

/**
 * Middleware: verify the authenticated user is a member of the group
 * that owns the session discussion / message being accessed.
 * Resolves sessionDiscussionId from:
 *   - req.query.conversation_id (search/pinned endpoints)
 *   - req.params.id (pin/unpin/topic endpoints - message ID, look up ChatLog.groupId)
 */
export async function assertChatMembership(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
    }

    let groupId: string | null = null;

    // Case 1: conversation_id in query (search, pinned messages)
    const rawConversationId = req.query.conversation_id;
    if (
      rawConversationId !== undefined &&
      rawConversationId !== null &&
      rawConversationId !== ""
    ) {
      // Express' extended query parser turns `conversation_id[$in][]=...`
      // into an object/array. Reject anything that is not a plain UUID
      // string BEFORE it reaches a Mongo filter (NoSQL operator injection).
      const parsedConversationId =
        conversationIdSchema.safeParse(rawConversationId);
      if (!parsedConversationId.success) {
        return res.status(400).json({
          error: {
            code: "BAD_REQUEST",
            message: "conversation_id must be a valid UUID string",
          },
        });
      }

      const conversationId = parsedConversationId.data;
      const sample = await ChatLog.findOne({
        sessionDiscussionId: conversationId,
        deletedAt: null,
      })
        .select("groupId")
        .lean();
      groupId = sample?.groupId || null;
    }

    // Case 2: message ID in params (pin, unpin, topic)
    if (!groupId && req.params.id) {
      const message = await ChatLog.findById(req.params.id)
        .select("groupId sessionDiscussionId")
        .lean();
      if (!message) {
        return res
          .status(404)
          .json({ error: { code: "NOT_FOUND", message: "Message not found" } });
      }
      groupId = message.groupId;
      // Also attach sessionDiscussionId to request for downstream use
      req.sessionDiscussionId = message.sessionDiscussionId;
    }

    if (!groupId) {
      return res.status(400).json({
        error: {
          code: "BAD_REQUEST",
          message: "conversation_id or message id required",
        },
      });
    }

    // Verify group membership via Prisma (PostgreSQL)
    const membership = await prisma.groupMember.findFirst({
      where: {
        groupId: groupId,
        userId: userId,
      },
    });

    // Also allow lecturers who own the course containing this group
    if (!membership) {
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        select: { course: { select: { ownerId: true } } },
      });

      if (group?.course?.ownerId === userId) {
        // Lecturer owns the course - allow access
        req.groupId = groupId;
        return next();
      }

      logger.warn("Unauthorized chat REST access attempt", {
        userId,
        groupId,
        path: req.path,
        method: req.method,
      });

      return res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "Not authorized to access this chat",
        },
      });
    }

    req.groupId = groupId;
    next();
  } catch (error) {
    logger.error("Chat membership assertion failed", {
      error: (error as Error).message,
    });
    next(error);
  }
}
