import { afterEach, describe, expect, it, vi } from 'vitest';

type MockLogger = {
    add: ReturnType<typeof vi.fn>;
    level: string;
    format: unknown;
    transports: unknown[];
};

describe('logger', () => {
    afterEach(() => {
        vi.resetModules();
        vi.unstubAllEnvs();
        vi.clearAllMocks();
    });

    it('creates a debug logger outside production', async () => {
        vi.stubEnv('NODE_ENV', 'test');

        const createLogger = vi.fn((config) => ({
            ...config,
            add: vi.fn(),
        }));

        const consoleTransport = vi.fn((config) => ({ type: 'console', config }));
        const fileTransport = vi.fn((config) => ({ type: 'file', config }));
        const combine = vi.fn((...parts) => ({ type: 'combine', parts }));
        const timestamp = vi.fn((config) => ({ type: 'timestamp', config }));
        const printf = vi.fn((formatter) => formatter({
            level: 'info',
            message: 'hello',
            timestamp: '2026-05-01 10:00:00',
        }));
        const colorize = vi.fn(() => ({ type: 'colorize' }));
        const errors = vi.fn((config) => ({ type: 'errors', config }));

        vi.doMock('winston', () => ({
            default: {
                createLogger,
                transports: {
                    Console: consoleTransport,
                    File: fileTransport,
                },
                format: {
                    combine,
                    timestamp,
                    printf,
                    colorize,
                    errors,
                },
            },
        }));

        const { logger } = await import('./logger.js');

        expect(createLogger).toHaveBeenCalledTimes(1);
        const createdLogger = logger as unknown as MockLogger;
        expect(createdLogger.level).toBe('debug');
        expect(consoleTransport).toHaveBeenCalledTimes(1);
        expect(fileTransport).not.toHaveBeenCalled();
        expect(createdLogger.add).not.toHaveBeenCalled();
        expect(printf).toHaveReturnedWith('2026-05-01 10:00:00 [info]: hello');
    });

    it('adds file transports in production', async () => {
        vi.stubEnv('NODE_ENV', 'production');

        const add = vi.fn();
        const createLogger = vi.fn((config) => ({
            ...config,
            add,
        }));

        const consoleTransport = vi.fn((config) => ({ type: 'console', config }));
        const fileTransport = vi.fn((config) => ({ type: 'file', config }));
        const combine = vi.fn((...parts) => ({ type: 'combine', parts }));
        const timestamp = vi.fn((config) => ({ type: 'timestamp', config }));
        const printf = vi.fn((formatter) => formatter({
            level: 'error',
            message: 'failed',
            timestamp: '2026-05-01 10:00:00',
            stack: 'Error: failed',
        }));
        const colorize = vi.fn(() => ({ type: 'colorize' }));
        const errors = vi.fn((config) => ({ type: 'errors', config }));

        vi.doMock('winston', () => ({
            default: {
                createLogger,
                transports: {
                    Console: consoleTransport,
                    File: fileTransport,
                },
                format: {
                    combine,
                    timestamp,
                    printf,
                    colorize,
                    errors,
                },
            },
        }));

        const { logger } = await import('./logger.js');

        const createdLogger = logger as unknown as MockLogger;
        expect(createdLogger.level).toBe('info');
        expect(fileTransport).toHaveBeenNthCalledWith(1, {
            filename: 'logs/error.log',
            level: 'error',
        });
        expect(fileTransport).toHaveBeenNthCalledWith(2, {
            filename: 'logs/combined.log',
        });
        expect(add).toHaveBeenCalledTimes(2);
        expect(printf).toHaveReturnedWith('2026-05-01 10:00:00 [error]: Error: failed');
    });
});
