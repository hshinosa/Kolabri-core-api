import { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { logger } from "../utils/logger.js";
import { ChatLog } from "../models/ChatLog.js";
import { SilenceEvent } from "../models/SilenceEvent.js";
import mongoose from "mongoose";
import prisma from "../config/database.js";
import {
  aiEngineService,
  type CitationPayload,
} from "../services/aiEngine.service.js";
import { WeekContextService } from "../services/weekContext.service.js";
import {
  filterCitationsForSession,
  allowedMaterialsForCourseMaxWeek,
} from "../utils/citationFilter.js";
import { DiscussionDirectionService } from "../services/discussion-direction.service.js";
import { pickRateEvent, socketRateLimiter } from "../utils/socketRateLimiter.js";
import {
  sanitizeMessageContent,
  sanitizeAttachments,
} from "../utils/sanitize.js";
import { setSocketEmitter } from "../utils/socketEmitter.js";
import { getRedis } from "../config/redis.js";
import { createAdapter } from "@socket.io/redis-adapter";
import { invalidateDashboardCache } from "../services/dashboard.service.js";
import { debouncedInvalidateDashboard } from "../utils/debouncedInvalidation.js";
import type { AuthenticatedSocket, ChatHistoryItem } from "./types.js";
import { authMiddleware } from "./auth.js";
import { analyzeEngagement } from "./engagement.js";
import {
  joinRoomSchema,
  sendMessageSchema,
  typingSchema,
  deleteMessageSchema,
  loadMoreMessagesSchema,
  emitValidationError,
} from "../validators/socket.validator.js";

// Store silence timers per room
const silenceTimers = new Map<string, NodeJS.Timeout>();
import {
  SILENCE_TIMEOUT_MS,
  INTERVENTION_COOLDOWN_MS,
  MESSAGES_BEFORE_CHECK,
  incrementMessageCount,
  shouldRunQualityCheck,
  tryAcquireSilenceLock,
} from "./interventionGate.js";
import {
  registerPresence,
  trackUserInRoom,
  listUsersInRoom,
} from "./presence.js";
import { registerDeleteMessage, registerEditMessage } from "./messages.js";
import { runSilenceIntervention } from "./interventions.js";
import {
  isStagedEscalationEnabled,
  findOrCreateState,
  advanceStage,
  shouldNotifyLecturer,
  markNotificationSent,
} from "../services/escalation.service.js";
import type {
  StreamEvent,
  OrchestrationResponse,
} from "../services/aiEngine.service.js";

// PERF-AI-01: NO_FETCH eligibility — mirrors rag.py _should_retrieve() logic.
// If true, the query skips retrieval and can be streamed token-by-token.
const NO_FETCH_SKIP_PATTERNS = [
  "halo",
  "hai",
  "hi",
  "hello",
  "terima kasih",
  "thanks",
  "ok",
  "oke",
  "baik",
  "siap",
  "mantap",
  "good",
  "nice",
  "selamat pagi",
  "selamat siang",
  "selamat malam",
];
const NO_FETCH_MIN_WORDS = 3;

export function isNoFetchEligible(query: string): boolean {
  const queryLower = query.toLowerCase().trim();
  if (NO_FETCH_SKIP_PATTERNS.includes(queryLower)) return true;
  const wordCount = query.split(/\s+/).filter(Boolean).length;
  if (wordCount < NO_FETCH_MIN_WORDS) return true;
  for (const pattern of NO_FETCH_SKIP_PATTERNS) {
    if (queryLower.startsWith(pattern) && wordCount <= 5) return true;
  }
  return false;
}

// Track last intervention time per room to avoid spamming
const lastInterventionTime = new Map<string, number>();
const roomMessageCount = new Map<string, number>();

// Track pending message classifications per sessionDiscussion for batch processing
const pendingClassifications = new Map<
  string,
  {
    timer: NodeJS.Timeout | null;
    messages: Array<{ id: string; content: string }>;
  }
>();

// Quality thresholds for intervention
import { QUALITY_THRESHOLDS, decideQualityIntervention } from "./engagement.js";

// Intervention messages pool
import {
  INTERVENTION_MESSAGES,
  QUALITY_INTERVENTIONS,
  pickRandom,
} from "./interventionMessages.js";

let io: Server;

async function processBatchClassification(
  sessionDiscussionId: string,
): Promise<void> {
  const pending = pendingClassifications.get(sessionDiscussionId);
  if (!pending || pending.messages.length === 0) {
    return;
  }

  try {
    const sessionDiscussion = await prisma.sessionDiscussion.findUnique({
      where: { id: sessionDiscussionId },
      select: {
        goals: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { content: true },
        },
      },
    });

    const goalText = sessionDiscussion?.goals?.[0]?.content?.trim();
    if (!goalText) {
      pendingClassifications.delete(sessionDiscussionId);
      return;
    }

    const classifications = await DiscussionDirectionService.classifyMessages(
      pending.messages,
      goalText,
    );

    const updatePromises = classifications.map(({ messageId, isRelevant }) =>
      ChatLog.findByIdAndUpdate(messageId, { isRelevant }),
    );
    await Promise.all(updatePromises);

    io.to(sessionDiscussionId).emit("message_classified", { classifications });

    pendingClassifications.delete(sessionDiscussionId);
  } catch (error) {
    logger.error("Batch classification error:", error);
    pendingClassifications.delete(sessionDiscussionId);
  }
}

function socketDisplayName(socket: AuthenticatedSocket): string {
  const email = socket.user?.email?.trim();
  if (email) return email.split("@")[0];
  return socket.user?.userId ?? "user";
}

