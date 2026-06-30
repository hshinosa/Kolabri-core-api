/**
 * Auto-close job — closes session discussions that have been inactive (no new messages)
 * for more than 3 hours. Triggers auto-attendance generation on close.
 *
 * BR-023: Sesi diskusi yang tidak memiliki pesan baru selama 3 jam akan ditutup otomatis.
 */

import prisma from '../config/database.js';
import { ChatLog } from '../models/ChatLog.js';
import { SessionDiscussionService } from '../services/sessionDiscussion.service.js';
import { logger } from '../utils/logger.js';

const AUTO_CLOSE_THRESHOLD_HOURS = 3;
const CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

let intervalHandle: NodeJS.Timeout | null = null;

export async function runAutoCloseJob(): Promise<{ closed: number; errors: number }> {
    const threshold = new Date(Date.now() - AUTO_CLOSE_THRESHOLD_HOURS * 60 * 60 * 1000);

    // Find open sessions
    const openSessions = await prisma.sessionDiscussion.findMany({
        where: {
            closedAt: null,
            deletedAt: null,
        },
        select: { id: true, name: true, createdAt: true },
    });

    if (openSessions.length === 0) {
        return { closed: 0, errors: 0 };
    }

    let closed = 0;
    let errors = 0;

    for (const session of openSessions) {
        try {
            // Check last message timestamp
            const lastMessage = await ChatLog.findOne({
                sessionDiscussionId: session.id,
                deletedAt: null,
            })
                .sort({ createdAt: -1 })
                .select('createdAt')
                .lean();

            // If no messages at all, use session creation time
            const lastActivity = lastMessage?.createdAt ?? session.createdAt;

            if (lastActivity < threshold) {
                logger.info('Auto-closing inactive session', {
                    sessionDiscussionId: session.id,
                    name: session.name,
                    lastActivity: lastActivity.toISOString(),
                });

                await SessionDiscussionService.closeSession(session.id, 'system', 'admin');
                closed++;
            }
        } catch (error) {
            logger.warn('Auto-close failed for session', {
                sessionDiscussionId: session.id,
                error: error instanceof Error ? error.message : String(error),
            });
            errors++;
        }
    }

    if (closed > 0 || errors > 0) {
        logger.info('Auto-close job completed', { closed, errors });
    }

    return { closed, errors };
}

export function startAutoCloseJob(): void {
    if (intervalHandle) {
        return;
    }

    // Run once on startup
    runAutoCloseJob().catch(err => logger.error('[AutoClose] Startup error:', err));

    // Schedule periodic check
    intervalHandle = setInterval(() => {
        runAutoCloseJob().catch(err => logger.error('[AutoClose] Error:', err));
    }, CHECK_INTERVAL_MS);

    logger.info('Auto-close job started', {
        intervalMinutes: CHECK_INTERVAL_MS / 60000,
        thresholdHours: AUTO_CLOSE_THRESHOLD_HOURS,
    });
}

export function stopAutoCloseJob(): void {
    if (intervalHandle) {
        clearInterval(intervalHandle);
        intervalHandle = null;
    }
}
