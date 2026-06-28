import prisma from '../config/database.js';
import { ApiError } from '../middleware/errorHandler.js';
import { decrypt, encrypt, maskApiKey } from '../utils/encryption.js';
import { AdminProviderService } from './adminProvider.service.js';
import { AuditLogService } from './audit-log.service.js';
import { broadcastAdminEvent } from '../websocket/server.js';
import {
    CreateAiProviderInput,
    FallbackOrderInput,
    ListAiProvidersQuery,
    TestAiProviderConnectionInput,
    UpdateAiProviderInput,
} from '../validators/ai-provider.validator.js';

interface AiProviderEntity {
    id: string;
    name: string;
    displayName: string;
    apiKey: string;
    baseUrl: string | null;
    isActive: boolean;
    fallbackOrder: number;
    config: unknown;
    createdAt: Date;
    updatedAt: Date;
}

const aiProviderSelect = {
    id: true,
    name: true,
    displayName: true,
    apiKey: true,
    baseUrl: true,
    isActive: true,
    fallbackOrder: true,
    config: true,
    createdAt: true,
    updatedAt: true,
} as const;

const aiProviderDelegate = (prisma as unknown as {
    ['aiProvider']: {
        findMany: (args: unknown) => Promise<AiProviderEntity[]>;
        count: (args: unknown) => Promise<number>;
        findUnique: (args: unknown) => Promise<AiProviderEntity | null>;
        create: (args: unknown) => Promise<AiProviderEntity>;
        update: (args: unknown) => Promise<AiProviderEntity>;
        updateMany: (args: unknown) => Promise<unknown>;
        delete: (args: unknown) => Promise<unknown>;
    };
})['aiProvider'];