export function initSocketIO(server: HttpServer): Server {
  const allowedOrigins = [
    process.env.CLIENT_URL || "http://localhost:8080",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://[::1]:5173",
  ];

  io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ["polling", "websocket"],
  });

  setSocketEmitter({
    emit: (room, event, payload) => {
      io.to(room).emit(event, payload);
    },
  });

  const redis = getRedis();
  if (redis) {
    const pubClient = redis.duplicate();
    const subClient = redis.duplicate();
    io.adapter(createAdapter(pubClient, subClient));
    logger.info("Socket.IO Redis adapter active");
  }

  // Authentication middleware
  io.use(authMiddleware);

  // Connection handler
  io.on("connection", (socket: AuthenticatedSocket) => {
    logger.info(`User connected: ${socket.user?.userId} (${socket.id})`);

    // Join room (by sessionDiscussion)
    socket.on(
      "join_room",
      async (data: {
        courseId: string;
        groupId: string;
        sessionDiscussionId: string;
      }) => {
        if (!socketRateLimiter.isAllowed(socket.id, "join_room")) {
          const violations = socketRateLimiter.recordViolation(socket.id);
          socket.emit("rate_limit_exceeded", {
            event: "join_room",
            retryAfter: socketRateLimiter.getRetryAfter(socket.id, "join_room"),
            message: "Too many join requests.",
          });
          if (violations >= socketRateLimiter.disconnectThreshold)
            socket.disconnect(true);
          return;
        }
        const joinParsed = joinRoomSchema.safeParse(data);
        if (!joinParsed.success) {
          emitValidationError(socket, "join_room", joinParsed.error.issues);
          return;
        }
        try {
          const { courseId, groupId, sessionDiscussionId } = joinParsed.data;

          if (!socket.user) {
            socket.emit("server_error", { message: "Not authenticated" });
            return;
          }

          // Verify user has access to the group
          const hasAccess = await verifyGroupAccess(
            socket.user.userId,
            socket.user.role,
            groupId,
            courseId,
          );

          if (!hasAccess) {
            socket.emit("server_error", {
              message: "Access denied to this group",
            });
            return;
          }

          // Verify session discussion belongs to the group
          const sessionDiscussion = await prisma.sessionDiscussion.findFirst({
            where: { id: sessionDiscussionId, groupId },
          });

          if (!sessionDiscussion) {
            socket.emit("server_error", {
              message: "Session discussion not found",
            });
            return;
          }

          // Enforce pre-read + goal gates for students (mirrors the BFF chatRoom gate;
          // lecturers/admins monitor freely). Closed sessions skip the gates.
          if (socket.user.role === "student" && !sessionDiscussion.closedAt) {
            if (sessionDiscussion.weekId) {
              const preRead =
                await prisma.sessionDiscussionPreReadCompletion.findUnique({
                  where: {
                    userId_sessionDiscussionId: {
                      userId: socket.user.userId,
                      sessionDiscussionId,
                    },
                  },
                  select: { id: true },
                });
              if (!preRead) {
                socket.emit("server_error", {
                  message: "Selesaikan pre-read sebelum masuk sesi diskusi",
                  code: "PRE_READ_REQUIRED",
                });
                return;
              }
            }

            // Goal BERSAMA per sesi (satu baris utk seluruh kelompok) —
            // dulu dipakai per-user tapi model bisnis tidak membuat baris
            // per anggota, jadi anggota non-pembuat terkunci (regresi F2).
            const goal = await prisma.learningGoal.findFirst({
              where: { sessionDiscussionId },
              select: { id: true },
            });
            if (!goal) {
              socket.emit("server_error", {
                message:
                  "Tetapkan tujuan pembelajaran sebelum masuk sesi diskusi",
                code: "GOAL_REQUIRED",
              });
              return;
            }
          }

          // Use sessionDiscussionId as roomId for message separation per session
          const roomId = sessionDiscussionId;
          socket.join(roomId);
          socket.join(`course:${courseId}`); // PERF: Join course-level room for scoped broadcasts (HIGH-03)
          socket.currentRoom = roomId; // Track for disconnect cleanup

          // Load chat history from MongoDB for this specific session discussion
          const chatHistory = await ChatLog.find({
            sessionDiscussionId,
            deletedAt: null,
          })
            .sort({ createdAt: 1 })
            .limit(100)
            .lean<ChatHistoryItem[]>();

          // If this is a fresh session discussion (no messages yet), send welcome message with goal
          if (chatHistory.length === 0) {
            // Get the single shared goal for this session discussion
            const goal = await prisma.learningGoal.findFirst({
              where: { sessionDiscussionId },
              select: { content: true },
            });

            // Create welcome message content
            let welcomeContent = `🎯 **Selamat datang di sesi diskusi "${sessionDiscussion.name}"!**\n\n`;

            if (goal) {
              welcomeContent += `📚 **Tujuan Pembelajaran:**\n`;
              welcomeContent += `${goal.content}\n`;
              welcomeContent += `\nSelamat berdiskusi! Fokus pada tujuan di atas dan bantu satu sama lain untuk memahami materi. 💪`;
            } else {
              welcomeContent += `Belum ada tujuan pembelajaran yang ditetapkan untuk sesi ini.\nSilakan mulai berdiskusi dengan anggota kelompok Anda!`;
            }

            // Save welcome message to MongoDB
            const welcomeMessage = new ChatLog({
              courseId,
              groupId,
              sessionDiscussionId,
              senderId: "system",
              senderName: "Kolabri",
              senderType: "system",
              content: welcomeContent,
              isIntervention: false,
            });
            await welcomeMessage.save();

            // Add welcome message to chat history for sending
            chatHistory.push({
              _id: welcomeMessage._id,
              courseId,
              groupId,
              sessionDiscussionId,
              senderId: "system",
              senderName: "Kolabri",
              senderType: "system" as const,
              content: welcomeContent,
              isIntervention: false,
              deletedAt: undefined,
              attachments: [],
              mentions: [],
              createdAt: welcomeMessage.createdAt,
            });
          }

          // Send chat history to the user
          const historyMessages = chatHistory.map((msg) => ({
            id: msg._id?.toString(),
            senderId: msg.senderId,
            senderName: msg.senderName,
            senderType: msg.senderType,
            content: msg.content,
            isIntervention: msg.isIntervention,
            replyTo: msg.replyTo
              ? {
                  messageId: msg.replyTo.messageId,
                  senderId: msg.replyTo.senderId,
                  senderName: msg.replyTo.senderName,
                  content: msg.replyTo.content,
                }
              : undefined,
            attachments: msg.attachments || [],
            mentions: msg.mentions || [],
            guardrailOutcome: msg.guardrailOutcome ?? undefined,
            guardrailReason: msg.guardrailReason ?? undefined,
            interventionType: msg.interventionType ?? undefined,
            interventionReason: msg.interventionReason ?? undefined,
            scaffoldingLevel: msg.scaffoldingLevel ?? undefined,
            isRelevant: msg.isRelevant ?? undefined,
            citations: msg.citations?.length ? msg.citations : undefined,
            editedAt: msg.editedAt ? msg.editedAt.toISOString() : null,
            createdAt: msg.createdAt.toISOString(),
          }));

          socket.emit("chat_history", { messages: historyMessages });

          const userName = socketDisplayName(socket);

          // Notify room about new user joining
          socket.to(roomId).emit("user_joined", {
            userId: socket.user.userId,
            userName,
          });

          await trackUserInRoom(roomId, {
            userId: socket.user.userId,
            userName,
            socketId: socket.id,
          });

          socket.emit("online_users", { users: await listUsersInRoom(roomId) });

          // Send room joined confirmation
          socket.emit("room_joined", {
            roomId,
            courseId,
            groupId,
            sessionDiscussionId,
          });

          debouncedInvalidateDashboard(); // HIGH-04: Debounced to prevent cache thrashing

          // Start silence timer if not exists
          startSilenceTimer(roomId, courseId, groupId, sessionDiscussionId);

          logger.info(`User ${socket.user.userId} joined room ${roomId}`);
        } catch (error) {
          logger.error("Join room error:", error);
          socket.emit("server_error", { message: "Failed to join room" });
        }
      },
    );

    // Send message (with optional reply, attachments, and mentions)
    socket.on(
      "send_message",
      async (data: {
        roomId: string;
        clientId?: string;
        content: string;
        courseId: string;
        groupId: string;
        replyTo?: {
          messageId: string;
          senderId: string;
          senderName: string;
          content: string;
        };
        attachments?: Array<{
          id: string;
          name: string;
          type: string;
          size: number;
          url: string;
          previewUrl?: string;
        }>;
        mentions?: string[];
      }) => {
        // Pesan ber-mention @ai memakai limit TERPISAH yang lebih longgar
        // (SOCKET_AI_RATE_MAX, default 180/menit) — kuota harian AI tetap
        // menjadi batas utama pemakaian AI.
        const rateEvent = pickRateEvent(data.content);
        if (!socketRateLimiter.isAllowed(socket.id, rateEvent)) {
          const violations = socketRateLimiter.recordViolation(socket.id);
          socket.emit("rate_limit_exceeded", {
            event: rateEvent,
            retryAfter: socketRateLimiter.getRetryAfter(socket.id, rateEvent),
            message: "Too many messages. Please slow down.",
          });
          if (violations >= socketRateLimiter.disconnectThreshold)
            socket.disconnect(true);
          return;
        }
        const msgParsed = sendMessageSchema.safeParse(data);
        if (!msgParsed.success) {
          emitValidationError(socket, "send_message", msgParsed.error.issues);
          return;
        }
        try {
          const {
            roomId,
            clientId,
            content,
            courseId,
            groupId,
            replyTo,
            attachments,
            mentions,
          } = msgParsed.data;

          if (!socket.user) {
            socket.emit("server_error", { message: "Not authenticated" });
            return;
          }

          // roomId is sessionDiscussionId
          const sessionDiscussionId = roomId;

          const sessionDiscussionRecord =
            await prisma.sessionDiscussion.findFirst({
              where: { id: sessionDiscussionId, deletedAt: null },
              select: {
                id: true,
                closedAt: true,
                groupId: true,
                group: { select: { courseId: true, deletedAt: true } },
              },
            });

          if (
            !sessionDiscussionRecord ||
            sessionDiscussionRecord.group?.deletedAt
          ) {
            socket.emit("server_error", {
              message: "Session discussion not found",
            });
            return;
          }

          const authoritativeGroupId = sessionDiscussionRecord.groupId;
          const authoritativeCourseId = sessionDiscussionRecord.group.courseId;

          if (
            courseId !== authoritativeCourseId ||
            groupId !== authoritativeGroupId
          ) {
            logger.warn(
              `send_message payload tampering: client claimed courseId=${courseId} groupId=${groupId} but sessionDiscussion ${sessionDiscussionId} resolves to courseId=${authoritativeCourseId} groupId=${authoritativeGroupId}`,
            );
          }

          if (!socket.rooms.has(sessionDiscussionId)) {
            socket.emit("server_error", {
              message: "You must join the room before sending messages",
            });
            return;
          }

          const hasAccess = await verifyGroupAccess(
            socket.user.userId,
            socket.user.role,
            authoritativeGroupId,
            authoritativeCourseId,
          );
          if (!hasAccess) {
            socket.emit("server_error", {
              message: "Access denied to this room",
            });
            return;
          }

          if (sessionDiscussionRecord.closedAt) {
            socket.emit("session_closed", {
              sessionDiscussionId,
              closedAt: sessionDiscussionRecord.closedAt.toISOString(),
              message: "Sesi diskusi ini telah ditutup.",
            });
            return;
          }

          // Get user details
          const user = await prisma.user.findFirst({
            where: { id: socket.user.userId, deletedAt: null },
            select: { id: true, name: true, role: true },
          });

          if (!user) {
            socket.emit("server_error", { message: "User not found" });
            return;
          }

          let safeContent: string;
          try {
            safeContent = sanitizeMessageContent(content.trim());
          } catch {
            socket.emit("server_error", {
              message: "Message content too large",
            });
            return;
          }
          if (
            safeContent.trim().length === 0 &&
            (!attachments || attachments.length === 0)
          ) {
            socket.emit("server_error", {
              message: "Message must have content or at least one attachment",
            });
            return;
          }
          const safeAttachments = sanitizeAttachments(attachments);

          const engagement = analyzeEngagement(safeContent);

          const chatLog = new ChatLog({
            courseId: authoritativeCourseId,
            groupId: authoritativeGroupId,
            sessionDiscussionId,
            senderId: user.id,
            senderName: user.name,
            senderType: user.role as "student" | "lecturer",
            content: safeContent,
            isIntervention: false,
            replyTo: replyTo
              ? {
                  messageId: replyTo.messageId,
                  senderId: replyTo.senderId,
                  senderName: replyTo.senderName,
                  content: sanitizeMessageContent(replyTo.content).substring(
                    0,
                    100,
                  ),
                }
              : undefined,
            attachments: safeAttachments,
            mentions: mentions || [],
            engagement,
          });
          await chatLog.save();

          const messageId = chatLog._id?.toString();
          if (messageId) {
            let pending = pendingClassifications.get(sessionDiscussionId);
            if (!pending) {
              pending = { timer: null, messages: [] };
              pendingClassifications.set(sessionDiscussionId, pending);
            }

            pending.messages.push({ id: messageId, content: safeContent });

            if (pending.timer) {
              clearTimeout(pending.timer);
            }

            pending.timer = setTimeout(() => {
              processBatchClassification(sessionDiscussionId).catch((err) => {
                logger.error("Batch classification failed:", err);
              });
            }, 5000);
          }

          aiEngineService
            .analyzeEngagement(safeContent, undefined)
            .then(async (aiEngagement) => {
              if (
                aiEngagement.success &&
                aiEngagement.engagement_type !== "unknown"
              ) {
                await ChatLog.findByIdAndUpdate(chatLog._id, {
                  "engagement.lexicalVariety": Math.round(
                    aiEngagement.lexical_variety * 100,
                  ),
                  "engagement.isHigherOrder": aiEngagement.is_higher_order,
                  "engagement.engagementType":
                    aiEngagement.engagement_type.toLowerCase() as
                      "cognitive" | "behavioral" | "emotional",
                });
              }
            })
            .catch((error) => {
              logger.error("AI engagement analysis failed", {
                userId: user.id,
                sessionDiscussionId,
                error: error instanceof Error ? error.message : "Unknown error",
              });
            });

          aiEngineService
            .trackActivity(authoritativeGroupId, user.id)
            .catch((error) => {
              logger.error("AI activity tracking failed", {
                userId: user.id,
                groupId: authoritativeGroupId,
                sessionDiscussionId,
                error: error instanceof Error ? error.message : "Unknown error",
                label: "retry_failed",
              });
            });

          const message = {
            id: chatLog._id?.toString(),
            clientId,
            senderId: user.id,
            senderName: user.name,
            senderType: user.role,
            content: safeContent,
            replyTo: chatLog.replyTo,
            attachments: chatLog.attachments,
            mentions: chatLog.mentions,
            isRelevant: chatLog.isRelevant ?? undefined,
            createdAt: chatLog.createdAt.toISOString(),
          };

          io.to(sessionDiscussionId).emit("receive_message", message);
          debouncedInvalidateDashboard(); // HIGH-04: Debounced to prevent cache thrashing
          io.to(`course:${authoritativeCourseId}`).emit("activity_feed", {
            id: chatLog._id?.toString(),
            senderName: user.name,
            senderType: user.role,
            content: safeContent.substring(0, 150),
            courseId: authoritativeCourseId,
            groupId: authoritativeGroupId,
            sessionDiscussionId,
            createdAt: chatLog.createdAt.toISOString(),
          }); // PERF: Scoped broadcast to course members only (HIGH-03)

          resetSilenceTimer(
            sessionDiscussionId,
            authoritativeCourseId,
            authoritativeGroupId,
            sessionDiscussionId,
          );

          if (isStagedEscalationEnabled() && user.role === "student") {
            try {
              const silenceState = await findOrCreateState(
                authoritativeCourseId,
                authoritativeGroupId,
                sessionDiscussionId,
                "silence",
              );
              if (
                silenceState.currentStage !== "resolved" &&
                silenceState.currentStage !== "new"
              ) {
                await advanceStage(
                  silenceState,
                  "resolved",
                  "Student resumed discussion after silence",
                  "quality_check",
                );
              }
            } catch (e) {
              logger.debug("Auto-resolve silence escalation failed:", e);
            }
          }

          if (safeContent.toLowerCase().includes("@ai")) {
            handleAIQuestion(
              sessionDiscussionId,
              authoritativeCourseId,
              authoritativeGroupId,
              sessionDiscussionId,
              safeContent,
              user.id,
            );
          } else {
            // SRL Zimmerman: klasifikasi pesan biasa supaya analitik dosen
            // (forethought/performance/reflection) tidak hanya berisi pesan @ai.
            // Fire-and-forget — tidak menambah latensi chat.
            aiEngineService
              .classifySrl({
                message: safeContent,
                group_id: authoritativeGroupId,
                chat_room_id: sessionDiscussionId,
                user_id: user.id,
              })
              .catch((err) => {
                logger.debug(
                  "SRL classify fire-and-forget failed:",
                  err instanceof Error ? err.message : err,
                );
              });
          }

          // Check discussion quality and intervene if needed (async, non-blocking)
          checkAndIntervenForQuality(
            roomId,
            authoritativeCourseId,
            authoritativeGroupId,
            sessionDiscussionId,
          ).catch((err) => {
            const message =
              err instanceof Error ? err.message : "Unknown error";
            logger.error("Quality intervention check failed:", err);
            io.to(roomId).emit("intervention_error", {
              sessionDiscussionId,
              message,
            });
          });

          logger.debug(`Message in ${roomId} from user ${user.id}`);
        } catch (error) {
          logger.error("Send message error:", error);
          socket.emit("server_error", { message: "Failed to send message" });
        }
      },
    );

    socket.on(
      "load_more_messages",
      async (data: {
        sessionDiscussionId: string;
        beforeMessageId: string;
        limit?: number;
      }) => {
        if (!socketRateLimiter.isAllowed(socket.id, "load_more_messages")) {
          const violations = socketRateLimiter.recordViolation(socket.id);
          socket.emit("rate_limit_exceeded", {
            event: "load_more_messages",
            retryAfter: socketRateLimiter.getRetryAfter(
              socket.id,
              "load_more_messages",
            ),
            message: "Too many history requests. Please slow down.",
          });
          if (violations >= socketRateLimiter.disconnectThreshold)
            socket.disconnect(true);
          return;
        }

        const loadMoreParsed = loadMoreMessagesSchema.safeParse(data);
        if (!loadMoreParsed.success) {
          emitValidationError(
            socket,
            "load_more_messages",
            loadMoreParsed.error.issues,
          );
          return;
        }

        try {
          const { sessionDiscussionId, beforeMessageId, limit } =
            loadMoreParsed.data;

          if (!socket.user) {
            socket.emit("server_error", { message: "Not authenticated" });
            return;
          }

          const sessionDiscussionRecord =
            await prisma.sessionDiscussion.findFirst({
              where: { id: sessionDiscussionId, deletedAt: null },
              select: {
                id: true,
                groupId: true,
                closedAt: true,
                weekId: true,
                group: { select: { courseId: true, deletedAt: true } },
              },
            });

          if (
            !sessionDiscussionRecord ||
            sessionDiscussionRecord.group?.deletedAt
          ) {
            socket.emit("server_error", {
              message: "Session discussion not found",
            });
            return;
          }

          const hasAccess = await verifyGroupAccess(
            socket.user.userId,
            socket.user.role,
            sessionDiscussionRecord.groupId,
            sessionDiscussionRecord.group.courseId,
          );

          if (!hasAccess) {
            socket.emit("server_error", {
              message: "Access denied to this group",
            });
            return;
          }

          // F4 pass2: load_more adalah jalur BACA — wajib lalui gate pre-read
          // & goal yang sama dgn join_room (sisi tulis sudah aman karena
          // send_message butuh join).
          if (socket.user.role === "student" && !sessionDiscussionRecord.closedAt) {
            if (sessionDiscussionRecord.weekId) {
              const preRead =
                await prisma.sessionDiscussionPreReadCompletion.findUnique({
                  where: {
                    userId_sessionDiscussionId: {
                      userId: socket.user.userId,
                      sessionDiscussionId,
                    },
                  },
                  select: { id: true },
                });
              if (!preRead) {
                socket.emit("server_error", {
                  message: "Selesaikan pre-read sebelum membaca sesi diskusi",
                  code: "PRE_READ_REQUIRED",
                });
                return;
              }
            }
            const goal = await prisma.learningGoal.findFirst({
              where: { sessionDiscussionId },
              select: { id: true },
            });
            if (!goal) {
              socket.emit("server_error", {
                message: "Tetapkan tujuan pembelajaran sebelum membaca sesi diskusi",
                code: "GOAL_REQUIRED",
              });
              return;
            }
          }

          const beforeObjectId = new mongoose.Types.ObjectId(beforeMessageId);
          const pageSize = limit ?? 50;
          const fetchSize = pageSize + 1;

          const historyPage = await ChatLog.find({
            sessionDiscussionId,
            deletedAt: null,
            _id: { $lt: beforeObjectId },
          })
            .sort({ _id: -1 })
            .limit(fetchSize)
            .lean<ChatHistoryItem[]>();

          const hasMore = historyPage.length > pageSize;
          const pageMessages = historyPage.slice(0, pageSize).reverse();

          const messages = pageMessages.map((msg) => ({
            id: msg._id?.toString(),
            senderId: msg.senderId,
            senderName: msg.senderName,
            senderType: msg.senderType,
            content: msg.content,
            isIntervention: msg.isIntervention,
            replyTo: msg.replyTo
              ? {
                  messageId: msg.replyTo.messageId,
                  senderId: msg.replyTo.senderId,
                  senderName: msg.replyTo.senderName,
                  content: msg.replyTo.content,
                }
              : undefined,
            attachments: msg.attachments || [],
            mentions: msg.mentions || [],
            guardrailOutcome: msg.guardrailOutcome ?? undefined,
            guardrailReason: msg.guardrailReason ?? undefined,
            interventionType: msg.interventionType ?? undefined,
            interventionReason: msg.interventionReason ?? undefined,
            scaffoldingLevel: msg.scaffoldingLevel ?? undefined,
            isRelevant: msg.isRelevant ?? undefined,
            citations: msg.citations?.length ? msg.citations : undefined,
            editedAt: msg.editedAt ? msg.editedAt.toISOString() : null,
            createdAt: msg.createdAt.toISOString(),
          }));

          socket.emit("chat_history_page", {
            messages,
            hasMore,
          });
        } catch (error) {
          logger.error("Load more messages error:", error);
          socket.emit("server_error", {
            message: "Failed to load more messages",
          });
        }
      },
    );

    // Delete message (only own messages)
    registerDeleteMessage(io, socket);
    registerEditMessage(io, socket);

    socket.on(
      "pin_message",
      async (data: {
        messageId: string;
        conversationId: string;
        pinnedMessage?: {
          id: string;
          message_id: string;
          content: string;
          sender_name: string;
          pinned_by: string;
          pinned_at: string;
        };
      }) => {
        if (!socket.user) {
          socket.emit("server_error", { message: "Not authenticated" });
          return;
        }
        if (!data.messageId || !data.conversationId) {
          socket.emit("server_error", {
            message: "messageId and conversationId required",
          });
          return;
        }
        // F1 pass2: pin wajib dari dalam room (konsisten dgn edit/delete) —
        // tanpa ini non-anggota bisa menyematkan pin lintas grup.
        if (!socket.rooms.has(data.conversationId)) {
          socket.emit("server_error", {
            message: "You must be in the room to pin messages",
          });
          return;
        }
        try {
          const message = await ChatLog.findById(data.messageId);
          if (!message || message.sessionDiscussionId !== data.conversationId) {
            socket.emit("server_error", { message: "Message not found" });
            return;
          }

          message.isPinned = true;
          message.pinnedAt = new Date();
          message.pinnedBy = socket.user.userId;
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

          io.to(data.conversationId).emit("pin_message", {
            messageId: data.messageId,
            conversationId: data.conversationId,
            pinnedMessage: pinnedData,
          });
        } catch (error) {
          logger.error("Pin message error:", error);
          socket.emit("server_error", { message: "Failed to pin message" });
        }
      },
    );

    socket.on(
      "unpin_message",
      async (data: { messageId: string; conversationId: string }) => {
        if (!socket.user) {
          socket.emit("server_error", { message: "Not authenticated" });
          return;
        }
        if (!data.messageId || !data.conversationId) {
          socket.emit("server_error", {
            message: "messageId and conversationId required",
          });
          return;
        }
        // F1 pass2: unpin juga wajib dari dalam room.
        if (!socket.rooms.has(data.conversationId)) {
          socket.emit("server_error", {
            message: "You must be in the room to unpin messages",
          });
          return;
        }
        try {
          const message = await ChatLog.findById(data.messageId);
          if (!message || message.sessionDiscussionId !== data.conversationId) {
            socket.emit("server_error", { message: "Message not found" });
            return;
          }

          message.isPinned = false;
          message.pinnedAt = undefined;
          message.pinnedBy = undefined;
          await message.save();

          io.to(data.conversationId).emit("unpin_message", {
            messageId: data.messageId,
            conversationId: data.conversationId,
          });
        } catch (error) {
          logger.error("Unpin message error:", error);
          socket.emit("server_error", { message: "Failed to unpin message" });
        }
      },
    );

    registerPresence(io, socket);
  });

  logger.info("Socket.IO initialized");
  return io;
}

