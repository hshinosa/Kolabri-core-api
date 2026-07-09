// PERF-WS-02: Cache verified tokens to reduce JWT verify + DB lookup overhead
const tokenCache = new Map<string, { user: JwtPayload; exp: number }>();
const TOKEN_CACHE_TTL_MS = 60 * 1000; // 1 minute
import jwt from 'jsonwebtoken';
import type { Server, Socket } from 'socket.io';
import { logger } from '../utils/logger.js';
import { JwtPayload } from '../middleware/auth.js';
import prisma from '../config/database.js';
import type { AuthenticatedSocket } from './types.js';

type NextFn = Parameters<Parameters<Server['use']>[0]>[1];

export async function authMiddleware(socket: Socket, next: NextFn): Promise<void> {
    const authed = socket as AuthenticatedSocket;
    try {
        const token = authed.handshake.auth.token;

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

        // PERF-WS-02: Check token cache first
        const cached = tokenCache.get(token as string);
        if (cached && Date.now() < cached.exp) {
            authed.user = cached.user;
            logger.debug(`Socket auth cache hit for user: ${cached.user.userId}`);
            return next();
        }

        const decoded = jwt.verify(token as string, secret) as JwtPayload;

        const user = await prisma.user.findFirst({
            where: { id: decoded.userId, deletedAt: null, isActive: true },
            select: { id: true },
        });

        if (!user) {
            logger.warn(`Socket auth rejected: User ${decoded.userId} not found or inactive`);
            return next(new Error('User not found'));
        }

        // PERF-WS-02: Cache the verified JWT payload for future connections
        tokenCache.set(token as string, {
            user: decoded,
            exp: Date.now() + TOKEN_CACHE_TTL_MS,
        });

        authed.user = decoded;

        logger.debug(`Socket auth success for user: ${decoded.userId}`);

        next();
    } catch (error) {
        logger.error('Socket auth error:', error);
        next(new Error('Invalid token'));
    }
}
