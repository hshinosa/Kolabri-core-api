import { randomUUID } from 'crypto';

import prisma from '../config/database.js';
import { ApiError } from '../middleware/errorHandler.js';
import { decrypt } from '../utils/encryption.js';
import { logger } from '../utils/logger.js';
import type { ProviderContextV1 } from './aiEngine.service.js';

type ProviderConfigRecord = Record<string, unknown>;

export type ProviderRecord = {
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
    listActiveProvidersByFallbackOrder(): Promise<ProviderRecord[]>;
};

type ResolveProviderContextInput = {
    featureFamily: string;
    preferredModel?: string;
    requestId?: string;
};

export type ResolvedProvider = {
    providerId: string;
    providerName: string;
    providerContext: ProviderContextV1;
};

export type ProviderResolutionResult = {
    primary: ResolvedProvider;
    fallbackChain: ResolvedProvider[];
};

type MetricsLogger = {
    info: (message: string, meta?: Record<string, unknown>) => void;
    warn: (message: string, meta?: Record<string, unknown>) => void;
    error: (message: string, meta?: Record<string, unknown>) => void;
};

type ProviderResolutionDependencies = {
    providerRepository?: ProviderRepository;
    decryptApiKey?: (value: string) => string;
    requestIdFactory?: () => string;
    now?: () => Date;
    metricsLogger?: MetricsLogger;
};

const defaultProviderRepository: ProviderRepository = {
    async listActiveProvidersByFallbackOrder() {
        return prisma.aiProvider.findMany({
            where: { isActive: true },
            orderBy: [{ fallbackOrder: 'asc' }, { updatedAt: 'asc' }],
        }) as Promise<ProviderRecord[]>;
    },
};

export class ProviderResolutionService {
    private readonly providerRepository: ProviderRepository;
    private readonly decryptApiKey: (value: string) => string;
    private readonly requestIdFactory: () => string;
    private readonly now: () => Date;
    private readonly metricsLogger: MetricsLogger;

    constructor(dependencies: ProviderResolutionDependencies = {}) {
        this.providerRepository = dependencies.providerRepository ?? defaultProviderRepository;
        this.decryptApiKey = dependencies.decryptApiKey ?? decrypt;
        this.requestIdFactory = dependencies.requestIdFactory ?? randomUUID;
        this.now = dependencies.now ?? (() => new Date());
        this.metricsLogger = dependencies.metricsLogger ?? logger;
    }

    async resolveProviderContext(input: ResolveProviderContextInput): Promise<ProviderResolutionResult> {
        const startedAt = this.now();
        const providers = await this.providerRepository.listActiveProvidersByFallbackOrder();
        const latencyMs = this.now().getTime() - startedAt.getTime();

        this.metricsLogger.info('provider_resolution_completed', {
            featureFamily: input.featureFamily,
            requestId: input.requestId,
            providerCount: providers.length,
            latencyMs,
        });

        if (providers.length === 0) {
            this.metricsLogger.warn('provider_resolution_failed', {
                featureFamily: input.featureFamily,
                requestId: input.requestId,
                reason: 'no_active_providers',
                latencyMs,
            });
            throw ApiError.badRequest('No active AI provider configured');
        }

        const requestId = input.requestId ?? this.requestIdFactory();
        const resolvedAt = this.now().toISOString();
        const [primary, ...fallbackProviders] = providers;

        return {
            primary: this.buildResolvedProvider(primary, input, requestId, resolvedAt),
            fallbackChain: fallbackProviders.map((provider) => this.buildResolvedProvider(provider, input, requestId, resolvedAt)),
        };
    }

