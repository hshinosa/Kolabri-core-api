import 'dotenv/config';

import http from 'node:http';
import app from './app.js';
import { initSocketIO } from './socket/index.js';
import { connectMongoDB } from './config/mongodb.js';
import { logger } from './utils/logger.js';
import { setupWebSocket } from './websocket/server.js';

const PORT = process.env.PORT || 3000;

async function bootstrap() {
    try {
        // Connect to MongoDB
        await connectMongoDB();

        // Create HTTP server
        const server = http.createServer(app);

        // Initialize Socket.IO
        initSocketIO(server);

        // Initialize admin WebSocket
        setupWebSocket(server);

        // Start server
        server.listen(PORT, () => {
            logger.info(`🚀 Kolabri Core API running on port ${PORT}`);
            logger.info(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
            logger.info(`🔗 Health check: http://localhost:${PORT}/health`);
        });

        // Graceful shutdown
        const shutdown = async () => {
            logger.info('Shutting down gracefully...');
            server.close(() => {
                logger.info('HTTP server closed');
                process.exit(0);
            });
        };

        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

bootstrap();
