import { Server as HttpServer } from 'node:http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger.js';
import { JwtPayload } from '../middleware/auth.js';
import { ChatLog } from '../models/ChatLog.js';
import type { IAttachment, IReplyTo } from '../models/ChatLog.js';
import { SilenceEvent } from '../models/SilenceEvent.js';
import prisma from '../config/database.js';
import { aiEngineService } from '../services/aiEngine.service.js';
import { socketRateLimiter } from '../utils/socketRateLimiter.js';
import { joinRoomSchema, sendMessageSchema, typingSchema, deleteMessageSchema, emitValidationError } from '../validators/socket.validator.js';

interface ChatHistoryItem {
    _id: { toString(): string };
    courseId: string;
    groupId: string;
    chatSpaceId: string;
    senderId: string;
    senderName: string;
    senderType: 'student' | 'lecturer' | 'ai' | 'bot' | 'system';
    content: string;
    isIntervention: boolean;
    isDeleted: boolean;
    replyTo?: IReplyTo;
    attachments: IAttachment[];
    mentions: string[];
    createdAt: Date;
}

// Store silence timers per room
const silenceTimers = new Map<string, NodeJS.Timeout>();
const SILENCE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// Store online users per room
const roomUsers = new Map<string, Map<string, { odId: string; userName: string; socketId: string }>>();

// Track last intervention time per room to avoid spamming
const lastInterventionTime = new Map<string, number>();
const INTERVENTION_COOLDOWN_MS = 3 * 60 * 1000; // 3 minutes between interventions
const MESSAGES_BEFORE_CHECK = 5; // Check quality every N messages
const roomMessageCount = new Map<string, number>();

// Quality thresholds for intervention
const QUALITY_THRESHOLDS = {
    LOW_HOT: 20,        // Trigger if HOT% < 20
    LOW_COGNITIVE: 25,  // Trigger if cognitive engagement < 25%
    LOW_LEXICAL: 25,    // Trigger if lexical variety < 25%
};

// HOT (Higher-Order Thinking) detection keywords
const HOT_KEYWORDS = [
    'mengapa', 'kenapa', 'bagaimana', 'analisis', 'evaluasi', 'bandingkan',
    'jelaskan', 'argumentasi', 'kritik', 'sintesis', 'hubungkan', 'simpulkan',
    'why', 'how', 'analyze', 'evaluate', 'compare', 'explain', 'argue',
    'menurut saya', 'pendapat saya', 'alasannya', 'karena', 'sebab',
    'dampak', 'pengaruh', 'akibat', 'solusi', 'alternatif'
];

// Engagement type keywords
const COGNITIVE_KEYWORDS = [
    'mengapa', 'bagaimana', 'analisis', 'evaluasi', 'bandingkan', 'jelaskan',
    'menurut saya', 'pendapat', 'alasan', 'karena', 'sebab', 'konsep',
    'teori', 'hipotesis', 'kesimpulan', 'bukti', 'argumen'
];

const BEHAVIORAL_KEYWORDS = [
    'saya akan', 'mari kita', 'ayo', 'sudah selesai', 'bisa bantu',
    'saya coba', 'sudah dikerjakan', 'progress', 'tugas', 'deadline',
    'submit', 'kirim', 'upload', 'download', 'share', 'bagikan'
];

const EMOTIONAL_KEYWORDS = [
    'bagus', 'keren', 'mantap', 'semangat', 'setuju', 'terima kasih',
    'thanks', 'maaf', 'sorry', 'senang', 'susah', 'sulit', 'mudah',
    'bingung', 'paham', 'mengerti', 'jelas', 'tidak jelas'
];

