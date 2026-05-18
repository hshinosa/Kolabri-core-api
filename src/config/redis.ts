import { Redis } from 'ioredis';
import { logger } from '../utils/logger.js';

let _redis: Redis | null = null;
let _initialized = false;

export function initRedis(url: string | undefined): Redis | null {
    if (_initialized) return _redis;
    _initialized = true;

    if (!url) {
        logger.info('Redis disabled: REDIS_URL not configured');
        return null;
    }

    try {
        _redis = new Redis(url, {
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            lazyConnect: false,
        });

        _redis.on('error', (err: Error) => {
            logger.error('Redis client error', err);
        });

        _redis.on('ready', () => {
            logger.info('Redis client ready');
        });

        return _redis;
    } catch (error) {
        logger.error('Failed to initialize Redis client', error as Error);
        _redis = null;
        return null;
    }
}

export function getRedis(): Redis | null {
    return _redis;
}

export async function disconnectRedis(): Promise<void> {
    if (!_redis) return;
    try {
        await _redis.quit();
    } catch {
        _redis.disconnect();
    }
    _redis = null;
    _initialized = false;
}

export function _resetRedisForTests(): void {
    _redis = null;
    _initialized = false;
}
