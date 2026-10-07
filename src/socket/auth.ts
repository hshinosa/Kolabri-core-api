// PERF-WS-02: Cache verified tokens to reduce JWT verify + DB lookup overhead
const tokenCache = new Map<string, { user: JwtPayload; exp: number }>();
const TOKEN_CACHE_TTL_MS = 60 * 1000; // 1 minute
import jwt from 'jsonwebtoken';
import type { Server, Socket } from 'socket.io';
import { logger } from '../utils/logger.js';
import { JwtPayload } from '../middleware/auth.js';
import prisma from '../config/database.js';
import { isRevokedBefore } from '../utils/tokenRevocation.js';
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

        // F3 pass2: token yang sudah dicabut (logout/reset) tidak boleh
        // membuka socket walau lolos jwt.verify — cek sebelum pakai cache.
        const preCached = tokenCache.get(token as string);
        if (preCached && Date.now() < preCached.exp) {
            if (await isRevokedBefore(preCached.user.userId, preCached.user.iat)) {
                tokenCache.delete(token as string);
                logger.warn(`Socket auth rejected: revoked token (cache) for ${preCached.user.userId}`);
                return next(new Error('Token revoked'));
            }
            authed.user = preCached.user;
            logger.debug(`Socket auth cache hit for user: ${preCached.user.userId}`);
            return next();
        }

        const decoded = jwt.verify(token as string, secret) as JwtPayload;

        // H3 (F2): token berbagi analytics tanpa klaim identitas tidak boleh
        // membuka sesi socket — tanpa cek ini prisma mengabaikan id:undefined.
        if (typeof decoded.userId !== 'string' || decoded.userId.trim() === '') {
            logger.warn('Socket auth rejected: token missing userId claim');
            return next(new Error('Invalid token'));
        }

        const user = await prisma.user.findFirst({
            where: { id: decoded.userId, deletedAt: null, isActive: true },
            select: { id: true },
        });

        if (!user) {
            logger.warn(`Socket auth rejected: User ${decoded.userId} not found or inactive`);
            return next(new Error('User not found'));
        }

        // F3 pass2: cabut sesi logout/reset — samakan dgn jalur HTTP.
        if (await isRevokedBefore(decoded.userId, decoded.iat)) {
            logger.warn(`Socket auth rejected: revoked token for ${decoded.userId}`);
            return next(new Error('Token revoked'));
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
