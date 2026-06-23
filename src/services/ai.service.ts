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

const defaultProviderRepository: ProviderRepository = {
    async getActiveProvider() {
        return prisma.aiProvider.findFirst({
            where: { isActive: true },
            orderBy: [{ fallbackOrder: 'asc' }, { updatedAt: 'desc' }],
        }) as Promise<ProviderRecord | null>;
    },
    async getProviderByName(providerName: string) {
        return prisma.aiProvider.findUnique({ where: { name: providerName } }) as Promise<ProviderRecord | null>;
    },
    async listActiveProvidersByFallbackOrder() {
        return prisma.aiProvider.findMany({
            where: { isActive: true },
            orderBy: [{ fallbackOrder: 'asc' }, { updatedAt: 'asc' }],
        }) as Promise<ProviderRecord[]>;
    },
};

const providerRepository: ProviderRepository = {
    async getActiveProvider() {
        return prisma.aiProvider.findFirst({
            where: { isActive: true },
            orderBy: { fallbackOrder: 'asc' },
        }) as Promise<ProviderRecord | null>;
    },
    async getProviderByName(providerName: string) {
        return prisma.aiProvider.findUnique({
            where: { name: providerName },
        }) as Promise<ProviderRecord | null>;
    },
    async listActiveProvidersByFallbackOrder() {
        return prisma.aiProvider.findMany({
            where: { isActive: true },
            orderBy: { fallbackOrder: 'asc' },
        }) as Promise<ProviderRecord[]>;
    },
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
    adapterFactory?: (providerName: string, apiKey: string, provider?: ProviderRecord) => AIProviderAdapter;
    decryptApiKey?: (value: string) => string;
    retryOptions?: RetryOptions;
};

type SendResult = AIProviderResponse & {
    provider: string;
    providerId: string | null;
    estimatedCost: number;
    response: string;
};


export class AIService {
    private readonly providerRepository: ProviderRepository;
    private readonly usageTrackingService: Pick<UsageTrackingService, 'trackUsage'>;
    private readonly adapterFactory: (providerName: string, apiKey: string, provider?: ProviderRecord) => AIProviderAdapter;
    private readonly decryptApiKey: (value: string) => string;
    private readonly retryOptions: RetryOptions;

    constructor(dependencies: AIServiceDependencies = {}) {
        this.providerRepository = dependencies.providerRepository ?? defaultProviderRepository;
        this.usageTrackingService = dependencies.usageTrackingService ?? usageTrackingService;
        this.adapterFactory = dependencies.adapterFactory ?? ((providerName, apiKey) => this.createAdapter(providerName, apiKey));
        this.decryptApiKey = dependencies.decryptApiKey ?? decrypt;
        this.retryOptions = dependencies.retryOptions ?? { attempts: 3, baseDelayMs: 300 };
    }

    getProviderAdapter(providerName: string, apiKey: string, provider?: ProviderRecord): AIProviderAdapter {
        return this.adapterFactory(providerName, apiKey, provider);
    }

    async send(prompt: string, providerName: string, context: SendContext): Promise<SendResult> {
        const provider = await this.providerRepository.getProviderByName(providerName);

        if (!provider || !provider.isActive) {
            throw ApiError.badRequest(`Provider ${providerName} is not available`);
        }
        return this.sendWithProvider(prompt, provider, context);
    }

    async sendWithFallback(prompt: string, primaryProvider: string, fallbackProviders: string[], context: SendContext): Promise<SendResult> {
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

    async sendWithConfiguredFallback(prompt: string, context: SendContext): Promise<SendResult> {
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
            response: response.content,
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