// Helper function to analyze engagement
function analyzeEngagement(text: string): {
    engagementType: 'cognitive' | 'behavioral' | 'emotional';
    isHigherOrder: boolean;
    lexicalVariety: number;
    hotIndicators: string[];
    confidence: number;
} {
    const lowerText = text.toLowerCase();
    const words = lowerText.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
    
    // Calculate lexical variety (Type-Token Ratio)
    const uniqueWords = new Set(words);
    const lexicalVariety = words.length > 0 
        ? Math.round((uniqueWords.size / Math.max(words.length, 1)) * 100)
        : 0;
    
    // Detect HOT indicators
    const hotIndicators = HOT_KEYWORDS.filter(k => lowerText.includes(k));
    const isHigherOrder = hotIndicators.length > 0;
    
    // Classify engagement type
    const cognitiveScore = COGNITIVE_KEYWORDS.filter(k => lowerText.includes(k)).length;
    const behavioralScore = BEHAVIORAL_KEYWORDS.filter(k => lowerText.includes(k)).length;
    const emotionalScore = EMOTIONAL_KEYWORDS.filter(k => lowerText.includes(k)).length;
    
    let engagementType: 'cognitive' | 'behavioral' | 'emotional';
    if (cognitiveScore >= behavioralScore && cognitiveScore >= emotionalScore) {
        engagementType = 'cognitive';
    } else if (behavioralScore >= emotionalScore) {
        engagementType = 'behavioral';
    } else {
        engagementType = 'emotional';
    }
    
    // Calculate confidence based on keyword matches
    const totalMatches = cognitiveScore + behavioralScore + emotionalScore;
    const confidence = totalMatches > 0 ? Math.min(0.5 + (totalMatches * 0.1), 1.0) : 0.3;
    
    return {
        engagementType,
        isHigherOrder,
        lexicalVariety,
        hotIndicators,
        confidence,
    };
}

// Intervention messages pool
const INTERVENTION_MESSAGES = [
    "Sepertinya diskusi sudah agak sepi. Ada yang ingin berbagi pendapat atau pertanyaan?",
    "Tim, sudah beberapa saat tidak ada aktivitas. Apakah ada kesulitan yang bisa saya bantu?",
    "Bagaimana progress diskusi kalian? Jangan ragu untuk bertanya jika ada yang kurang jelas.",
    "Halo! Apakah kalian sudah menemukan solusi? Saya siap membantu jika diperlukan.",
    "Tim, mari kita lanjutkan diskusi. Apa langkah selanjutnya yang ingin kalian ambil?",
];

// Quality-based intervention messages
const QUALITY_INTERVENTIONS = {
    low_hot: [
        "💡 **Tips Diskusi Berkualitas:** Coba ajukan pertanyaan 'mengapa' dan 'bagaimana' untuk memperdalam pemahaman. Misalnya: 'Mengapa hal ini penting?' atau 'Bagaimana konsep ini bisa diterapkan?'",
        "🎯 **Tingkatkan Diskusi:** Diskusi yang baik melibatkan analisis dan evaluasi. Coba bandingkan pendapat kalian atau jelaskan alasan di balik ide-ide yang disampaikan.",
        "🧠 **Berpikir Kritis:** Apa dampak atau konsekuensi dari topik yang sedang dibahas? Coba analisis lebih dalam dengan memberikan argumen dan bukti.",
        "📊 **Ajak Berpikir Tingkat Tinggi:** Daripada hanya menyatakan fakta, coba evaluasi kelebihan dan kekurangan dari setiap pendapat yang muncul.",
    ],
    low_cognitive: [
        "📚 **Fokus pada Isi:** Sepertinya diskusi lebih banyak koordinasi. Mari kita bahas substansi materi - apa yang sudah kalian pahami tentang topik ini?",
        "💬 **Perdalam Diskusi:** Bagaimana pemahaman kalian tentang konsep utama? Coba jelaskan dengan kata-kata sendiri.",
        "🔍 **Eksplorasi Materi:** Ada hubungan menarik antara topik ini dengan konsep lain. Apa yang bisa kalian hubungkan?",
        "📖 **Diskusi Substansial:** Apa kesimpulan atau insight baru yang sudah kalian dapatkan dari materi ini?",
    ],
    low_lexical: [
        "📝 **Variasi Bahasa:** Coba gunakan istilah-istilah kunci dari materi pembelajaran untuk memperkaya diskusi.",
        "🔤 **Kembangkan Kosakata:** Saat menjelaskan, gunakan sinonim atau parafrase untuk menunjukkan pemahaman yang lebih dalam.",
        "✍️ **Ekspresikan Lebih Rinci:** Jelaskan ide kalian dengan lebih detail menggunakan contoh konkret dan istilah akademis.",
    ],
    general: [
        "🌟 **Ayo Semangat!** Diskusi yang aktif membantu pemahaman bersama. Bagikan pendapat atau pertanyaan kalian!",
        "🤝 **Kolaborasi:** Coba tanggapi pendapat teman dengan memberikan perspektif tambahan atau pertanyaan lanjutan.",
    ],
};

