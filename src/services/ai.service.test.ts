import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AIProviderAdapter, AIProviderResponse } from './ai-providers/base-adapter.js';
import { AIService } from './ai.service.js';

type ProviderRecord = {
    id: string;
    name: string;
    displayName: string;
    apiKey: string;
    baseUrl: string | null;
    isActive: boolean;
    fallbackOrder: number;
    config: Record<string, unknown>;
};

function createAdapter(response: AIProviderResponse, options?: { fail?: boolean }): AIProviderAdapter {
    return {
        async sendMessage() {
            if (options?.fail) {
                throw new Error('provider failed');
            }

            return response;
        },
        estimateCost(promptTokens: number, completionTokens: number) {
            return Number(((promptTokens + completionTokens) / 1000).toFixed(4));
        },
    };
}

describe('AIService', () => {
    const providers: ProviderRecord[] = [
        {
            id: 'provider-openai',
            name: 'openai',
            displayName: 'OpenAI',
            apiKey: 'encrypted-openai',
            baseUrl: null,
            isActive: true,
            fallbackOrder: 1,
            config: { defaultModel: 'gpt-4' },
        },
        {
            id: 'provider-claude',
            name: 'anthropic',
            displayName: 'Claude',
            apiKey: 'encrypted-claude',
            baseUrl: null,
            isActive: true,
            fallbackOrder: 2,
            config: { defaultModel: 'claude-3-5-sonnet' },
        },
    ];

    const usageTrackingService = {
        trackUsage: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('falls back to the next provider and tracks usage', async () => {
        const service = new AIService({
            providerRepository: {
                getActiveProvider: async () => providers[0],
                getProviderByName: async (providerName: string) => providers.find((provider) => provider.name === providerName) ?? null,
                listActiveProvidersByFallbackOrder: async () => providers,
            },
            usageTrackingService,
            adapterFactory: (providerName: string) => {
                if (providerName === 'openai') {
                    return createAdapter({
                        content: '',
                        promptTokens: 0,
                        completionTokens: 0,
                        totalTokens: 0,
                        model: 'gpt-4',
                        latencyMs: 10,
                    }, { fail: true });
                }

                return createAdapter({
                    content: 'Fallback success',
                    promptTokens: 120,
                    completionTokens: 80,
                    totalTokens: 200,
                    model: 'claude-3-5-sonnet',
                    latencyMs: 250,
                });
            },
            decryptApiKey: (value: string) => value,
            retryOptions: { attempts: 1, baseDelayMs: 0 },
        });

        const result = await service.sendWithConfiguredFallback('Explain fallback providers', {
            userId: 'user-1',
            courseId: 'course-1',
        });

        expect(result.provider).toBe('anthropic');
        expect(result.content).toBe('Fallback success');
        expect(usageTrackingService.trackUsage).toHaveBeenCalledTimes(1);
        expect(usageTrackingService.trackUsage).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: 'user-1',
                courseId: 'course-1',
                provider: 'anthropic',
                model: 'claude-3-5-sonnet',
                totalTokens: 200,
                estimatedCost: 0.2,
            })
        );
    });
});
