import { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { logger } from '../utils/logger.js';
import { ChatLog } from '../models/ChatLog.js';
import { SilenceEvent } from '../models/SilenceEvent.js';
import prisma from '../config/database.js';
import { aiEngineService } from '../services/aiEngine.service.js';
import { socketRateLimiter } from '../utils/socketRateLimiter.js';
import { sanitizeMessageContent, sanitizeAttachments } from '../utils/sanitize.js';
import { setSocketEmitter } from '../utils/socketEmitter.js';
import { getRedis } from '../config/redis.js';
import { createAdapter } from '@socket.io/redis-adapter';
import type { AuthenticatedSocket, ChatHistoryItem } from './types.js';
import { authMiddleware } from './auth.js';
import { analyzeEngagement } from './engagement.js';
import { joinRoomSchema, sendMessageSchema, typingSchema, deleteMessageSchema, emitValidationError } from '../validators/socket.validator.js';

// Store silence timers per room
const silenceTimers = new Map<string, NodeJS.Timeout>();
import { SILENCE_TIMEOUT_MS, INTERVENTION_COOLDOWN_MS, MESSAGES_BEFORE_CHECK, incrementMessageCount, shouldRunQualityCheck, tryAcquireSilenceLock } from './interventionGate.js';
import { registerPresence, trackUserInRoom, listUsersInRoom } from './presence.js';
import { registerDeleteMessage } from './messages.js';
import { runSilenceIntervention } from './interventions.js';

// Track last intervention time per room to avoid spamming
const lastInterventionTime = new Map<string, number>();
const roomMessageCount = new Map<string, number>();

// Quality thresholds for intervention
import { QUALITY_THRESHOLDS, decideQualityIntervention } from './engagement.js';

// Intervention messages pool
import { INTERVENTION_MESSAGES, QUALITY_INTERVENTIONS, pickRandom } from './interventionMessages.js';

let io: Server;

export function initSocketIO(server: HttpServer): Server {
    const allowedOrigins = [
        process.env.CLIENT_URL || 'http://localhost:8080',
        'http://localhost:8080',
        'http://127.0.0.1:8080',
        'http://localhost:8000',
        'http://127.0.0.1:8000',
    ];

    io = new Server(server, {
        cors: {
            origin: allowedOrigins,
            methods: ['GET', 'POST'],
            credentials: true,
        },
        pingTimeout: 60000,
        pingInterval: 25000,
        transports: ['websocket', 'polling'],
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
        logger.info('Socket.IO Redis adapter active');
    }

    // Authentication middleware
    io.use(authMiddleware);

    // Connection handler
    io.on('connection', (socket: AuthenticatedSocket) => {
        logger.info(`User connected: ${socket.user?.userId} (${socket.id})`);

        // Join room (by chatSpace)
        socket.on('join_room', async (data: { courseId: string; groupId: string; chatSpaceId: string }) => {
            if (!socketRateLimiter.isAllowed(socket.id, 'join_room')) {
                const violations = socketRateLimiter.recordViolation(socket.id);
                socket.emit('rate_limit_exceeded', { event: 'join_room', retryAfter: socketRateLimiter.getRetryAfter(socket.id, 'join_room'), message: 'Too many join requests.' });
                if (violations >= socketRateLimiter.disconnectThreshold) socket.disconnect(true);
                return;
            }
            const joinParsed = joinRoomSchema.safeParse(data);
            if (!joinParsed.success) {
                emitValidationError(socket, 'join_room', joinParsed.error.issues);
                return;
            }
            try {
                const { courseId, groupId, chatSpaceId } = joinParsed.data;

                if (!socket.user) {
                    socket.emit('error', { message: 'Not authenticated' });
                    return;
                }

                // Verify user has access to the group
                const hasAccess = await verifyGroupAccess(socket.user.userId, socket.user.role, groupId, courseId);

                if (!hasAccess) {
                    socket.emit('error', { message: 'Access denied to this group' });
                    return;
                }

                // Verify chat space belongs to the group
                const chatSpace = await prisma.chatSpace.findFirst({
                    where: { id: chatSpaceId, groupId },
                });

                if (!chatSpace) {
                    socket.emit('error', { message: 'Chat space not found' });
                    return;
                }

                // Use chatSpaceId as roomId for message separation per session
                const roomId = chatSpaceId;
                socket.join(roomId);
                socket.currentRoom = roomId; // Track for disconnect cleanup

                // Load chat history from MongoDB for this specific chat space
                const chatHistory = await ChatLog.find({ 
                    chatSpaceId,
                    isDeleted: { $ne: true }
                })
                    .sort({ createdAt: 1 })
                    .limit(100)
                    .lean<ChatHistoryItem[]>();

                // If this is a fresh chat space (no messages yet), send welcome message with goal
                if (chatHistory.length === 0) {
                    // Get the single shared goal for this chat space
                    const goal = await prisma.learningGoal.findFirst({
                        where: { chatSpaceId },
                        select: { content: true },
                    });

                    // Create welcome message content
                    let welcomeContent = `🎯 **Selamat datang di sesi diskusi "${chatSpace.name}"!**\n\n`;
                    
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
                        chatSpaceId,
                        senderId: 'system',
                        senderName: 'Kolabri',
                        senderType: 'system',
                        content: welcomeContent,
                        isIntervention: false,
                    });
                    await welcomeMessage.save();

                    // Add welcome message to chat history for sending
                    chatHistory.push({
                        _id: welcomeMessage._id,
                        courseId,
                        groupId,
                        chatSpaceId,
                        senderId: 'system',
                        senderName: 'Kolabri',
                        senderType: 'system' as const,
                        content: welcomeContent,
                        isIntervention: false,
                        isDeleted: false,
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
                    replyTo: msg.replyTo ? {
                        messageId: msg.replyTo.messageId,
                        senderId: msg.replyTo.senderId,
                        senderName: msg.replyTo.senderName,
                        content: msg.replyTo.content,
                    } : undefined,
                    attachments: msg.attachments || [],
                    mentions: msg.mentions || [],
                    createdAt: msg.createdAt.toISOString(),
                }));

                socket.emit('chat_history', { messages: historyMessages });

                // Notify room about new user joining
                socket.to(roomId).emit('user_joined', {
                    userId: socket.user.userId,
                    userName: socket.user.email.split('@')[0],
                });

                await trackUserInRoom(roomId, {
                    userId: socket.user.userId,
                    userName: socket.user.email.split('@')[0],
                    socketId: socket.id,
                });

                socket.emit('online_users', { users: await listUsersInRoom(roomId) });

                // Send room joined confirmation
                socket.emit('room_joined', { roomId, courseId, groupId, chatSpaceId });

                // Start silence timer if not exists
                startSilenceTimer(roomId, courseId, groupId, chatSpaceId);

                logger.info(`User ${socket.user.userId} joined room ${roomId}`);
            } catch (error) {
                logger.error('Join room error:', error);
                socket.emit('error', { message: 'Failed to join room' });
            }
        });

        // Send message (with optional reply, attachments, and mentions)
        socket.on('send_message', async (data: { 
            roomId: string; 
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
            if (!socketRateLimiter.isAllowed(socket.id, 'send_message')) {
                const violations = socketRateLimiter.recordViolation(socket.id);
                socket.emit('rate_limit_exceeded', { event: 'send_message', retryAfter: socketRateLimiter.getRetryAfter(socket.id, 'send_message'), message: 'Too many messages. Please slow down.' });
                if (violations >= socketRateLimiter.disconnectThreshold) socket.disconnect(true);
                return;
            }
            const msgParsed = sendMessageSchema.safeParse(data);
            if (!msgParsed.success) {
                emitValidationError(socket, 'send_message', msgParsed.error.issues);
                return;
            }
            try {
                const { roomId, content, courseId, groupId, replyTo, attachments, mentions } = msgParsed.data;

                if (!socket.user) {
                    socket.emit('error', { message: 'Not authenticated' });
                    return;
                }

                // roomId is chatSpaceId
                const chatSpaceId = roomId;

                const chatSpaceRecord = await prisma.chatSpace.findFirst({
                    where: { id: chatSpaceId, deletedAt: null },
                    select: {
                        id: true,
                        closedAt: true,
                        groupId: true,
                        group: { select: { courseId: true, deletedAt: true } },
                    },
                });

                if (!chatSpaceRecord || chatSpaceRecord.group?.deletedAt) {
                    socket.emit('error', { message: 'Chat space not found' });
                    return;
                }

                const authoritativeGroupId = chatSpaceRecord.groupId;
                const authoritativeCourseId = chatSpaceRecord.group.courseId;

                if (
                    courseId !== authoritativeCourseId ||
                    groupId !== authoritativeGroupId
                ) {
                    logger.warn(
                        `send_message payload tampering: client claimed courseId=${courseId} groupId=${groupId} but chatSpace ${chatSpaceId} resolves to courseId=${authoritativeCourseId} groupId=${authoritativeGroupId}`,
                    );
                }

                if (!socket.rooms.has(chatSpaceId)) {
                    socket.emit('error', { message: 'You must join the room before sending messages' });
                    return;
                }

                const hasAccess = await verifyGroupAccess(
                    socket.user.userId,
                    socket.user.role,
                    authoritativeGroupId,
                    authoritativeCourseId,
                );
                if (!hasAccess) {
                    socket.emit('error', { message: 'Access denied to this room' });
                    return;
                }

                if (chatSpaceRecord.closedAt) {
                    socket.emit('session_closed', {
                        chatSpaceId,
                        closedAt: chatSpaceRecord.closedAt.toISOString(),
                        message: 'Sesi diskusi ini telah ditutup.',
                    });
                    return;
                }

                // Get user details
                const user = await prisma.user.findFirst({
                    where: { id: socket.user.userId, deletedAt: null },
                    select: { id: true, name: true, role: true },
                });

                if (!user) {
                    socket.emit('error', { message: 'User not found' });
                    return;
                }

                let safeContent: string;
                try {
                    safeContent = sanitizeMessageContent(content.trim());
                } catch {
                    socket.emit('error', { message: 'Message content too large' });
                    return;
                }
                if (safeContent.trim().length === 0 && (!attachments || attachments.length === 0)) {
                    socket.emit('error', { message: 'Message must have content or at least one attachment' });
                    return;
                }
                const safeAttachments = sanitizeAttachments(attachments);

                const engagement = analyzeEngagement(safeContent);

                const chatLog = new ChatLog({
                    courseId: authoritativeCourseId,
                    groupId: authoritativeGroupId,
                    chatSpaceId,
                    senderId: user.id,
                    senderName: user.name,
                    senderType: user.role as 'student' | 'lecturer',
                    content: safeContent,
                    isIntervention: false,
                    replyTo: replyTo ? {
                        messageId: replyTo.messageId,
                        senderId: replyTo.senderId,
                        senderName: replyTo.senderName,
                        content: sanitizeMessageContent(replyTo.content).substring(0, 100),
                    } : undefined,
                    attachments: safeAttachments,
                    mentions: mentions || [],
                    engagement,
                });
                await chatLog.save();

                aiEngineService.analyzeEngagement(safeContent).then(async (aiEngagement) => {
                    if (aiEngagement.success && aiEngagement.engagement_type !== 'unknown') {
                        await ChatLog.findByIdAndUpdate(chatLog._id, {
                            'engagement.lexicalVariety': Math.round(aiEngagement.lexical_variety * 100),
                            'engagement.isHigherOrder': aiEngagement.is_higher_order,
                            'engagement.engagementType': aiEngagement.engagement_type.toLowerCase() as 'cognitive' | 'behavioral' | 'emotional',
                        });
                    }
                }).catch(() => {});

                aiEngineService.trackActivity(authoritativeGroupId, user.id).catch(() => {});

                const message = {
                    id: chatLog._id?.toString(),
                    senderId: user.id,
                    senderName: user.name,
                    senderType: user.role,
                    content: safeContent,
                    replyTo: chatLog.replyTo,
                    attachments: chatLog.attachments,
                    mentions: chatLog.mentions,
                    createdAt: chatLog.createdAt.toISOString(),
                };

                io.to(chatSpaceId).emit('receive_message', message);

                resetSilenceTimer(chatSpaceId, authoritativeCourseId, authoritativeGroupId, chatSpaceId);

                if (safeContent.toLowerCase().includes('@ai')) {
                    handleAIQuestion(chatSpaceId, authoritativeCourseId, authoritativeGroupId, chatSpaceId, safeContent, user.id);
                }

                // Check discussion quality and intervene if needed (async, non-blocking)
                checkAndIntervenForQuality(roomId, courseId, groupId, chatSpaceId).catch(err => {
                    logger.error('Quality intervention check failed:', err);
                });

                logger.debug(`Message in ${roomId} from user ${user.id}`);
            } catch (error) {
                logger.error('Send message error:', error);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        // Delete message (only own messages)
        registerDeleteMessage(io, socket);

        registerPresence(io, socket);
    });

    logger.info('Socket.IO initialized');
    return io;
}

/**
 * Verify user has access to a group
 */
async function verifyGroupAccess(
    userId: string,
    role: string,
    groupId: string,
    courseId: string
): Promise<boolean> {
    if (role === 'lecturer') {
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
function startSilenceTimer(roomId: string, courseId: string, groupId: string, chatSpaceId: string): void {
    if (silenceTimers.has(roomId)) return;

    const timer = setTimeout(() => {
        triggerIntervention(roomId, courseId, groupId, chatSpaceId);
    }, SILENCE_TIMEOUT_MS);

    silenceTimers.set(roomId, timer);
}

/**
 * Reset silence timer for a room
 */
function resetSilenceTimer(roomId: string, courseId: string, groupId: string, chatSpaceId: string): void {
    const existingTimer = silenceTimers.get(roomId);
    if (existingTimer) {
        clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
        triggerIntervention(roomId, courseId, groupId, chatSpaceId);
    }, SILENCE_TIMEOUT_MS);

    silenceTimers.set(roomId, timer);
}

/**
 * Trigger bot intervention after silence
 */
async function triggerIntervention(roomId: string, courseId: string, groupId: string, chatSpaceId: string): Promise<void> {
    await runSilenceIntervention(
        { roomId, courseId, groupId, chatSpaceId },
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
    chatSpaceId: string
): Promise<void> {
    try {
        const currentCount = incrementMessageCount(roomMessageCount, roomId);
        const lastIntervention = lastInterventionTime.get(roomId) || 0;

        if (!shouldRunQualityCheck({ messageCount: currentCount, lastInterventionAt: lastIntervention }, Date.now())) {
            return;
        }

        // Get recent messages with engagement data
        const recentMessages = await ChatLog.find({
            chatSpaceId,
            isDeleted: { $ne: true },
            senderType: { $in: ['student', 'lecturer'] },
        })
            .sort({ createdAt: -1 })
            .limit(15)
            .lean();

        if (recentMessages.length < 5) {
            return; // Not enough messages to analyze
        }

        // Calculate quality metrics from recent messages
        const messagesWithEngagement = recentMessages.filter(m => m.engagement);
        if (messagesWithEngagement.length === 0) {
            return;
        }

        // Calculate HOT percentage
        const hotMessages = messagesWithEngagement.filter(m => m.engagement?.isHigherOrder);
        const hotPercentage = (hotMessages.length / messagesWithEngagement.length) * 100;

        // Calculate cognitive ratio
        const cognitiveMessages = messagesWithEngagement.filter(
            m => m.engagement?.engagementType === 'cognitive'
        );
        const cognitiveRatio = (cognitiveMessages.length / messagesWithEngagement.length) * 100;

        // Calculate average lexical variety
        const totalLexical = messagesWithEngagement.reduce(
            (sum, m) => sum + (m.engagement?.lexicalVariety || 0), 0
        );
        const avgLexical = totalLexical / messagesWithEngagement.length;

        // Determine intervention type based on metrics
        const decision = decideQualityIntervention({ hotPercentage, cognitiveRatio, avgLexical });
        const interventionType = decision.interventionType;
        const qualityIssue = decision.qualityIssue;

        // No intervention needed if quality is good
        if (!interventionType) {
            logger.debug(`Quality OK in ${roomId}: HOT=${hotPercentage.toFixed(0)}%, Cognitive=${cognitiveRatio.toFixed(0)}%, Lexical=${avgLexical.toFixed(0)}%`);
            return;
        }

        let interventionMessage: string;
        try {
            const aiResult = await aiEngineService.analyzeIntervention({
                messages: recentMessages.slice(0, 10).map(m => ({
                    sender: m.senderName,
                    content: m.content,
                    timestamp: new Date(m.createdAt).toISOString(),
                    sender_id: m.senderId,
                })),
                topic: qualityIssue,
                chat_room_id: chatSpaceId,
                intervention_type: interventionType,
                force: true,
            });
            if (aiResult.success && aiResult.message) {
                interventionMessage = aiResult.message;
            } else {
                const promptResult = await aiEngineService.generatePrompt(
                    qualityIssue,
                    `Diskusi kelompok membutuhkan intervensi: ${qualityIssue}`,
                    'medium'
                );
                interventionMessage = promptResult.success && promptResult.prompt
                    ? promptResult.prompt
                    : pickRandom(QUALITY_INTERVENTIONS[interventionType]);
            }
        } catch {
            interventionMessage = pickRandom(QUALITY_INTERVENTIONS[interventionType]);
        }

        const lockAcquired = await tryAcquireSilenceLock(roomId);
        if (!lockAcquired) {
            logger.debug(`Quality intervention skipped for ${roomId} (lock held by another instance)`);
            return;
        }

        // Save intervention message
        const chatLog = new ChatLog({
            courseId,
            groupId,
            chatSpaceId,
            senderId: 'bot',
            senderName: 'CoRegula Bot',
            senderType: 'bot',
            content: interventionMessage,
            isIntervention: true,
        });
        await chatLog.save();

        // Broadcast intervention
        io.to(roomId).emit('receive_message', {
            id: chatLog._id?.toString(),
            senderId: 'bot',
            senderName: 'CoRegula Bot',
            senderType: 'bot',
            content: interventionMessage,
            isIntervention: true,
            interventionType: interventionType,
            createdAt: chatLog.createdAt.toISOString(),
        });

        // Emit quality alert for UI feedback
        io.to(roomId).emit('quality_intervention', {
            chatSpaceId,
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

        logger.info(`Quality intervention sent to ${roomId}: ${interventionType} (${qualityIssue})`);
    } catch (error) {
        logger.error('Quality check intervention error:', error);
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
    chatSpaceId: string,
    question: string,
    userId: string
): Promise<void> {
    // Show typing indicator
    io.to(roomId).emit('ai_typing', { isTyping: true });

    try {
        // Check if AI Engine is available
        const isAvailable = await aiEngineService.isAvailable();
        
        let response: string;
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

        if (!isAvailable) {
            response = "Maaf, AI Assistant sedang tidak tersedia saat ini. Silakan coba lagi nanti.";
        } else {
            // Use orchestrated pipeline for full analytics
            const result = await aiEngineService.orchestratedChat({
                user_id: userId,
                group_id: groupId,
                message: question.replace(/@ai/gi, '').trim(),
                topic: 'General Discussion',
                collection_name: `course_${courseId}`,
                course_id: courseId,
                chat_room_id: chatSpaceId,
            });

            if (result.success) {
                response = result.bot_response;
                qualityScore = result.quality_score;
                shouldNotifyTeacher = result.should_notify_teacher;
                intervention = result.system_intervention;
                interventionType = result.intervention_type;
                engagementMeta = result.meta
                    ? {
                          hot_percentage: result.meta.hot_percentage,
                          engagement_distribution: result.meta.engagement_distribution,
                      }
                    : undefined;
            } else {
                response = result.bot_response || "Maaf, terjadi kesalahan saat memproses pertanyaan. Silakan coba lagi.";
            }
        }

        // Save AI response with chatSpaceId
        const chatLog = new ChatLog({
            courseId,
            groupId,
            chatSpaceId,
            senderId: 'ai',
            senderName: 'AI Assistant',
            senderType: 'ai',
            content: response,
            isIntervention: false,
        });
        await chatLog.save();

        // Send response
        io.to(roomId).emit('receive_message', {
            id: chatLog._id?.toString(),
            senderId: 'ai',
            senderName: 'AI Assistant',
            senderType: 'ai',
            content: response,
            createdAt: chatLog.createdAt.toISOString(),
        });

        // Emit quality feedback for real-time UI updates
        if (qualityScore !== undefined || engagementMeta) {
            io.to(roomId).emit('quality_update', {
                chatSpaceId,
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
                chatSpaceId,
                senderId: 'bot',
                senderName: 'CoRegula Bot',
                senderType: 'bot',
                content: intervention,
                isIntervention: true,
            });
            await interventionLog.save();

            io.to(roomId).emit('receive_message', {
                id: interventionLog._id?.toString(),
                senderId: 'bot',
                senderName: 'CoRegula Bot',
                senderType: 'bot',
                content: intervention,
                isIntervention: true,
                interventionType,
                createdAt: interventionLog.createdAt.toISOString(),
            });
        }

        // Notify lecturer if quality is critically low
        if (shouldNotifyTeacher) {
            io.emit('lecturer_alert', {
                type: 'low_quality',
                courseId,
                groupId,
                chatSpaceId,
                qualityScore,
                message: `Kualitas diskusi di grup ${groupId} memerlukan perhatian.`,
                timestamp: new Date().toISOString(),
            });
        }

    } catch (error) {
        logger.error('AI question error:', error);

        io.to(roomId).emit('receive_message', {
            senderId: 'ai',
            senderName: 'AI Assistant',
            senderType: 'ai',
            content: "Maaf, terjadi kesalahan teknis. Silakan coba lagi.",
            createdAt: new Date().toISOString(),
        });
    } finally {
        io.to(roomId).emit('ai_typing', { isTyping: false });
    }
}

/**
 * Get Socket.IO instance
 */
export function getIO(): Server {
    if (!io) {
        throw new Error('Socket.IO not initialized');
    }
    return io;
}
