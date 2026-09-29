import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, encryptionMock, adminProviderTestMock, auditLogServiceMock, broadcastAdminEventMock } = vi.hoisted(() => ({
    prismaMock: {
        aiProvider: {
            findMany: vi.fn(),
            count: vi.fn(),
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            updateMany: vi.fn(),
            delete: vi.fn(),
        },
    },
    encryptionMock: {
        encrypt: vi.fn(),
        decrypt: vi.fn(),
        maskApiKey: vi.fn(),
    },
    adminProviderTestMock: {
        testProvider: vi.fn(),
    },
    auditLogServiceMock: {
        logAction: vi.fn(),
    },
    broadcastAdminEventMock: vi.fn(),
}));

vi.mock('../config/database.js', () => ({
    default: prismaMock,
}));

vi.mock('../utils/encryption.js', () => encryptionMock);

vi.mock('./adminProvider.service.js', () => ({
    AdminProviderService: adminProviderTestMock,
}));

vi.mock('./audit-log.service.js', () => ({
    AuditLogService: auditLogServiceMock,
}));

vi.mock('../websocket/server.js', () => ({
    broadcastAdminEvent: broadcastAdminEventMock,
}));

import { AiProviderService } from './ai-provider.service.js';

describe('AiProviderService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        encryptionMock.encrypt.mockImplementation((value: string) => `enc:${value}`);
        encryptionMock.decrypt.mockImplementation((value: string) => value.replace(/^enc:/, ''));
        encryptionMock.maskApiKey.mockImplementation((value: string) => `masked:${value}`);
        auditLogServiceMock.logAction.mockResolvedValue({ id: 'audit-1', user: { id: 'admin-1', name: 'Admin' } });
    });

    it('returns paginated providers with masked api keys', async () => {
        const provider = {
            id: 'provider-1',
            name: 'openai',
            displayName: 'OpenAI',
            apiKey: 'enc:secret-1234567890',
            baseUrl: null,
            isActive: true,
            fallbackOrder: 1,
            config: { model: 'gpt-4.1-mini' },
            createdAt: new Date('2026-05-01T00:00:00.000Z'),
            updatedAt: new Date('2026-05-02T00:00:00.000Z'),
        };
        prismaMock.aiProvider.findMany.mockResolvedValue([provider]);
        prismaMock.aiProvider.count.mockResolvedValue(1);

        const result = await AiProviderService.getProviders({ page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'desc' });

        expect(prismaMock.aiProvider.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {},
                skip: 0,
                take: 10,
                orderBy: { createdAt: 'desc' },
            })
        );
        expect(result).toEqual({
            data: [
                {
                    id: 'provider-1',
                    name: 'openai',
                    displayName: 'OpenAI',
                    apiKeyMasked: 'masked:secret-1234567890',
                    baseUrl: null,
                    isActive: true,
                    fallbackOrder: 1,
                    config: { model: 'gpt-4.1-mini' },
                    createdAt: new Date('2026-05-01T00:00:00.000Z'),
                    updatedAt: new Date('2026-05-02T00:00:00.000Z'),
                },
            ],
            meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
        });
    });

    it('creates a provider with encrypted key, audit log, and broadcast', async () => {
        prismaMock.aiProvider.findUnique.mockResolvedValueOnce(null);
        prismaMock.aiProvider.findMany.mockResolvedValueOnce([{ fallbackOrder: 2 }]);
        prismaMock.aiProvider.create.mockResolvedValue({
            id: 'provider-2',
            name: 'anthropic',
            displayName: 'Anthropic',
            apiKey: 'enc:anthropic-secret',
            baseUrl: 'https://api.anthropic.com',
            isActive: false,
            fallbackOrder: 3,
            config: { defaultModel: 'claude-3-7-sonnet' },
            createdAt: new Date('2026-05-01T00:00:00.000Z'),
            updatedAt: new Date('2026-05-01T00:00:00.000Z'),
        });

        const result = await AiProviderService.createProvider(
            {
                name: 'anthropic',
                displayName: 'Anthropic',
                apiKey: 'anthropic-secret',
                baseUrl: 'https://api.anthropic.com',
                config: { defaultModel: 'claude-3-7-sonnet' },
            },
            'admin-1'
        );

        expect(prismaMock.aiProvider.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    apiKey: 'enc:anthropic-secret',
                    fallbackOrder: 3,
                }),
            })
        );
        expect(auditLogServiceMock.logAction).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'CREATE',
                entityType: 'AiProvider',
                entityId: 'provider-2',
                userId: 'admin-1',
            })
        );
        expect(broadcastAdminEventMock).toHaveBeenCalledWith('dashboard:stats:update', {
            entity: 'ai-provider',
            action: 'CREATE',
            entityId: 'provider-2',
        });
        expect(result.apiKeyMasked).toBe('masked:anthropic-secret');
    });

    it('activates a provider by deactivating others first', async () => {
        prismaMock.aiProvider.findUnique.mockResolvedValue({
            id: 'provider-1',
            name: 'openai',
            displayName: 'OpenAI',
            apiKey: 'enc:key-1234567890',
            baseUrl: null,
            isActive: false,
            fallbackOrder: 1,
            config: {},
            createdAt: new Date('2026-05-01T00:00:00.000Z'),
            updatedAt: new Date('2026-05-01T00:00:00.000Z'),
        });
        prismaMock.aiProvider.updateMany.mockResolvedValue({ count: 2 });
        prismaMock.aiProvider.update.mockResolvedValue({});
        prismaMock.aiProvider.findUnique.mockResolvedValueOnce({
            id: 'provider-1',
            name: 'openai',
            displayName: 'OpenAI',
            apiKey: 'enc:key-1234567890',
            baseUrl: null,
            isActive: false,
            fallbackOrder: 1,
            config: {},
            createdAt: new Date('2026-05-01T00:00:00.000Z'),
            updatedAt: new Date('2026-05-01T00:00:00.000Z'),
        }).mockResolvedValueOnce({
            id: 'provider-1',
            name: 'openai',
            displayName: 'OpenAI',
            apiKey: 'enc:key-1234567890',
            baseUrl: null,
            isActive: true,
            fallbackOrder: 1,
            config: {},
            createdAt: new Date('2026-05-01T00:00:00.000Z'),
            updatedAt: new Date('2026-05-02T00:00:00.000Z'),
        });

        const result = await AiProviderService.activate('provider-1', 'admin-1');

        expect(prismaMock.aiProvider.updateMany).toHaveBeenCalledWith({ data: { isActive: false } });
        expect(prismaMock.aiProvider.update).toHaveBeenCalledWith({ where: { id: 'provider-1' }, data: { isActive: true } });
        expect(result.isActive).toBe(true);
        expect(broadcastAdminEventMock).toHaveBeenCalledWith('dashboard:stats:update', {
            entity: 'ai-provider',
            action: 'ACTIVATE',
            entityId: 'provider-1',
        });
    });

    it('tests a provider connection using the decrypted key and normalized model config', async () => {
        prismaMock.aiProvider.findUnique.mockResolvedValue({
            id: 'provider-1',
            name: 'openai',
            displayName: 'OpenAI',
            apiKey: 'enc:valid-secret-key',
            baseUrl: null,
            isActive: true,
            fallbackOrder: 1,
            config: { defaultModel: 'gpt-4.1-mini' },
            createdAt: new Date('2026-05-01T00:00:00.000Z'),
            updatedAt: new Date('2026-05-01T00:00:00.000Z'),
        });
        adminProviderTestMock.testProvider.mockResolvedValue({
            success: true,
            response: 'Connection OK',
            latencyMs: 150,
            model: 'gpt-4.1-mini',
        });

        const result = await AiProviderService.testConnection('provider-1', { testPrompt: 'Ping' });

        expect(adminProviderTestMock.testProvider).toHaveBeenCalledWith({
            name: 'openai',
            apiKey: 'valid-secret-key',
            baseUrl: null,
            model: 'gpt-4.1-mini',
            testPrompt: 'Ping',
        });
        expect(result).toEqual({
            status: 'success',
            response: 'Connection OK',
            latency: 150,
            model: 'gpt-4.1-mini',
        });
    });

    it('rejects fallback order updates when any provider id is missing', async () => {
        prismaMock.aiProvider.findMany.mockResolvedValue([{ id: 'provider-1' }]);

        await expect(AiProviderService.updateFallbackOrder({ providerIds: ['provider-1', 'provider-2'] })).rejects.toMatchObject({
            statusCode: 400,
            message: 'One or more providers were not found',
        });
    });
});