    async executeWithFallback<T>(
        input: ResolveProviderContextInput,
        operation: (providerContext: ProviderContextV1) => Promise<T>,
        options: {
            isSuccess?: (result: T) => boolean;
            onAttemptError?: (error: unknown, providerName: string) => void;
            perProviderTimeoutMs?: number;
        } = {},
    ): Promise<T> {
        const resolution = await this.resolveProviderContext(input);
        const providers = [resolution.primary, ...resolution.fallbackChain];
        const requestId = resolution.primary.providerContext.metadata.requestId;

        let lastError: unknown;
        const timeoutMs = options.perProviderTimeoutMs ?? 30000;

        for (let attemptIndex = 0; attemptIndex < providers.length; attemptIndex++) {
            const provider = providers[attemptIndex];
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), timeoutMs);
            const attemptStartedAt = this.now();

            try {
                const result = await Promise.race([
                    operation(provider.providerContext),
                    new Promise<never>((_, reject) => {
                        controller.signal.addEventListener('abort', () => {
                            reject(new Error(`Provider ${provider.providerName} timed out after ${timeoutMs}ms`));
                        }, { once: true });
                    }),
                ]);
                const attemptLatencyMs = this.now().getTime() - attemptStartedAt.getTime();

                if (options.isSuccess && !options.isSuccess(result)) {
                    this.metricsLogger.warn('provider_fallback_attempt_unsuccessful', {
                        featureFamily: input.featureFamily,
                        requestId,
                        providerName: provider.providerName,
                        attemptIndex,
                        attemptLatencyMs,
                    });
                    lastError = new Error(`Provider ${provider.providerName} returned unsuccessful result`);
                    continue;
                }

                this.metricsLogger.info('provider_operation_succeeded', {
                    featureFamily: input.featureFamily,
                    requestId,
                    providerName: provider.providerName,
                    attemptIndex,
                    attemptLatencyMs,
                    fallbackUsed: attemptIndex > 0,
                });

                return result;
            } catch (error) {
                const attemptLatencyMs = this.now().getTime() - attemptStartedAt.getTime();
                lastError = error;
                this.metricsLogger.warn('provider_fallback_attempt_failed', {
                    featureFamily: input.featureFamily,
                    requestId,
                    providerName: provider.providerName,
                    attemptIndex,
                    attemptLatencyMs,
                    errorMessage: error instanceof Error ? error.message : String(error),
                });
                options.onAttemptError?.(error, provider.providerName);
            } finally {
                clearTimeout(timeout);
            }
        }

        this.metricsLogger.error('provider_operation_failed_all_providers', {
            featureFamily: input.featureFamily,
            requestId,
            providerCount: providers.length,
            errorMessage: lastError instanceof Error ? lastError.message : String(lastError),
        });

        throw lastError ?? ApiError.internal('All AI providers failed');
    }

    private buildResolvedProvider(
        provider: ProviderRecord,
        input: ResolveProviderContextInput,
        requestId: string,
        resolvedAt: string,
    ): ResolvedProvider {
        const config = this.normalizeProviderConfig(provider.config);

        return {
            providerId: provider.id,
            providerName: provider.name,
            providerContext: {
                version: '1.0',
                provider: {
                    name: provider.name,
                    displayName: provider.displayName,
                },
                execution: {
                    baseUrl: provider.baseUrl ?? this.resolveBaseUrl(provider.name),
                    model: input.preferredModel ?? this.resolveModel(config, provider.name),
                    temperature: this.readNumber(config.temperature),
                    maxTokens: this.readNumber(config.maxTokens),
                },
                auth: {
                    type: 'api-key',
                    credential: this.decryptApiKey(provider.apiKey),
                },
                metadata: {
                    featureFamily: input.featureFamily,
                    requestId,
                    resolvedAt,
                },
            },
        };
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

    private resolveBaseUrl(providerName: string) {
        switch (providerName) {
            case 'openai':
                return 'https://api.openai.com/v1';
            case 'anthropic':
            case 'claude':
                return 'https://api.anthropic.com/v1';
            default:
                return 'https://generativelanguage.googleapis.com/v1beta';
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

export const providerResolutionService = new ProviderResolutionService();