/**
 * Verify user has access to a group
 */
async function verifyGroupAccess(
  userId: string,
  role: string,
  groupId: string,
  courseId: string,
): Promise<boolean> {
  if (role === "lecturer") {
    // Lecturer must own the course
    const course = await prisma.course.findFirst({
      where: { id: courseId, ownerId: userId },
    });
    return !!course;
  } else {
    // Student must be a member of the group
    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId },
      },
    });
    return !!membership;
  }
}

/**
 * Start silence timer for a room
 */
function startSilenceTimer(
  roomId: string,
  courseId: string,
  groupId: string,
  sessionDiscussionId: string,
): void {
  if (silenceTimers.has(roomId)) return;

  const timer = setTimeout(() => {
    triggerIntervention(roomId, courseId, groupId, sessionDiscussionId);
  }, SILENCE_TIMEOUT_MS);

  silenceTimers.set(roomId, timer);
}

/**
 * Reset silence timer for a room
 */
function resetSilenceTimer(
  roomId: string,
  courseId: string,
  groupId: string,
  sessionDiscussionId: string,
): void {
  const existingTimer = silenceTimers.get(roomId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(() => {
    triggerIntervention(roomId, courseId, groupId, sessionDiscussionId);
  }, SILENCE_TIMEOUT_MS);

  silenceTimers.set(roomId, timer);
}

/**
 * Clear silence timer for a room (cleanup on disconnect)
 */
export function clearSilenceTimer(roomId: string): void {
  const timer = silenceTimers.get(roomId);
  if (timer) {
    clearTimeout(timer);
    silenceTimers.delete(roomId);
  }
}
/**
 * Trigger bot intervention after silence
 */
async function triggerIntervention(
  roomId: string,
  courseId: string,
  groupId: string,
  sessionDiscussionId: string,
): Promise<void> {
  await runSilenceIntervention(
    { roomId, courseId, groupId, sessionDiscussionId },
    {
      emit: (room, event, payload) => {
        io.to(room).emit(event, payload);
      },
      onSent: (room) => {
        silenceTimers.delete(room);
      },
    },
  );
}

/**
 * Check discussion quality and trigger intervention if needed
 * Called after every N messages to monitor and improve quality
 */
async function checkAndIntervenForQuality(
  roomId: string,
  courseId: string,
  groupId: string,
  sessionDiscussionId: string,
): Promise<void> {
  try {
    const currentCount = incrementMessageCount(roomMessageCount, roomId);
    const lastIntervention = lastInterventionTime.get(roomId) || 0;

    if (
      !shouldRunQualityCheck(
        { messageCount: currentCount, lastInterventionAt: lastIntervention },
        Date.now(),
      )
    ) {
      return;
    }

    // Get recent messages with engagement data
    const recentMessages = await ChatLog.find({
      sessionDiscussionId,
      deletedAt: null,
      senderType: { $in: ["student", "lecturer"] },
    })
      .sort({ createdAt: -1 })
      .limit(15)
      .lean();

    if (recentMessages.length < 5) {
      return; // Not enough messages to analyze
    }

    // Calculate quality metrics from recent messages
    const messagesWithEngagement = recentMessages.filter((m) => m.engagement);
    if (messagesWithEngagement.length === 0) {
      return;
    }

    // Calculate HOT percentage
    const hotMessages = messagesWithEngagement.filter(
      (m) => m.engagement?.isHigherOrder,
    );
    const hotPercentage =
      (hotMessages.length / messagesWithEngagement.length) * 100;

    // Calculate cognitive ratio
    const cognitiveMessages = messagesWithEngagement.filter(
      (m) => m.engagement?.engagementType === "cognitive",
    );
    const cognitiveRatio =
      (cognitiveMessages.length / messagesWithEngagement.length) * 100;

    // Calculate average lexical variety
    const totalLexical = messagesWithEngagement.reduce(
      (sum, m) => sum + (m.engagement?.lexicalVariety || 0),
      0,
    );
    const avgLexical = totalLexical / messagesWithEngagement.length;

    // Determine intervention type based on metrics
    const decision = decideQualityIntervention({
      hotPercentage,
      cognitiveRatio,
      avgLexical,
    });
    const interventionType = decision.interventionType;
    const qualityIssue = decision.qualityIssue;

    // No intervention needed if quality is good
    if (!interventionType) {
      logger.debug(
        `Quality OK in ${roomId}: HOT=${hotPercentage.toFixed(0)}%, Cognitive=${cognitiveRatio.toFixed(0)}%, Lexical=${avgLexical.toFixed(0)}%`,
      );

      if (isStagedEscalationEnabled()) {
        const state = await findOrCreateState(
          courseId,
          groupId,
          sessionDiscussionId,
          "low_quality",
        );
        if (state.currentStage !== "resolved") {
          await advanceStage(
            state,
            "resolved",
            "Discussion quality recovered",
            "quality_check",
          );
        }
      }
      return;
    }

    if (isStagedEscalationEnabled()) {
      const state = await findOrCreateState(
        courseId,
        groupId,
        sessionDiscussionId,
        "low_quality",
      );

      if (state.currentStage === "resolved") {
        return;
      }
      if (state.currentStage === "flag-lecturer") {
        logger.debug(
          `Quality intervention skipped for ${roomId} (already escalated to lecturer)`,
        );
        return;
      }

      if (state.currentStage === "new") {
        await advanceStage(
          state,
          "nudge",
          `Low quality detected: ${qualityIssue}`,
          "quality_check",
        );
      } else if (state.currentStage === "nudge") {
        await advanceStage(
          state,
          "probe-blocker",
          `Quality still low after nudge: ${qualityIssue}`,
          "quality_check",
        );
      } else if (state.currentStage === "probe-blocker") {
        await advanceStage(
          state,
          "flag-lecturer",
          `No improvement after probe: ${qualityIssue}`,
          "quality_check",
        );
      }
    }

    let interventionMessage: string;
    try {
      const aiResult = await aiEngineService.analyzeIntervention({
        messages: recentMessages.slice(0, 10).map((m) => ({
          sender: m.senderName,
          content: m.content,
          timestamp: new Date(m.createdAt).toISOString(),
          sender_id: m.senderId,
        })),
        topic: qualityIssue,
        chat_room_id: sessionDiscussionId,
        intervention_type: interventionType,
        force: true,
        provider_context: undefined,
      });
      if (!aiResult.success || !aiResult.message) {
        throw new Error(aiResult.error || "Intervention analysis unsuccessful");
      }
      interventionMessage = aiResult.message;
    } catch {
      try {
        const promptResult = await aiEngineService.generatePrompt(
          qualityIssue,
          `Diskusi kelompok membutuhkan intervensi: ${qualityIssue}`,
          "medium",
          undefined,
        );
        // `??` misses the { success: false, prompt: '' } failure shape
        // (empty string is not nullish) — require a real prompt.
        interventionMessage =
          promptResult.success && promptResult.prompt
            ? promptResult.prompt
            : pickRandom(QUALITY_INTERVENTIONS[interventionType]);
      } catch {
        interventionMessage = pickRandom(
          QUALITY_INTERVENTIONS[interventionType],
        );
      }
    }

    const lockAcquired = await tryAcquireSilenceLock(roomId);
    if (!lockAcquired) {
      logger.debug(
        `Quality intervention skipped for ${roomId} (lock held by another instance)`,
      );
      return;
    }

    // Save intervention message
    const chatLog = new ChatLog({
      courseId,
      groupId,
      sessionDiscussionId,
      senderId: "bot",
      senderName: "Kolabri",
      senderType: "bot",
      content: interventionMessage,
      isIntervention: true,
    });
    await chatLog.save();

    // Broadcast intervention
    io.to(roomId).emit("receive_message", {
      id: chatLog._id?.toString(),
      senderId: "bot",
      senderName: "Kolabri",
      senderType: "bot",
      content: interventionMessage,
      isIntervention: true,
      interventionType: interventionType,
      createdAt: chatLog.createdAt.toISOString(),
    });

    // Emit quality alert for UI feedback
    io.to(roomId).emit("quality_intervention", {
      sessionDiscussionId,
      interventionType,
      qualityIssue,
      metrics: {
        hotPercentage: Math.round(hotPercentage),
        cognitiveRatio: Math.round(cognitiveRatio),
        lexicalVariety: Math.round(avgLexical),
      },
      timestamp: new Date().toISOString(),
    });

    // Update last intervention time
    lastInterventionTime.set(roomId, Date.now());

    logger.info(
      `Quality intervention sent to ${roomId}: ${interventionType} (${qualityIssue})`,
    );
  } catch (error) {
    logger.error("Quality check intervention error:", error);
  }
}

/**
 * Handle AI question (when user mentions @AI)
 * Uses orchestrated pipeline for full analytics and intervention
 */
async function handleAIQuestion(
  roomId: string,
  courseId: string,
  groupId: string,
  sessionDiscussionId: string,
  question: string,
  userId: string,
): Promise<void> {
  // Show typing indicator
  io.to(roomId).emit("ai_typing", { isTyping: true });

  try {
    const isAvailable = await aiEngineService.isAvailable();

    let response: string = "";
    let qualityScore: number | undefined;
    let shouldNotifyTeacher = false;
    let intervention: string | undefined;
    let interventionType: string | undefined;
    let engagementMeta:
      | {
          hot_percentage?: number;
          engagement_distribution?: Record<string, number>;
        }
      | undefined;
    let orchestrationResult: OrchestrationResponse | undefined;
    let filteredCitations: CitationPayload[] = [];

    if (!isAvailable) {
      response =
        "Maaf, AI Assistant sedang tidak tersedia saat ini. Silakan coba lagi nanti.";
    } else {
      const courseRecord = (await prisma.course.findUnique({
        where: { id: courseId },
      })) as {
        aiGuardrailConfig?: {
          preset?: "strict" | "balanced" | "relaxed";
          allowRewrite?: boolean;
          allowFlagOnly?: boolean;
        } | null;
        aiScaffoldingConfig?: {
          scaffoldingLevel?: "early" | "late" | "auto";
          enabled?: boolean;
        } | null;
        semester?: string | null;
        academicYear?: string | null;
      } | null;

      const guardrailPolicy = {
        preset: courseRecord?.aiGuardrailConfig?.preset ?? "balanced",
        allow_rewrite: courseRecord?.aiGuardrailConfig?.allowRewrite ?? true,
        allow_flag_only:
          courseRecord?.aiGuardrailConfig?.allowFlagOnly ?? false,
      };

      const scaffoldingConfig = {
        scaffolding_level:
          courseRecord?.aiScaffoldingConfig?.scaffoldingLevel ?? "auto",
        enabled: courseRecord?.aiScaffoldingConfig?.enabled ?? true,
      };

      const sessionDiscussionRow = await prisma.sessionDiscussion.findFirst({
        where: { id: sessionDiscussionId, deletedAt: null },
        select: { weekId: true },
      });
      const weekCtx = await WeekContextService.sessionWeekForSessionDiscussion(
        sessionDiscussionRow?.weekId,
      );
      const sessionWeekIndex = weekCtx?.weekIndex;
      const maxWeekIndex = sessionWeekIndex;

      const recentMessages = await ChatLog.find(
        { sessionDiscussionId, deletedAt: null },
        { senderType: 1, content: 1 },
      )
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

      const chatHistory = recentMessages
        .reverse()
        .filter((m) => m.senderType === "student" || m.senderType === "ai")
        .map((m) => ({
          role:
            m.senderType === "ai" ? ("assistant" as const) : ("user" as const),
          content: m.content,
        }));

      // DEBUG: Log chatHistory for investigation
      console.log("[DEBUG chatHistory]", {
        sessionDiscussionId,
        recentMessagesCount: recentMessages.length,
        chatHistoryCount: chatHistory.length,
        chatHistoryPreview: chatHistory
          .slice(0, 2)
          .map((m) => ({
            role: m.role,
            contentPreview: m.content.substring(0, 50),
          })),
      });

      const cleanQuestion = question.replace(/@ai/gi, "").trim();

      if (isNoFetchEligible(cleanQuestion)) {
        let fullContent = "";
        let streamCompleted = false;

        for await (const event of aiEngineService.orchestratedChatStream({
          user_id: userId,
          group_id: groupId,
          message: cleanQuestion,
          topic: weekCtx?.weekTitle ?? "General Discussion",
          collection_name: `course_${courseId}`,
          course_id: courseId,
          chat_room_id: sessionDiscussionId,
          guardrail_policy: guardrailPolicy,
          scaffolding_config: scaffoldingConfig,
          session_week_index: sessionWeekIndex,
          max_week_index: maxWeekIndex,
          week_context: weekCtx
            ? {
                week_title: weekCtx.weekTitle,
                week_index: weekCtx.weekIndex,
                material_titles: weekCtx.materials.map((m) => m.title),
              }
            : undefined,
          chat_history: chatHistory.length > 0 ? chatHistory : undefined,
          provider_context: undefined,
        })) {
          if (event.type === "token") {
            fullContent += event.content ?? "";
            io.to(roomId).emit("ai_chunk", {
              sessionDiscussionId,
              content: event.content,
              timestamp: new Date().toISOString(),
            });
          } else if (event.type === "full") {
            fullContent = event.content ?? "";
            io.to(roomId).emit("ai_chunk", {
              sessionDiscussionId,
              content: event.content,
              replace: true,
              timestamp: new Date().toISOString(),
            });
          } else if (event.type === "done") {
            response = event.content ?? fullContent;
            qualityScore = event.quality_score;
            shouldNotifyTeacher = event.should_notify_teacher ?? false;
            intervention = event.intervention;
            interventionType = event.intervention_type;
            const analytics = event.analytics as
              Record<string, unknown> | undefined;
            if (analytics) {
              engagementMeta = {
                hot_percentage: analytics.hot_percentage as number | undefined,
                engagement_distribution: analytics.engagement_distribution as
                  Record<string, number> | undefined,
              };
            }
            orchestrationResult = {
              success: true,
              bot_response: response,
              system_intervention: intervention,
              intervention_type: interventionType,
              action_taken: "NO_FETCH",
              should_notify_teacher: shouldNotifyTeacher,
              quality_score: qualityScore,
              meta: analytics as Record<string, unknown> | undefined,
              guardrail_outcome: event.guardrail_outcome,
              guardrail_reason: event.guardrail_reason,
              scaffolding_level: event.scaffolding_level,
              scaffolding_outcome: event.scaffolding_outcome,
              citations: event.citations,
            } as typeof orchestrationResult;
            // CITATIONS: Use all citations from AI engine without week filtering
            filteredCitations = (event.citations ?? []) as CitationPayload[];

            // DEBUG: Log citations in streaming path
            logger.info(
              `[DEBUG citations streaming] session=${sessionDiscussionId} hasCitations=${!!event.citations} count=${event.citations?.length || 0}`,
            );
            io.to(roomId).emit("ai_done", {
              sessionDiscussionId,
              citations:
                filteredCitations.length > 0 ? filteredCitations : undefined,
              timestamp: new Date().toISOString(),
            });
            streamCompleted = true;
          } else if (event.type === "error") {
            response = event.content ?? "Maaf, terjadi kesalahan.";
            io.to(roomId).emit("ai_chunk", {
              sessionDiscussionId,
              content: response,
              replace: true,
              timestamp: new Date().toISOString(),
            });
            io.to(roomId).emit("ai_done", {
              sessionDiscussionId,
              error: true,
              timestamp: new Date().toISOString(),
            });
            streamCompleted = true;
          }
        }

        if (!streamCompleted) {
          response =
            fullContent || "Maaf, terjadi kesalahan saat memproses pesan.";
        }
      } else {
        // FETCH path (grounding + guardrails): consume the SSE stream and
        // reassemble the same result shape the non-streaming call returned.
        let result: OrchestrationResponse = {
          success: false,
          bot_response: "",
          action_taken: "ERROR",
          should_notify_teacher: false,
        };

        for await (const event of aiEngineService.orchestratedChatStream({
          user_id: userId,
          group_id: groupId,
          message: question.replace(/@ai/gi, "").trim(),
          topic: weekCtx?.weekTitle ?? "General Discussion",
          collection_name: `course_${courseId}`,
          course_id: courseId,
          chat_room_id: sessionDiscussionId,
          guardrail_policy: guardrailPolicy,
          scaffolding_config: scaffoldingConfig,
          session_week_index: sessionWeekIndex,
          max_week_index: maxWeekIndex,
          week_context: weekCtx
            ? {
                week_title: weekCtx.weekTitle,
                week_index: weekCtx.weekIndex,
                material_titles: weekCtx.materials.map((m) => m.title),
              }
            : undefined,
          chat_history: chatHistory.length > 0 ? chatHistory : undefined,
          provider_context: undefined,
        })) {
          if (event.type === "done") {
            result = {
              success: true,
              bot_response: event.content ?? "",
              system_intervention: event.intervention,
              intervention_type: event.intervention_type,
              action_taken:
                (event.sources?.length ?? 0) > 0 ? "FETCH" : "NO_FETCH",
              should_notify_teacher: event.should_notify_teacher ?? false,
              quality_score: event.quality_score,
              meta: event.analytics as unknown as OrchestrationResponse["meta"],
              guardrail_outcome: event.guardrail_outcome,
              guardrail_reason: event.guardrail_reason,
              scaffolding_level: event.scaffolding_level,
              scaffolding_outcome: event.scaffolding_outcome,
              citations: event.citations,
            };
          } else if (event.type === "error") {
            result = {
              success: false,
              bot_response: event.content || "Maaf, terjadi kesalahan sistem.",
              action_taken: "ERROR",
              should_notify_teacher: false,
              error: event.content,
            };
          }
          // 'token'/'full' events are already folded into the 'done' payload;
          // FETCH replies are delivered as one message (no ai_chunk emits).
        }
        orchestrationResult = result;

        if (result.success) {
          response = result.bot_response;
          qualityScore = result.quality_score;
          shouldNotifyTeacher = result.should_notify_teacher;

          // DEBUG: Log citations received from AI engine
          logger.info(
            `[DEBUG citations fetch-stream] session=${sessionDiscussionId} hasCitations=${!!result.citations} count=${result.citations?.length || 0}`,
          );
          intervention = result.system_intervention;
          interventionType = result.intervention_type;
          engagementMeta = result.meta
            ? {
                hot_percentage: result.meta.hot_percentage,
                engagement_distribution: result.meta.engagement_distribution,
              }
            : undefined;

          if (result.guardrail_outcome) {
            await prisma.auditLog.create({
              data: {
                action: "course_ai_guardrail_triggered",
                entityType: "course",
                entityId: courseId,
                userId,
                metadata: {
                  outcome: result.guardrail_outcome,
                  reason: result.guardrail_reason ?? null,
                  surface: "group-chat",
                  sessionDiscussionId,
                },
              },
            });
          }
        } else {
          response =
            result.bot_response ||
            "Maaf, terjadi kesalahan saat memproses pertanyaan. Silakan coba lagi.";
        }

        // CITATIONS: Use all citations from AI engine without week filtering
        // Rationale: RAG searches all materials, so citations should match what AI actually used
        filteredCitations = result.citations ?? [];
      }
    }

    // DEBUG: Log filteredCitations before ChatLog creation
    logger.info(
      `[DEBUG citations pre-save] session=${sessionDiscussionId} filteredCount=${filteredCitations.length} willSave=${filteredCitations.length > 0}`,
    );

    const chatLog = new ChatLog({
      courseId,
      groupId,
      sessionDiscussionId,
      senderId: "ai",
      senderName: "AI Assistant",
      senderType: "ai",
      content: response,
      isIntervention: false,
      guardrailReason: orchestrationResult?.guardrail_reason ?? undefined,
      guardrailOutcome: orchestrationResult?.guardrail_outcome ?? undefined,
      interventionType: orchestrationResult?.intervention_type ?? undefined,
      interventionReason: orchestrationResult?.system_intervention ?? undefined,
      scaffoldingLevel: orchestrationResult?.scaffolding_level ?? undefined,
      qualityScore: orchestrationResult?.quality_score ?? undefined,
      citations: filteredCitations.length > 0 ? filteredCitations : undefined,
      // BUG-06: Persist engagement data from orchestration analytics
      engagement:
        orchestrationResult?.meta && orchestrationResult.meta.engagement_type
          ? {
              engagementType: String(
                orchestrationResult.meta.engagement_type,
              ).toLowerCase() as "cognitive" | "behavioral" | "emotional",
              isHigherOrder: Boolean(orchestrationResult.meta.is_higher_order),
              lexicalVariety: Math.round(
                (orchestrationResult.meta.lexical_variety ?? 0) * 100,
              ),
              hotIndicators: [],
              confidence: 0.8,
            }
          : undefined,
    });
    await chatLog.save();

    // Audit log every AI response for explainability (NFR-MNT-02)
    await prisma.auditLog.create({
      data: {
        action: "course_ai_response_generated",
        entityType: "chatLog",
        entityId: chatLog._id.toString(),
        userId,
        metadata: {
          sessionDiscussionId,
          courseId,
          guardrailOutcome: orchestrationResult?.guardrail_outcome ?? null,
          guardrailReason: orchestrationResult?.guardrail_reason ?? null,
          interventionType: orchestrationResult?.intervention_type ?? null,
          interventionReason: orchestrationResult?.system_intervention ?? null,
          scaffoldingLevel: orchestrationResult?.scaffolding_level ?? null,
          qualityScore: orchestrationResult?.quality_score ?? null,
        },
      },
    });

    // Send response
    io.to(roomId).emit("receive_message", {
      id: chatLog._id?.toString(),
      senderId: "ai",
      senderName: "AI Assistant",
      senderType: "ai",
      content: response,
      createdAt: chatLog.createdAt.toISOString(),
      guardrailOutcome: orchestrationResult?.guardrail_outcome ?? undefined,
      guardrailReason: orchestrationResult?.guardrail_reason ?? undefined,
      interventionType: orchestrationResult?.intervention_type ?? undefined,
      interventionReason: orchestrationResult?.system_intervention ?? undefined,
      scaffoldingLevel: orchestrationResult?.scaffolding_level ?? undefined,
      citations: filteredCitations.length > 0 ? filteredCitations : undefined,
    });

    // Emit quality feedback for real-time UI updates
    if (qualityScore !== undefined || engagementMeta) {
      io.to(roomId).emit("quality_update", {
        sessionDiscussionId,
        qualityScore: qualityScore ?? 0,
        engagementTypes: engagementMeta?.engagement_distribution ?? {},
        hotPercentage: engagementMeta?.hot_percentage ?? 0,
        timestamp: new Date().toISOString(),
      });
    }

    // Handle system intervention if triggered
    if (intervention && interventionType) {
      // Save intervention as bot message
      const interventionLog = new ChatLog({
        courseId,
        groupId,
        sessionDiscussionId,
        senderId: "bot",
        senderName: "Kolabri",
        senderType: "bot",
        content: intervention,
        isIntervention: true,
      });
      await interventionLog.save();

      io.to(roomId).emit("receive_message", {
        id: interventionLog._id?.toString(),
        senderId: "bot",
        senderName: "Kolabri",
        senderType: "bot",
        content: intervention,
        isIntervention: true,
        interventionType,
        createdAt: interventionLog.createdAt.toISOString(),
      });
    }

    // Notify lecturer if quality is critically low
    if (shouldNotifyTeacher) {
      if (isStagedEscalationEnabled()) {
        const state = await findOrCreateState(
          courseId,
          groupId,
          sessionDiscussionId,
          "low_quality",
        );
        if (
          state.currentStage !== "flag-lecturer" &&
          state.currentStage !== "resolved"
        ) {
          await advanceStage(
            state,
            "flag-lecturer",
            "AI Chat detected critical quality issue",
            "ai_chat",
          );
        }
        if (shouldNotifyLecturer(state)) {
          io.emit("lecturer_alert", {
            type: "low_quality",
            courseId,
            groupId,
            sessionDiscussionId,
            qualityScore,
            message: `Kualitas diskusi di grup ${groupId} memerlukan perhatian.`,
            timestamp: new Date().toISOString(),
          });
          markNotificationSent(state);
          await state.save();
        }
      } else {
        io.emit("lecturer_alert", {
          type: "low_quality",
          courseId,
          groupId,
          sessionDiscussionId,
          qualityScore,
          message: `Kualitas diskusi di grup ${groupId} memerlukan perhatian.`,
          timestamp: new Date().toISOString(),
        });
      }
    }
  } catch (error) {
    logger.error("AI question error:", error);

    io.to(roomId).emit("receive_message", {
      senderId: "ai",
      senderName: "AI Assistant",
      senderType: "ai",
      content: "Maaf, terjadi kesalahan teknis. Silakan coba lagi.",
      createdAt: new Date().toISOString(),
    });
  } finally {
    io.to(roomId).emit("ai_typing", { isTyping: false });
  }
}

/**
 * Get Socket.IO instance
 */
export function getIO(): Server {
  if (!io) {
    throw new Error("Socket.IO not initialized");
  }
  return io;
}
