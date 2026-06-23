/**
 * Retention Cleanup Job (NFR-DATA-01)
 * 
 * Scheduled job that enforces data retention policies.
 * Runs daily (configurable) to clean up soft-deleted records
 * that have exceeded their retention period.
 */

import cron from 'node-cron';
import { PrismaClient, DataType } from '@prisma/client';
import { ChatLog } from '../models/ChatLog.js';
import { logger } from '../utils/logger.js';

const prisma = new PrismaClient();

/**
 * Map DataType enum to Prisma model delegate name
 */
function getModelName(dataType: DataType): keyof PrismaClient | null {
    const mapping: Record<DataType, keyof PrismaClient | null> = {
        [DataType.USER]: 'user',
        [DataType.COURSE]: 'course',
        [DataType.GROUP]: 'group',
        [DataType.SESSION_DISCUSSION]: 'sessionDiscussion',
        [DataType.KNOWLEDGE_BASE]: 'knowledgeBase',
        [DataType.CHAT_LOG]: null, // Handled separately (MongoDB)
    };
    
    return mapping[dataType];
}

/**
 * Hard delete records from a Prisma model where deletedAt < retentionDate
 */
async function hardDeleteByModel(
    modelName: keyof PrismaClient,
    retentionDate: Date
): Promise<number> {
    try {
        const model = prisma[modelName] as any;
        
        if (!model || typeof model.deleteMany !== 'function') {
            logger.warn(`[Retention] Model ${String(modelName)} does not support deleteMany`);
            return 0;
        }
        
        const result = await model.deleteMany({
            where: {
                deletedAt: {
                    lt: retentionDate,
                    not: null,
                },
            },
        });
        
        return result.count || 0;
    } catch (error) {
        logger.error(`[Retention] Error deleting from ${String(modelName)}:`, error);
        return 0;
    }
}

/**
 * Count records in a Prisma model where deletedAt < retentionDate
 */
async function countByModel(
    modelName: keyof PrismaClient,
    retentionDate: Date
): Promise<number> {
    try {
        const model = prisma[modelName] as any;
        
        if (!model || typeof model.count !== 'function') {
            logger.warn(`[Retention] Model ${String(modelName)} does not support count`);
            return 0;
        }
        
        const count = await model.count({
            where: {
                deletedAt: {
                    lt: retentionDate,
                    not: null,
                },
            },
        });
        
        return count || 0;
    } catch (error) {
        logger.error(`[Retention] Error counting ${String(modelName)}:`, error);
        return 0;
    }
}

/**
 * Start the retention cleanup cron job
 */
export function startRetentionCleanup(): void {
    // Schedule from env or default to daily at 02:00 UTC
    const schedule = process.env.RETENTION_CRON || '0 2 * * *';
    
    cron.schedule(schedule, async () => {
        logger.info('[Retention] Starting daily cleanup...');
        
        try {
            const policies = await prisma.dataRetentionPolicy.findMany();
            let purged = 0;
            let skipped = 0;
            
            for (const policy of policies) {
                const retentionDate = new Date(
                    Date.now() - policy.retentionDays * 24 * 60 * 60 * 1000
                );
                
                logger.debug(`[Retention] Processing ${policy.dataType}: retentionDays=${policy.retentionDays}, autoPurge=${policy.autoPurge}`);
                
                if (policy.dataType === DataType.CHAT_LOG) {
                    // MongoDB ChatLog cleanup
                    if (policy.autoPurge) {
                        const result = await ChatLog.deleteMany({
                            deletedAt: { $lt: retentionDate, $ne: null },
                        });
                        const deletedCount = result.deletedCount || 0;
                        purged += deletedCount;
                        
                        if (deletedCount > 0) {
                            logger.info(`[Retention] Purged ${deletedCount} CHAT_LOG records`);
                        }
                    } else {
                        const count = await ChatLog.countDocuments({
                            deletedAt: { $lt: retentionDate, $ne: null },
                        });
                        skipped += count;
                        
                        if (count > 0) {
                            logger.info(`[Retention] Skipped ${count} CHAT_LOG records (autoPurge disabled)`);
                        }
                    }
                } else {
                    // PostgreSQL model cleanup
                    const modelName = getModelName(policy.dataType);
                    
                    if (!modelName) {
                        logger.warn(`[Retention] No model mapping for ${policy.dataType}`);
                        continue;
                    }
                    
                    if (policy.autoPurge) {
                        const deletedCount = await hardDeleteByModel(modelName, retentionDate);
                        purged += deletedCount;
                        
                        if (deletedCount > 0) {
                            logger.info(`[Retention] Purged ${deletedCount} ${policy.dataType} records`);
                        }
                    } else {
                        const count = await countByModel(modelName, retentionDate);
                        skipped += count;
                        
                        if (count > 0) {
                            logger.info(`[Retention] Skipped ${count} ${policy.dataType} records (autoPurge disabled)`);
                        }
                    }
                }
            }
            
            logger.info(`[Retention] Cleanup complete: purged=${purged}, skipped=${skipped}`);
        } catch (error) {
            logger.error('[Retention] Cleanup failed:', error);
        }
    });
    
    logger.info(`[Retention] Scheduled cleanup job: ${schedule}`);
}
