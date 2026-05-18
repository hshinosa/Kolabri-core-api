import 'dotenv/config';

import http from 'node:http';
import { formatEnvError, parseEnv } from './config/env.js';
import { logger } from './utils/logger.js';

const envResult = parseEnv();
if (!envResult.success) {
    // eslint-disable-next-line no-console
    console.error(formatEnvError(envResult.error));
    process.exit(1);
}
const env = envResult.data;

import app from './app.js';
import { getIO, initSocketIO } from './socket/index.js';
import { connectMongoDB, disconnectMongoDB } from './config/mongodb.js';
import { initRedis, disconnectRedis } from './config/redis.js';
import prisma from './config/database.js';
import { setupWebSocket } from './websocket/server.js';

const SHUTDOWN_TIMEOUT_MS = 30_000;

async function bootstrap() {
    try {
        await connectMongoDB();
        initRedis(env.REDIS_URL);

        const server = http.createServer(app);

        initSocketIO(server);

        setupWebSocket(server);

        server.listen(env.PORT, () => {
            logger.info(`Kolabri Core API running on port ${env.PORT}`);
            logger.info(`Environment: ${env.NODE_ENV}`);
            logger.info(`Health check: http://localhost:${env.PORT}/health`);
        });

        let shuttingDown = false;
        const shutdown = async (signal: string) => {
            if (shuttingDown) return;
            shuttingDown = true;
            logger.info(`Received ${signal}, starting graceful shutdown`);

            // Force-exit guard so a hung resource never holds the process forever.
            const forceExit = setTimeout(() => {
                logger.error('Forced shutdown after timeout');
                process.exit(1);
            }, SHUTDOWN_TIMEOUT_MS);
            forceExit.unref();

            try {
                await new Promise<void>((resolve) => {
                    server.close((err) => {
                        if (err) logger.warn('HTTP server close error:', err);
                        else logger.info('HTTP server closed');
                        resolve();
                    });
                });

                try {
                    const io = getIO();
                    await new Promise<void>((resolve) => io.close(() => resolve()));
                    logger.info('Socket.IO closed');
                } catch (err) {
                    logger.warn('Socket.IO close error:', err);
                }

                try {
                    await prisma.$disconnect();
                    logger.info('Prisma disconnected');
                } catch (err) {
                    logger.warn('Prisma disconnect error:', err);
                }

                try {
                    await disconnectMongoDB();
                } catch (err) {
                    logger.warn('Mongo disconnect error:', err);
                }

                try {
                    await disconnectRedis();
                } catch (err) {
                    logger.warn('Redis disconnect error:', err);
                }

                clearTimeout(forceExit);
                process.exit(0);
            } catch (err) {
                logger.error('Shutdown error:', err);
                clearTimeout(forceExit);
                process.exit(1);
            }
        };

        process.on('SIGTERM', () => void shutdown('SIGTERM'));
        process.on('SIGINT', () => void shutdown('SIGINT'));
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

bootstrap();