export class AiProviderService {
    static async getProviders(query: ListAiProvidersQuery) {
        const { page, limit, search, sortBy, sortOrder } = query;
        const skip = (page - 1) * limit;

        const where = search
            ? {
                  OR: [
                      {
                          name: {
                              contains: search,
                              mode: 'insensitive' as const,
                          },
                      },
                      {
                          displayName: {
                              contains: search,
                              mode: 'insensitive' as const,
                          },
                      },
                  ],
              }
            : {};

        const [data, total] = await Promise.all([
            aiProviderDelegate.findMany({
                where,
                select: aiProviderSelect,
                skip,
                take: limit,
                orderBy: {
                    [sortBy]: sortOrder,
                },
            }),
            aiProviderDelegate.count({ where }),
        ]);

        return {
            data: data.map((provider: AiProviderEntity) => this.serializeProvider(provider)),
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    static async getProviderById(id: string) {
        const provider = await aiProviderDelegate.findUnique({
            where: { id },
            select: aiProviderSelect,
        });

        if (!provider) {
            throw ApiError.notFound('AI provider not found');
        }

        return this.serializeProvider(provider);
    }

    static async createProvider(data: CreateAiProviderInput, actorUserId: string) {
        const existingProvider = await aiProviderDelegate.findUnique({
            where: { name: data.name },
            select: { id: true },
        });

        if (existingProvider) {
            throw ApiError.conflict('Provider name already exists');
        }

        const provider = await aiProviderDelegate.create({
            data: {
                name: data.name,
                displayName: data.displayName,
                apiKey: encrypt(data.apiKey),
                baseUrl: data.baseUrl,
                fallbackOrder: await this.getNextFallbackOrder(),
                config: data.config,
            },
            select: aiProviderSelect,
        });

        const serializedProvider = this.serializeProvider(provider);

        await AuditLogService.logAction({
            action: 'CREATE',
            entityType: 'AiProvider',
            entityId: provider.id,
            userId: actorUserId,
            changes: {
                before: null,
                after: serializedProvider,
            },
            metadata: {
                source: 'admin.ai-provider.create',
            },
        });

        broadcastAdminEvent('dashboard:stats:update', {
            entity: 'ai-provider',
            action: 'CREATE',
            entityId: provider.id,
        });

        return serializedProvider;
    }

    static async updateProvider(id: string, data: UpdateAiProviderInput, actorUserId: string) {
        const existingProvider = await aiProviderDelegate.findUnique({
            where: { id },
            select: aiProviderSelect,
        });

        if (!existingProvider) {
            throw ApiError.notFound('AI provider not found');
        }

        const provider = await aiProviderDelegate.update({
            where: { id },
            data: {
                ...(data.displayName !== undefined ? { displayName: data.displayName } : {}),
                ...(data.apiKey !== undefined ? { apiKey: encrypt(data.apiKey) } : {}),
                ...(data.baseUrl !== undefined ? { baseUrl: data.baseUrl } : {}),
                ...(data.config !== undefined ? { config: data.config } : {}),
                ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
                ...(data.fallbackOrder !== undefined ? { fallbackOrder: data.fallbackOrder } : {}),
            },
            select: aiProviderSelect,
        });

        if (data.isActive) {
            await this.activate(id, actorUserId);
            return this.getProviderById(id);
        }

        const before = this.serializeProvider(existingProvider);
        const after = this.serializeProvider(provider);

        await AuditLogService.logAction({
            action: 'UPDATE',
            entityType: 'AiProvider',
            entityId: id,
            userId: actorUserId,
            changes: {
                before,
                after,
            },
            metadata: {
                source: 'admin.ai-provider.update',
            },
        });

        broadcastAdminEvent('dashboard:stats:update', {
            entity: 'ai-provider',
            action: 'UPDATE',
            entityId: id,
        });

        return after;
    }

    static async deleteProvider(id: string, actorUserId: string) {
        const provider = await aiProviderDelegate.findUnique({
            where: { id },
            select: aiProviderSelect,
        });

        if (!provider) {
            throw ApiError.notFound('AI provider not found');
        }

        if (provider.isActive) {
            throw ApiError.badRequest('Cannot delete the active provider');
        }

        await aiProviderDelegate.delete({
            where: { id },
        });

        await AuditLogService.logAction({
            action: 'DELETE',
            entityType: 'AiProvider',
            entityId: id,
            userId: actorUserId,
            changes: {
                before: this.serializeProvider(provider),
                after: null,
            },
            metadata: {
                source: 'admin.ai-provider.delete',
            },
        });

        broadcastAdminEvent('dashboard:stats:update', {
            entity: 'ai-provider',
            action: 'DELETE',
            entityId: id,
        });
    }

    static async testConnection(id: string, input: TestAiProviderConnectionInput) {
        const provider = await aiProviderDelegate.findUnique({
            where: { id },
            select: aiProviderSelect,
        });

        if (!provider) {
            throw ApiError.notFound('AI provider not found');
        }

        const apiKey = decrypt(provider.apiKey);
        if (!apiKey || apiKey.trim().length < 10) {
            throw ApiError.badRequest('Connection failed', {
                reason: 'Invalid API key',
            });
        }

        const config = this.normalizeConfig(provider.config);
        const model = typeof config.defaultModel === 'string' ? config.defaultModel : typeof config.model === 'string' ? config.model : undefined;

        const result = await AdminProviderService.testProvider({
            name: provider.name,
            apiKey,
            baseUrl: provider.baseUrl,
            model,
            testPrompt: input.testPrompt || 'Hello',
        });

        if (!result.success) {
            throw ApiError.badRequest('Connection test failed', {
                reason: result.error || 'Unknown error',
            });
        }

        return {
            status: 'success',
            response: result.response,
            latency: result.latencyMs,
            model: result.model,
        };
    }

    static async updateFallbackOrder(input: FallbackOrderInput) {
        const providers = await aiProviderDelegate.findMany({
            where: {
                id: {
                    in: input.providerIds,
                },
            },
            select: aiProviderSelect,
        });

        if (providers.length !== input.providerIds.length) {
            throw ApiError.badRequest('One or more providers were not found');
        }

        for (const [index, providerId] of input.providerIds.entries()) {
            await aiProviderDelegate.update({
                where: { id: providerId },
                data: { fallbackOrder: index + 1 },
            });
        }

        const updated = await aiProviderDelegate.findMany({
            select: aiProviderSelect,
            orderBy: [{ fallbackOrder: 'asc' }, { updatedAt: 'desc' }],
        });

        return updated.map((provider: AiProviderEntity) => this.serializeProvider(provider));
    }

    static async activate(id: string, actorUserId?: string) {
        const provider = await aiProviderDelegate.findUnique({
            where: { id },
            select: aiProviderSelect,
        });

        if (!provider) {
            throw ApiError.notFound('AI provider not found');
        }

        await aiProviderDelegate.updateMany({
            data: { isActive: false },
        });

        await aiProviderDelegate.update({
            where: { id },
            data: { isActive: true },
        });

        const activeProvider = await this.getProviderById(id);

        if (actorUserId) {
            await AuditLogService.logAction({
                action: 'ACTIVATE',
                entityType: 'AiProvider',
                entityId: id,
                userId: actorUserId,
                changes: {
                    before: this.serializeProvider(provider),
                    after: activeProvider,
                },
                metadata: {
                    source: 'admin.ai-provider.activate',
                },
            });

            broadcastAdminEvent('dashboard:stats:update', {
                entity: 'ai-provider',
                action: 'ACTIVATE',
                entityId: id,
            });
        }

        return activeProvider;
    }

    static async getProviderModels(provider: string, refresh = false) {
        const supportedProviders = ['openai', 'anthropic', 'gemini'];
        const normalizedProvider = provider.toLowerCase();

        if (!supportedProviders.includes(normalizedProvider)) {
            throw ApiError.badRequest('Unsupported provider', {
                reason: `Provider must be one of: ${supportedProviders.join(', ')}`,
            });
        }

        const result = await AdminProviderService.getProviderModels(normalizedProvider, refresh);

        if (!result.success) {
            throw ApiError.internal('Failed to fetch provider models', {
                reason: result.error || 'Unknown error',
            });
        }

        return result;
    }

    private static serializeProvider(provider: AiProviderEntity) {
        const decryptedApiKey = decrypt(provider.apiKey);

        return {
            id: provider.id,
            name: provider.name,
            displayName: provider.displayName,
            apiKeyMasked: maskApiKey(decryptedApiKey),
            baseUrl: provider.baseUrl,
            isActive: provider.isActive,
            fallbackOrder: provider.fallbackOrder,
            config: this.normalizeConfig(provider.config),
            createdAt: provider.createdAt,
            updatedAt: provider.updatedAt,
        };
    }

    private static async getNextFallbackOrder() {
        const latestProvider = await aiProviderDelegate.findMany({
            select: { fallbackOrder: true },
            orderBy: { fallbackOrder: 'desc' },
            take: 1,
        });

        return (latestProvider[0]?.fallbackOrder ?? 0) + 1;
    }

    private static normalizeConfig(config: unknown) {
        if (!config || typeof config !== 'object' || Array.isArray(config)) {
            return {};
        }

        return config as Record<string, unknown>;
    }
}