interface AuthenticatedSocket extends Socket {
    user?: JwtPayload;
    currentRoom?: string; // Track current room for cleanup
}

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

    // Authentication middleware
    io.use(async (socket: AuthenticatedSocket, next) => {
        try {
            const token = socket.handshake.auth.token || socket.handshake.query.token;
            
            logger.debug(`Socket auth attempt - token present: ${!!token}`);

            if (!token) {
                logger.warn('Socket connection rejected: No token provided');
                return next(new Error('Authentication required'));
            }

            const secret = process.env.JWT_SECRET;
            if (!secret) {
                logger.error('Socket auth failed: JWT_SECRET not configured');
                return next(new Error('Server configuration error'));
            }

            const decoded = jwt.verify(token as string, secret) as JwtPayload;

            const user = await prisma.user.findFirst({
                where: { id: decoded.userId, deletedAt: null },
                select: { id: true },
            });

            if (!user) {
                logger.warn(`Socket auth rejected: User ${decoded.userId} not found or inactive`);
                return next(new Error('User not found'));
            }

            socket.user = decoded;
            
            logger.debug(`Socket auth success for user: ${decoded.email}`);

            next();
        } catch (error) {
            logger.error('Socket auth error:', error);
            next(new Error('Invalid token'));
        }
    });

    // Connection handler
    io.on('connection', (socket: AuthenticatedSocket) => {
        logger.info(`User connected: ${socket.user?.email} (${socket.id})`);

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

                // Track user in room
                if (!roomUsers.has(roomId)) {
                    roomUsers.set(roomId, new Map());
                }
                roomUsers.get(roomId)!.set(socket.user.userId, {
                    odId: socket.user.userId,
                    userName: socket.user.email.split('@')[0],
                    socketId: socket.id,
                });

                // Send current online users list to the joining user
                const onlineUsers = Array.from(roomUsers.get(roomId)!.values()).map(u => ({
                    odId: u.odId,
                    userName: u.userName,
                }));
                socket.emit('online_users', { users: onlineUsers });

                // Send room joined confirmation
                socket.emit('room_joined', { roomId, courseId, groupId, chatSpaceId });

                // Start silence timer if not exists
                startSilenceTimer(roomId, courseId, groupId, chatSpaceId);

                logger.info(`User ${socket.user.email} joined room ${roomId}`);
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

                if (!socket.user || (!content.trim() && (!attachments || attachments.length === 0))) {
                    return;
                }

                // roomId is chatSpaceId
                const chatSpaceId = roomId;

                const chatSpaceRecord = await prisma.chatSpace.findFirst({
                    where: { id: chatSpaceId, deletedAt: null },
                    select: { closedAt: true },
                });

                if (!chatSpaceRecord) {
                    socket.emit('error', { message: 'Chat space not found' });
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

                // Save message to MongoDB with chatSpaceId and engagement analysis
                const engagement = analyzeEngagement(content.trim());
                
                const chatLog = new ChatLog({
                    courseId,
                    groupId,
                    chatSpaceId,
                    senderId: user.id,
                    senderName: user.name,
                    senderType: user.role as 'student' | 'lecturer',
                    content: content.trim(),
                    isIntervention: false,
                    replyTo: replyTo ? {
                        messageId: replyTo.messageId,
                        senderId: replyTo.senderId,
                        senderName: replyTo.senderName,
                        content: replyTo.content.substring(0, 100), // Limit reply preview
                    } : undefined,
                    attachments: attachments || [],
                    mentions: mentions || [],
                    engagement,
                });
                await chatLog.save();

                aiEngineService.analyzeEngagement(content.trim()).then(async (aiEngagement) => {
                    if (aiEngagement.success && aiEngagement.engagement_type !== 'unknown') {
                        await ChatLog.findByIdAndUpdate(chatLog._id, {
                            'engagement.lexicalVariety': Math.round(aiEngagement.lexical_variety * 100),
                            'engagement.isHigherOrder': aiEngagement.is_higher_order,
                            'engagement.engagementType': aiEngagement.engagement_type.toLowerCase() as 'cognitive' | 'behavioral' | 'emotional',
                        });
                    }
                }).catch(() => {});

                // Broadcast message to room
                const message = {
                    id: chatLog._id?.toString(),
                    senderId: user.id,
                    senderName: user.name,
                    senderType: user.role,
                    content: content.trim(),
                    replyTo: chatLog.replyTo,
                    attachments: chatLog.attachments,
                    mentions: chatLog.mentions,
                    createdAt: chatLog.createdAt.toISOString(),
                };

                io.to(roomId).emit('receive_message', message);

                // Reset silence timer
                resetSilenceTimer(roomId, courseId, groupId, chatSpaceId);

                // Check for @AI mention
                if (content.toLowerCase().includes('@ai')) {
                    handleAIQuestion(roomId, courseId, groupId, chatSpaceId, content, user.name, user.id);
                }

                // Check discussion quality and intervene if needed (async, non-blocking)
                checkAndIntervenForQuality(roomId, courseId, groupId, chatSpaceId).catch(err => {
                    logger.error('Quality intervention check failed:', err);
                });

                logger.debug(`Message in ${roomId} from ${user.name}: ${content.substring(0, 50)}...`);
            } catch (error) {
                logger.error('Send message error:', error);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        // Delete message (only own messages)
        socket.on('delete_message', async (data: { roomId: string; messageId: string }) => {
            try {
                if (!socketRateLimiter.isAllowed(socket.id, 'delete_message')) {
                    const violations = socketRateLimiter.recordViolation(socket.id);
                    socket.emit('rate_limit_exceeded', { event: 'delete_message', retryAfter: socketRateLimiter.getRetryAfter(socket.id, 'delete_message') });
                    if (violations >= socketRateLimiter.disconnectThreshold) socket.disconnect(true);
                    return;
                }

                const parsed = deleteMessageSchema.safeParse(data);
                if (!parsed.success) {
                    emitValidationError(socket, 'delete_message', parsed.error.issues);
                    return;
                }

                const { roomId, messageId } = parsed.data;

                if (!socket.user) {
                    socket.emit('error', { message: 'Not authenticated' });
                    return;
                }

                // Find the message
                const message = await ChatLog.findById(messageId);

                if (!message) {
                    socket.emit('error', { message: 'Message not found' });
                    return;
                }

                // Check ownership - only allow deleting own messages
                if (message.senderId !== socket.user.userId) {
                    socket.emit('error', { message: 'You can only delete your own messages' });
                    return;
                }

                // Soft delete the message
                message.isDeleted = true;
                await message.save();

                // Broadcast deletion to room
                io.to(roomId).emit('message_deleted', { messageId });

                logger.info(`Message ${messageId} deleted by ${socket.user.email}`);
            } catch (error) {
                logger.error('Delete message error:', error);
                socket.emit('error', { message: 'Failed to delete message' });
            }
        });

        // Typing indicator
        socket.on('typing', (data: { roomId: string; isTyping: boolean }) => {
            if (!socketRateLimiter.isAllowed(socket.id, 'typing')) return;
            const typingParsed = typingSchema.safeParse(data);
            if (!typingParsed.success) return;
            if (!socket.user) return;

            socket.to(data.roomId).emit('user_typing', {
                userId: socket.user.userId,
                userName: socket.user.email.split('@')[0],
                isTyping: data.isTyping,
            });
        });

        // Leave room
        socket.on('leave_room', (roomId: string) => {
            // Clear typing indicator when leaving
            if (socket.user) {
                socket.to(roomId).emit('user_typing', {
                    userId: socket.user.userId,
                    userName: socket.user.email.split('@')[0],
                    isTyping: false,
                });

                // Remove user from room tracking
                if (roomUsers.has(roomId)) {
                    roomUsers.get(roomId)!.delete(socket.user.userId);
                    // Notify others that user left
                    socket.to(roomId).emit('user_left', { userId: socket.user.userId });
                    // Clean up empty room
                    if (roomUsers.get(roomId)!.size === 0) {
                        roomUsers.delete(roomId);
                    }
                }
            }
            socket.leave(roomId);
            socket.currentRoom = undefined;
            logger.info(`User ${socket.user?.email} left room ${roomId}`);
        });

        // Disconnect
        socket.on('disconnect', () => {
            socketRateLimiter.cleanup(socket.id);
            // Clear typing indicator and remove from room tracking
            if (socket.user && socket.currentRoom) {
                socket.to(socket.currentRoom).emit('user_typing', {
                    userId: socket.user.userId,
                    userName: socket.user.email.split('@')[0],
                    isTyping: false,
                });

                // Remove user from room tracking
                if (roomUsers.has(socket.currentRoom)) {
                    roomUsers.get(socket.currentRoom)!.delete(socket.user.userId);
                    // Notify others that user left
                    socket.to(socket.currentRoom).emit('user_left', { userId: socket.user.userId });
                    // Clean up empty room
                    if (roomUsers.get(socket.currentRoom)!.size === 0) {
                        roomUsers.delete(socket.currentRoom);
                    }
                }
            }
            logger.info(`User disconnected: ${socket.user?.email} (${socket.id})`);
        });
    });

    logger.info('✅ Socket.IO initialized');
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
    try {
        // Log silence event
        const silenceEvent = new SilenceEvent({
            courseId,
            groupId,
            chatSpaceId,
            silenceDuration: SILENCE_TIMEOUT_MS / 1000,
            interventionSent: true,
        });
        await silenceEvent.save();

        // Pick random intervention message
        const message = INTERVENTION_MESSAGES[Math.floor(Math.random() * INTERVENTION_MESSAGES.length)];

        // Save bot message
        const chatLog = new ChatLog({
            courseId,
            groupId,
            chatSpaceId,
            senderId: 'bot',
            senderName: 'CoRegula Bot',
            senderType: 'bot',
            content: message,
            isIntervention: true,
        });
        await chatLog.save();

        // Broadcast to room
        io.to(roomId).emit('receive_message', {
            id: chatLog._id?.toString(),
            senderId: 'bot',
            senderName: 'CoRegula Bot',
            senderType: 'bot',
            content: message,
            isIntervention: true,
            createdAt: chatLog.createdAt.toISOString(),
        });

        // Remove timer (don't restart until human responds)
        silenceTimers.delete(roomId);

        logger.info(`Intervention sent to room ${roomId}`);
    } catch (error) {
        logger.error('Intervention error:', error);
    }
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
        // Increment message count
        const currentCount = (roomMessageCount.get(roomId) || 0) + 1;
        roomMessageCount.set(roomId, currentCount);

        // Only check every N messages
        if (currentCount % MESSAGES_BEFORE_CHECK !== 0) {
            return;
        }

        // Check cooldown - don't intervene too frequently
        const lastIntervention = lastInterventionTime.get(roomId) || 0;
        if (Date.now() - lastIntervention < INTERVENTION_COOLDOWN_MS) {
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
        let interventionType: 'low_hot' | 'low_cognitive' | 'low_lexical' | 'general' | null = null;
        let qualityIssue = '';

        if (hotPercentage < QUALITY_THRESHOLDS.LOW_HOT) {
            interventionType = 'low_hot';
            qualityIssue = `HOT thinking: ${hotPercentage.toFixed(0)}%`;
        } else if (cognitiveRatio < QUALITY_THRESHOLDS.LOW_COGNITIVE) {
            interventionType = 'low_cognitive';
            qualityIssue = `Cognitive engagement: ${cognitiveRatio.toFixed(0)}%`;
        } else if (avgLexical < QUALITY_THRESHOLDS.LOW_LEXICAL) {
            interventionType = 'low_lexical';
            qualityIssue = `Lexical variety: ${avgLexical.toFixed(0)}%`;
        }

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
                    : QUALITY_INTERVENTIONS[interventionType][Math.floor(Math.random() * QUALITY_INTERVENTIONS[interventionType].length)];
            }
        } catch {
            interventionMessage = QUALITY_INTERVENTIONS[interventionType][Math.floor(Math.random() * QUALITY_INTERVENTIONS[interventionType].length)];
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
    userName: string,
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
