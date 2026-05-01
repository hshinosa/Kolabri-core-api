import prisma from '../config/database.js';
import { ApiError } from '../middleware/errorHandler.js';
import { decrypt } from '../utils/encryption.js';
import { logger } from '../utils/logger.js';
import { AnthropicAdapter } from './ai-providers/anthropic-adapter.js';
import type { AIProviderAdapter, AIProviderResponse } from './ai-providers/base-adapter.js';
import { GeminiAdapter } from './ai-providers/gemini-adapter.js';
import { OpenAIAdapter } from './ai-providers/openai-adapter.js';
import { usageTrackingService, type AiUsageData, type UsageTrackingService } from './usage-tracking.service.js';

type ProviderConfigRecord = Record<string, unknown>;

type ProviderRecord = {
    id: string;
    name: string;
    displayName: string;
    apiKey: string;
    baseUrl: string | null;
    isActive: boolean;
    fallbackOrder: number;
    config: ProviderConfigRecord | null;
};

type ProviderRepository = {
    getActiveProvider(): Promise<ProviderRecord | null>;
    getProviderByName(providerName: string): Promise<ProviderRecord | null>;
    listActiveProvidersByFallbackOrder(): Promise<ProviderRecord[]>;
};

const aiProviderDelegate = (prisma as unknown as {
    ['aiProvider']: {
        findFirst: (args: unknown) => Promise<ProviderRecord | null>;
        findUnique: (args: unknown) => Promise<ProviderRecord | null>;
        findMany: (args: unknown) => Promise<ProviderRecord[]>;
    };
})['aiProvider'];

const aiModelComparisonDelegate = (prisma as unknown as {
    ['aiModelComparison']: {
        create: (args: unknown) => Promise<{ id: string }>;
    };
})['aiModelComparison'];

type ComparisonStore = {
    saveComparison(data: {
        prompt: string;
        createdBy: string;
        results: Array<{
            provider: string;
            providerId: string | null;
            model: string;
            response: string;
            promptTokens: number;
            completionTokens: number;
            totalTokens: number;
            estimatedCost: number;
            latencyMs: number;
        }>;
    }): Promise<{ id: string }>;
};

type SendContext = {
    userId: string;
    courseId?: string | null;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
};

type RetryOptions = {
    attempts: number;
    baseDelayMs: number;
};

type AIServiceDependencies = {
    providerRepository?: ProviderRepository;
    usageTrackingService?: Pick<UsageTrackingService, 'trackUsage'>;
    comparisonStore?: ComparisonStore;
    adapterFactory?: (providerName: string, apiKey: string, provider?: ProviderRecord) => AIProviderAdapter;
    decryptApiKey?: (value: string) => string;
    retryOptions?: RetryOptions;
};

type SendResult = AIProviderResponse & {
    provider: string;
    providerId: string | null;
    estimatedCost: number;
};

const defaultProviderRepository: ProviderRepository = {
    async getActiveProvider() {
        return aiProviderDelegate.findFirst({
            where: { isActive: true },
            orderBy: [{ fallbackOrder: 'asc' }, { updatedAt: 'desc' }],
        });
    },
    async getProviderByName(providerName: string) {
        return aiProviderDelegate.findUnique({ where: { name: providerName } });
    },
    async listActiveProvidersByFallbackOrder() {
        return aiProviderDelegate.findMany({
            where: { isActive: true },
            orderBy: [{ fallbackOrder: 'asc' }, { updatedAt: 'asc' }],
        });
    },
};

const defaultComparisonStore: ComparisonStore = {
    async saveComparison(data) {
        const comparison = await aiModelComparisonDelegate.create({
            data: {
                prompt: data.prompt,
                createdBy: data.createdBy,
                results: {
                    create: data.results.map((item) => ({
                        provider: item.provider,
                        providerId: item.providerId,
                        model: item.model,
                        response: item.response,
                        promptTokens: item.promptTokens,
                        completionTokens: item.completionTokens,
                        totalTokens: item.totalTokens,
                        estimatedCost: item.estimatedCost,
                        latencyMs: item.latencyMs,
                    })),
                },
            },
        });

        return { id: comparison.id };
    },
};

export class AIService {
    private readonly providerRepository: ProviderRepository;
    private readonly usageTrackingService: Pick<UsageTrackingService, 'trackUsage'>;
    private readonly comparisonStore: ComparisonStore;
    private readonly adapterFactory: (providerName: string, apiKey: string, provider?: ProviderRecord) => AIProviderAdapter;
    private readonly decryptApiKey: (value: string) => string;
    private readonly retryOptions: RetryOptions;

    constructor(dependencies: AIServiceDependencies = {}) {
        this.providerRepository = dependencies.providerRepository ?? defaultProviderRepository;
        this.usageTrackingService = dependencies.usageTrackingService ?? usageTrackingService;
        this.comparisonStore = dependencies.comparisonStore ?? defaultComparisonStore;
        this.adapterFactory = dependencies.adapterFactory ?? ((providerName, apiKey) => this.createAdapter(providerName, apiKey));
        this.decryptApiKey = dependencies.decryptApiKey ?? decrypt;
        this.retryOptions = dependencies.retryOptions ?? { attempts: 3, baseDelayMs: 300 };
    }

    getProviderAdapter(providerName: string, apiKey: string, provider?: ProviderRecord) {
        return this.adapterFactory(providerName, apiKey, provider);
    }

    async send(prompt: string, providerName: string, context: SendContext): Promise<SendResult> {
        const provider = await this.providerRepository.getProviderByName(providerName);

        if (!provider || !provider.isActive) {
            throw ApiError.badRequest(`Provider ${providerName} is not available`);
        }

        return this.sendWithProvider(prompt, provider, context);
    }

