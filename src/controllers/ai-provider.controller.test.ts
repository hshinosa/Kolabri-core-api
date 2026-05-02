import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAiProviderService } = vi.hoisted(() => ({
    mockAiProviderService: {
        getProviders: vi.fn(),
        getProviderById: vi.fn(),
        createProvider: vi.fn(),
        updateProvider: vi.fn(),
        deleteProvider: vi.fn(),
        testConnection: vi.fn(),
        activate: vi.fn(),
        updateFallbackOrder: vi.fn(),
    },
}));

vi.mock('../services/ai-provider.service.js', () => ({
    AiProviderService: mockAiProviderService,
}));

import { AiProviderController } from './ai-provider.controller.js';

function mockReq(overrides: Partial<Request> = {}) {
    return {
        body: {},
        params: {},
        query: {},
        user: {
            userId: 'user-1',
            role: 'admin',
            email: 'admin@example.com',
        },
        ...overrides,
    } as Partial<Request>;
}

function mockRes(): Partial<Response> {
    const res: Partial<Response> & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } = {
        status: vi.fn(),
        json: vi.fn(),
    };
    res.status.mockReturnValue(res as Response);
    res.json.mockReturnValue(res as Response);
    return res;
}

function mockNext(): NextFunction {
    return vi.fn() as unknown as NextFunction;
}

describe('AiProviderController', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns paginated providers', async () => {
        const result = { data: [{ id: 'provider-1' }], meta: { total: 1 } };
        mockAiProviderService.getProviders.mockResolvedValue(result);
        const req = mockReq({ query: { search: 'openai' } });
        const res = mockRes();
        const next = mockNext();

        await AiProviderController.index(req as Request, res as Response, next);

        expect(mockAiProviderService.getProviders).toHaveBeenCalledWith(req.query);
        expect(res.json).toHaveBeenCalledWith({ data: result.data, meta: result.meta });
        expect(next).not.toHaveBeenCalled();
    });

    it('creates a provider and returns 201', async () => {
        const provider = { id: 'provider-1', name: 'OpenAI' };
        mockAiProviderService.createProvider.mockResolvedValue(provider);
        const req = mockReq({ body: { name: 'OpenAI' } });
        const res = mockRes();
        const next = mockNext();

        await AiProviderController.create(req as Request, res as Response, next);

        expect(mockAiProviderService.createProvider).toHaveBeenCalledWith(req.body, 'user-1');
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({
            data: provider,
            meta: { message: 'AI provider created successfully' },
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('tests provider connection and returns success message', async () => {
        const result = { success: true, latencyMs: 123 };
        mockAiProviderService.testConnection.mockResolvedValue(result);
        const req = mockReq({ params: { id: 'provider-1' }, body: { prompt: 'ping' } });
        const res = mockRes();
        const next = mockNext();

        await AiProviderController.test(req as Request, res as Response, next);

        expect(mockAiProviderService.testConnection).toHaveBeenCalledWith('provider-1', req.body);
        expect(res.json).toHaveBeenCalledWith({
            data: result,
            meta: { message: 'AI provider connection test completed' },
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('forwards delete errors to next', async () => {
        const error = new Error('delete failed');
        mockAiProviderService.deleteProvider.mockRejectedValue(error);
        const req = mockReq({ params: { id: 'provider-1' } });
        const res = mockRes();
        const next = mockNext();

        await AiProviderController.delete(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith(error);
    });
});
