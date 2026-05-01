import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { rateLimiter } from './middleware/rateLimiter.js';

// Routes
import authRoutes from './routes/auth.routes.js';
import courseRoutes from './routes/course.routes.js';
import groupRoutes from './routes/group.routes.js';
import goalRoutes from './routes/goal.routes.js';
import reflectionRoutes from './routes/reflection.routes.js';
import aiChatRoutes from './routes/aiChat.routes.js';
import chatSpaceRoutes from './routes/chatSpace.routes.js';
import healthRoutes from './routes/health.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import userRoutes from './routes/user.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import courseAdminRoutes from './routes/course-admin.routes.js';
import courseTemplateRoutes from './routes/course-template.routes.js';
import aiProviderRoutes from './routes/ai-provider.routes.js';
import adminAiRoutes from './routes/admin-ai.routes.js';
import auditLogRoutes from './routes/audit-log.routes.js';

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
app.use('/api/ai-chats', aiChatRoutes);
app.use('/api/chat-spaces', chatSpaceRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin/users', userRoutes);
app.use('/api/admin/dashboard', dashboardRoutes);
app.use('/api/admin/courses', courseAdminRoutes);
app.use('/api/admin/course-templates', courseTemplateRoutes);
app.use('/api/admin/ai-providers', aiProviderRoutes);
app.use('/api/admin/audit-logs', auditLogRoutes);
app.use('/api/admin', adminAiRoutes);
app.use('/health', healthRoutes);

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