    async sendWithFallback(prompt: string, primaryProvider: string, fallbackProviders: string[], context: SendContext) {
        try {
            return await this.send(prompt, primaryProvider, context);
        } catch (error) {
            logger.warn(`Primary provider ${primaryProvider} failed, trying fallbacks`, error);

            for (const fallback of fallbackProviders) {
                try {
                    return await this.send(prompt, fallback, context);
                } catch (fallbackError) {
                    logger.warn(`Fallback provider ${fallback} failed`, fallbackError);
                }
            }

            throw ApiError.internal('All providers failed');
        }
    }

    async sendWithConfiguredFallback(prompt: string, context: SendContext) {
        const providers = await this.providerRepository.listActiveProvidersByFallbackOrder();

        if (providers.length === 0) {
            throw ApiError.badRequest('No active AI provider configured');
        }

        const [primary, ...fallbackProviders] = providers;

        return this.sendWithFallback(
            prompt,
            primary.name,
            fallbackProviders.map((provider) => provider.name),
            context,
        );
    }

    async compareModels(input: { prompt: string; models: string[]; createdBy: string }) {
        const results: SendResult[] = [];

        for (const entry of input.models) {
            const [providerName, explicitModel] = entry.split(':');
            const result = await this.send(input.prompt, providerName, {
                userId: input.createdBy,
                model: explicitModel,
            });
            results.push(result);
        }

        const saved = await this.comparisonStore.saveComparison({
            prompt: input.prompt,
            createdBy: input.createdBy,
            results: results.map((result) => ({
                provider: result.provider,
                providerId: result.providerId,
                model: result.model,
                response: result.content,
                promptTokens: result.promptTokens,
                completionTokens: result.completionTokens,
                totalTokens: result.totalTokens,
                estimatedCost: result.estimatedCost,
                latencyMs: result.latencyMs,
            })),
        });

        return {
            comparisonId: saved.id,
            results: results.map((result) => ({
                provider: result.provider,
                model: result.model,
                response: result.content,
                tokens: result.totalTokens,
                cost: result.estimatedCost,
                latencyMs: result.latencyMs,
            })),
        };
    }

    private async sendWithProvider(prompt: string, provider: ProviderRecord, context: SendContext): Promise<SendResult> {
        const config = this.normalizeProviderConfig(provider.config);
        const model = context.model ?? this.resolveModel(config, provider.name);
        const apiKey = this.decryptApiKey(provider.apiKey);
        const adapter = this.getProviderAdapter(provider.name, apiKey, provider);
        const response = await this.withRetry(() =>
            adapter.sendMessage(prompt, {
                model,
                temperature: context.temperature ?? this.readNumber(config.temperature),
                maxTokens: context.maxTokens ?? this.readNumber(config.maxTokens),
                systemPrompt: context.systemPrompt ?? this.readString(config.systemPrompt),
                baseUrl: provider.baseUrl,
                history: context.history,
            })
        );

        const estimatedCost = adapter.estimateCost(response.promptTokens, response.completionTokens);

        await this.usageTrackingService.trackUsage({
            userId: context.userId,
            courseId: context.courseId ?? null,
            provider: provider.name,
            providerId: provider.id,
            model: response.model,
            promptTokens: response.promptTokens,
            completionTokens: response.completionTokens,
            totalTokens: response.totalTokens,
            estimatedCost,
            latencyMs: response.latencyMs,
        } satisfies AiUsageData);

        return {
            ...response,
            provider: provider.name,
            providerId: provider.id,
            estimatedCost,
        };
    }

    private async withRetry<T>(callback: () => Promise<T>): Promise<T> {
        let lastError: unknown;

        for (let attempt = 1; attempt <= this.retryOptions.attempts; attempt += 1) {
            try {
                return await callback();
            } catch (error) {
                lastError = error;
                if (attempt === this.retryOptions.attempts) {
                    break;
                }

                const delay = this.retryOptions.baseDelayMs * 2 ** (attempt - 1);
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }

        throw lastError instanceof Error ? lastError : new Error('AI request failed');
    }

    private createAdapter(providerName: string, apiKey: string) {
        switch (providerName) {
            case 'openai':
                return new OpenAIAdapter(apiKey);
            case 'anthropic':
            case 'claude':
                return new AnthropicAdapter(apiKey);
            case 'google':
            case 'gemini':
                return new GeminiAdapter(apiKey);
            default:
                throw ApiError.badRequest(`Unsupported provider: ${providerName}`);
        }
    }

    private normalizeProviderConfig(config: ProviderRecord['config']) {
        if (!config || typeof config !== 'object' || Array.isArray(config)) {
            return {} as ProviderConfigRecord;
        }

        return config;
    }

    private resolveModel(config: ProviderConfigRecord, providerName: string) {
        const configuredModel = this.readString(config.defaultModel)
            ?? this.readString(config.model)
            ?? this.readFirstModel(config.models);

        if (configuredModel) {
            return configuredModel;
        }

        switch (providerName) {
            case 'openai':
                return 'gpt-4';
            case 'anthropic':
            case 'claude':
                return 'claude-3-5-sonnet-20241022';
            default:
                return 'gemini-1.5-pro';
        }
    }

    private readString(value: unknown) {
        return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
    }

    private readNumber(value: unknown) {
        return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
    }

    private readFirstModel(value: unknown) {
        if (!Array.isArray(value) || value.length === 0) {
            return undefined;
        }

        const [first] = value;
        if (typeof first === 'string') {
            return first;
        }

        if (first && typeof first === 'object' && !Array.isArray(first)) {
            return this.readString((first as ProviderConfigRecord).name)
                ?? this.readString((first as ProviderConfigRecord).id)
                ?? this.readString((first as ProviderConfigRecord).model);
        }

        return undefined;
    }
}

export const aiService = new AIService();
