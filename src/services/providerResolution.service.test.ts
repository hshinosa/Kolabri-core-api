import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '../middleware/errorHandler.js';
import { ProviderResolutionService } from './providerResolution.service.js';

type ProviderRecord = {
    id: string;
    name: string;
    displayName: string;
    apiKey: string;
    baseUrl: string | null;
    isActive: boolean;
    fallbackOrder: number;
    config: Record<string, unknown> | null;
};

function createProvider(overrides: Partial<ProviderRecord> = {}): ProviderRecord {
    return {
        id: 'provider-openai',
        name: 'openai',
        displayName: 'OpenAI GPT',
        apiKey: 'encrypted-key',
        baseUrl: 'https://api.openai.com/v1',
        isActive: true,
        fallbackOrder: 1,
        config: {
            defaultModel: 'gpt-4o-mini',
            temperature: 0.4,
            maxTokens: 1024,
        },
        ...overrides,
    };
}

describe('ProviderResolutionService', () => {
    it('builds provider_context from the highest priority active provider', async () => {
        const providers = [
            createProvider({
                id: 'provider-openai',
                name: 'openai',
                fallbackOrder: 1,
                config: {
                    defaultModel: 'gpt-4o-mini',
                    temperature: 0.25,
                    maxTokens: 2048,
                },
            }),
            createProvider({
                id: 'provider-gemini',
                name: 'gemini',
                displayName: 'Gemini',
                fallbackOrder: 2,
                baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
                config: { defaultModel: 'gemini-1.5-pro' },
            }),
        ];

        const service = new ProviderResolutionService({
            providerRepository: {
                listActiveProvidersByFallbackOrder: vi.fn().mockResolvedValue(providers),
            },
            decryptApiKey: vi.fn().mockReturnValue('sk-live-openai'),
            now: vi.fn().mockReturnValue(new Date('2026-06-16T10:00:00.000Z')),
            requestIdFactory: vi.fn().mockReturnValue('req-provider-1'),
        });

        const result = await service.resolveProviderContext({ featureFamily: 'orchestration' });

        expect(result.primary.providerId).toBe('provider-openai');
        expect(result.primary.providerContext).toEqual({
            version: '1.0',
            provider: {
                name: 'openai',
                displayName: 'OpenAI GPT',
            },
            execution: {
                baseUrl: 'https://api.openai.com/v1',
                model: 'gpt-4o-mini',
                temperature: 0.25,
                maxTokens: 2048,
            },
            auth: {
                type: 'api-key',
                credential: 'sk-live-openai',
            },
            metadata: {
                featureFamily: 'orchestration',
                requestId: 'req-provider-1',
                resolvedAt: '2026-06-16T10:00:00.000Z',
            },
        });
        expect(result.fallbackChain.map((entry) => entry.providerContext.provider.name)).toEqual(['gemini']);
    });

    it('uses explicit model and request id overrides', async () => {
        const service = new ProviderResolutionService({
            providerRepository: {
                listActiveProvidersByFallbackOrder: vi.fn().mockResolvedValue([
                    createProvider({
                        config: {
                            models: [{ id: 'gpt-4.1-mini' }],
                            temperature: 0.6,
                        },
                    }),
                ]),
            },
            decryptApiKey: vi.fn().mockReturnValue('sk-live-openai'),
            now: vi.fn().mockReturnValue(new Date('2026-06-16T10:00:00.000Z')),
            requestIdFactory: vi.fn().mockReturnValue('req-generated'),
        });

        const result = await service.resolveProviderContext({
            featureFamily: 'summaries',
            preferredModel: 'gpt-4.1',
            requestId: 'req-explicit',
        });

        expect(result.primary.providerContext.execution.model).toBe('gpt-4.1');
        expect(result.primary.providerContext.metadata.requestId).toBe('req-explicit');
    });

    it('throws when no active providers are configured', async () => {
        const service = new ProviderResolutionService({
            providerRepository: {
                listActiveProvidersByFallbackOrder: vi.fn().mockResolvedValue([]),
            },
        });

        await expect(service.resolveProviderContext({ featureFamily: 'goals' })).rejects.toMatchObject({
            statusCode: ApiError.badRequest('No active AI provider configured').statusCode,
            message: 'No active AI provider configured',
        });
    });

    describe('executeWithFallback', () => {
        it('uses primary provider when it succeeds', async () => {
            const service = new ProviderResolutionService({
                providerRepository: {
                    listActiveProvidersByFallbackOrder: vi.fn().mockResolvedValue([
                        createProvider({ id: 'provider-openai', name: 'openai', fallbackOrder: 1 }),
                        createProvider({ id: 'provider-gemini', name: 'gemini', fallbackOrder: 2 }),
                    ]),
                },
                decryptApiKey: vi.fn().mockReturnValue('sk-test'),
            });
            const operation = vi.fn().mockResolvedValue({ success: true, data: 'primary-result' });

            const result = await service.executeWithFallback(
                { featureFamily: 'personal-chat' },
                operation,
                { isSuccess: (response) => response.success },
            );

            expect(result).toEqual({ success: true, data: 'primary-result' });
            expect(operation).toHaveBeenCalledTimes(1);
            expect(operation.mock.calls[0][0].provider.name).toBe('openai');
        });

        it('falls back to next provider when primary fails', async () => {
            const service = new ProviderResolutionService({
                providerRepository: {
                    listActiveProvidersByFallbackOrder: vi.fn().mockResolvedValue([
                        createProvider({ id: 'provider-openai', name: 'openai', fallbackOrder: 1 }),
                        createProvider({ id: 'provider-gemini', name: 'gemini', fallbackOrder: 2 }),
                    ]),
                },
                decryptApiKey: vi.fn().mockReturnValue('sk-test'),
            });
            const operation = vi.fn()
                .mockRejectedValueOnce(new Error('primary down'))
                .mockResolvedValueOnce({ success: true, data: 'fallback-result' });

            const result = await service.executeWithFallback(
                { featureFamily: 'personal-chat' },
                operation,
                { isSuccess: (response) => response.success },
            );

            expect(result).toEqual({ success: true, data: 'fallback-result' });
            expect(operation).toHaveBeenCalledTimes(2);
            expect(operation.mock.calls[0][0].provider.name).toBe('openai');
            expect(operation.mock.calls[1][0].provider.name).toBe('gemini');
        });

        it('falls back when primary returns unsuccessful result', async () => {
            const service = new ProviderResolutionService({
                providerRepository: {
                    listActiveProvidersByFallbackOrder: vi.fn().mockResolvedValue([
                        createProvider({ id: 'provider-openai', name: 'openai', fallbackOrder: 1 }),
                        createProvider({ id: 'provider-gemini', name: 'gemini', fallbackOrder: 2 }),
                    ]),
                },
                decryptApiKey: vi.fn().mockReturnValue('sk-test'),
            });
            const operation = vi.fn()
                .mockResolvedValueOnce({ success: false })
                .mockResolvedValueOnce({ success: true, data: 'fallback-result' });

            const result = await service.executeWithFallback(
                { featureFamily: 'personal-chat' },
                operation,
                { isSuccess: (response) => response.success },
            );

            expect(result).toEqual({ success: true, data: 'fallback-result' });
            expect(operation).toHaveBeenCalledTimes(2);
        });

        it('throws when all providers fail', async () => {
            const service = new ProviderResolutionService({
                providerRepository: {
                    listActiveProvidersByFallbackOrder: vi.fn().mockResolvedValue([
                        createProvider({ id: 'provider-openai', name: 'openai', fallbackOrder: 1 }),
                        createProvider({ id: 'provider-gemini', name: 'gemini', fallbackOrder: 2 }),
                    ]),
                },
                decryptApiKey: vi.fn().mockReturnValue('sk-test'),
            });
            const operation = vi.fn().mockRejectedValue(new Error('all down'));

            await expect(
                service.executeWithFallback(
                    { featureFamily: 'personal-chat' },
                    operation,
                    { isSuccess: (response) => response.success },
                ),
            ).rejects.toThrow('all down');
            expect(operation).toHaveBeenCalledTimes(2);
        });

        it('aborts a provider attempt that exceeds the bounded timeout', async () => {
            const service = new ProviderResolutionService({
                providerRepository: {
                    listActiveProvidersByFallbackOrder: vi.fn().mockResolvedValue([
                        createProvider({ id: 'provider-openai', name: 'openai', fallbackOrder: 1 }),
                        createProvider({ id: 'provider-gemini', name: 'gemini', fallbackOrder: 2 }),
                    ]),
                },
                decryptApiKey: vi.fn().mockReturnValue('sk-test'),
            });
            const operation = vi.fn()
                .mockImplementationOnce(async () => {
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                    return { success: true };
                })
                .mockResolvedValueOnce({ success: true, data: 'fallback-result' });

            const result = await service.executeWithFallback(
                { featureFamily: 'personal-chat' },
                operation,
                { isSuccess: (response) => response.success, perProviderTimeoutMs: 50 },
            );

            expect(result).toEqual({ success: true, data: 'fallback-result' });
            expect(operation).toHaveBeenCalledTimes(2);
        });

        it('emits structured metrics for successful primary attempt', async () => {
            const metricsLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
            const service = new ProviderResolutionService({
                providerRepository: {
                    listActiveProvidersByFallbackOrder: vi.fn().mockResolvedValue([
                        createProvider({ id: 'provider-openai', name: 'openai', fallbackOrder: 1 }),
                    ]),
                },
                decryptApiKey: vi.fn().mockReturnValue('sk-test'),
                metricsLogger,
                now: vi.fn().mockReturnValue(new Date('2026-06-16T10:00:00.000Z')),
            });

            await service.executeWithFallback(
                { featureFamily: 'personal-chat' },
                () => Promise.resolve({ success: true }),
                { isSuccess: (response: { success: boolean }) => response.success },
            );

            expect(metricsLogger.info).toHaveBeenCalledWith(
                'provider_resolution_completed',
                expect.objectContaining({ featureFamily: 'personal-chat', providerCount: 1 }),
            );
            expect(metricsLogger.info).toHaveBeenCalledWith(
                'provider_operation_succeeded',
                expect.objectContaining({
                    featureFamily: 'personal-chat',
                    providerName: 'openai',
                    attemptIndex: 0,
                    fallbackUsed: false,
                }),
            );
            expect(metricsLogger.error).not.toHaveBeenCalled();
        });

        it('emits structured metrics when fallback is used', async () => {
            const metricsLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
            const service = new ProviderResolutionService({
                providerRepository: {
                    listActiveProvidersByFallbackOrder: vi.fn().mockResolvedValue([
                        createProvider({ id: 'provider-openai', name: 'openai', fallbackOrder: 1 }),
                        createProvider({ id: 'provider-gemini', name: 'gemini', fallbackOrder: 2 }),
                    ]),
                },
                decryptApiKey: vi.fn().mockReturnValue('sk-test'),
                metricsLogger,
            });

            await service.executeWithFallback(
                { featureFamily: 'summaries' },
                vi.fn()
                    .mockRejectedValueOnce(new Error('primary down'))
                    .mockResolvedValueOnce({ success: true, summary: 'ok' }),
                { isSuccess: (response: { success: boolean }) => response.success },
            );

            expect(metricsLogger.warn).toHaveBeenCalledWith(
                'provider_fallback_attempt_failed',
                expect.objectContaining({
                    featureFamily: 'summaries',
                    providerName: 'openai',
                    attemptIndex: 0,
                    errorMessage: 'primary down',
                }),
            );
            expect(metricsLogger.info).toHaveBeenCalledWith(
                'provider_operation_succeeded',
                expect.objectContaining({
                    featureFamily: 'summaries',
                    providerName: 'gemini',
                    attemptIndex: 1,
                    fallbackUsed: true,
                }),
            );
        });

        it('emits structured metrics when all providers fail', async () => {
            const metricsLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
            const service = new ProviderResolutionService({
                providerRepository: {
                    listActiveProvidersByFallbackOrder: vi.fn().mockResolvedValue([
                        createProvider({ id: 'provider-openai', name: 'openai', fallbackOrder: 1 }),
                    ]),
                },
                decryptApiKey: vi.fn().mockReturnValue('sk-test'),
                metricsLogger,
            });

            await expect(
                service.executeWithFallback(
                    { featureFamily: 'goals' },
                    () => Promise.reject(new Error('provider down')),
                    { isSuccess: (response: { success: boolean }) => response.success },
                ),
            ).rejects.toThrow('provider down');

            expect(metricsLogger.error).toHaveBeenCalledWith(
                'provider_operation_failed_all_providers',
                expect.objectContaining({
                    featureFamily: 'goals',
                    providerCount: 1,
                    errorMessage: 'provider down',
                }),
            );
        });

        it('emits structured metrics when no active providers are configured', async () => {
            const metricsLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
            const service = new ProviderResolutionService({
                providerRepository: {
                    listActiveProvidersByFallbackOrder: vi.fn().mockResolvedValue([]),
                },
                metricsLogger,
            });

            await expect(service.resolveProviderContext({ featureFamily: 'analytics' })).rejects.toThrow('No active AI provider configured');

            expect(metricsLogger.warn).toHaveBeenCalledWith(
                'provider_resolution_failed',
                expect.objectContaining({
                    featureFamily: 'analytics',
                    reason: 'no_active_providers',
                }),
            );
        });
    });
});
