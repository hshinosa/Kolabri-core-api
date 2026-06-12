import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { errorHandler, requestIdMiddleware } from './middleware/error.middleware.js';
import { requestLogger } from './middleware/requestLogger.js';
import { rateLimiter } from './middleware/rateLimiter.js';
import { sanitizeBody } from './middleware/sanitize.js';

// Routes
import authRoutes from './routes/auth.routes.js';
import courseRoutes from './routes/course.routes.js';
import groupRoutes from './routes/group.routes.js';
import goalRoutes from './routes/goal.routes.js';
import reflectionRoutes from './routes/reflection.routes.js';
import aiChatRoutes from './routes/aiChat.routes.js';
import chatSpaceRoutes from './routes/chatSpace.routes.js';
import chatRoutes from './routes/chat.routes.js';
import discussionDirectionRoutes from './routes/discussion-direction.routes.js';
import discussionHealthRoutes from './routes/discussion-health.routes.js';
import healthRoutes from './routes/health.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import userRoutes from './routes/user.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import courseAdminRoutes from './routes/course-admin.routes.js';
import courseTemplateRoutes from './routes/course-template.routes.js';
import aiProviderRoutes from './routes/ai-provider.routes.js';
import adminAiRoutes from './routes/admin-ai.routes.js';
import auditLogRoutes from './routes/audit-log.routes.js';
import webhookRoutes from './routes/webhook.routes.js';
import lecturerAiRoutes from './routes/lecturer-ai.routes.js';
import escalationRoutes from './routes/escalation.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import userPreferencesRoutes from './routes/user-preferences.routes.js';
import studentRoutes from './routes/student.routes.js';
import privacyRoutes from './routes/privacy.routes.js';
import consentRoutes from './routes/consent.routes.js';
import privacyPreferencesRoutes from './routes/privacy-preferences.routes.js';
import dataExportRoutes from './routes/data-export.routes.js';
import courseExportRoutes from './routes/course-export.routes.js';
import retentionPolicyRoutes from './routes/retention-policy.routes.js';
import internalRoutes from './routes/internal.routes.js';

const app = express();

const allowedOrigins = [
    process.env.CLIENT_URL || 'http://localhost:8000',
    'http://localhost:8000',
    'http://localhost:8080',
    'http://127.0.0.1:8000',
    'http://127.0.0.1:8080',
];

app.use(
    cors({
        origin: function (origin, callback) {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(null, false);
            }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    })
);

app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'", process.env.CLIENT_URL || 'http://localhost:8000'],
        },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true },
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(sanitizeBody);

// Request ID tracking
app.use(requestIdMiddleware);

// Request logging
app.use(requestLogger);

// Rate limiting
app.use(rateLimiter);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/reflections', reflectionRoutes);
app.use('/api/ai-chat', aiChatRoutes);
app.use('/api/ai-chats', aiChatRoutes);
app.use('/api/chat-spaces', chatSpaceRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/discussion-direction', discussionDirectionRoutes);
app.use('/api/lecturer/discussion-health', discussionHealthRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin/users', userRoutes);
app.use('/api/admin/dashboard', dashboardRoutes);
app.use('/api/admin/courses', courseAdminRoutes);
app.use('/api/admin/course-templates', courseTemplateRoutes);
app.use('/api/admin/ai-providers', aiProviderRoutes);
app.use('/api/admin/audit-logs', auditLogRoutes);
app.use('/api/admin/retention-policies', retentionPolicyRoutes);
app.use('/api/admin', adminAiRoutes);
app.use('/api/lecturer/ai', lecturerAiRoutes);
app.use('/api/lecturer/escalations', escalationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/user', userPreferencesRoutes);
app.use('/api/user', privacyPreferencesRoutes);
app.use('/api/user/data-export', dataExportRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/privacy', privacyRoutes);
app.use('/api/consent', consentRoutes);
app.use('/api/health', healthRoutes);
app.use('/health', healthRoutes);
app.use('/api/internal', internalRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api', courseExportRoutes);

// 404 handler
app.use((_req, res) => {
    res.status(404).json({
        error: {
            code: 'NOT_FOUND',
            message: 'The requested resource was not found',
        },
    });
});

// Global error handler
app.use(errorHandler);

export default app;
