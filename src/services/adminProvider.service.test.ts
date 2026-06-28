import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { AdminProviderService } from '../src/services/adminProvider.service';
import { ApiError } from '../src/middleware/errorHandler';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('AdminProviderService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('testProvider', () => {
        it('should successfully test OpenAI provider', async () => {
            const mockResponse = {
                data: {
                    success: true,
                    response: 'Hello!',
                    latencyMs: 150,
                    model: 'gpt-4o-mini',
                },
            };

            mockedAxios.post.mockResolvedValueOnce(mockResponse);

            const result = await AdminProviderService.testProvider({
                name: 'openai',
                apiKey: 'test-key',
                testPrompt: 'Hello',
            });

            expect(result.success).toBe(true);
            expect(result.response).toBe('Hello!');
            expect(result.latencyMs).toBe(150);
            expect(mockedAxios.post).toHaveBeenCalledWith(
                expect.stringContaining('/api/admin/test-provider'),
                expect.objectContaining({
                    name: 'openai',
                    apiKey: 'test-key',
                }),
                expect.any(Object)
            );
        });

        it('should handle provider test failure', async () => {
            const mockResponse = {
                data: {
                    success: false,
                    error: 'Invalid API key',
                },
            };

            mockedAxios.post.mockResolvedValueOnce(mockResponse);

            const result = await AdminProviderService.testProvider({
                name: 'openai',
                apiKey: 'invalid-key',
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe('Invalid API key');
        });

        it('should handle network errors gracefully', async () => {
            mockedAxios.post.mockRejectedValueOnce({
                code: 'ECONNREFUSED',
                message: 'Connection refused',
            });

            await expect(
                AdminProviderService.testProvider({
                    name: 'openai',
                    apiKey: 'test-key',
                })
            ).rejects.toThrow(ApiError);
        });
    });

    describe('getProviderModels', () => {
        it('should fetch models from provider', async () => {
            const mockResponse = {
                data: {
                    success: true,
                    models: [
                        { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000 },
                        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128000 },
                    ],
                    cached: false,
                },
            };

            mockedAxios.get.mockResolvedValueOnce(mockResponse);

            const result = await AdminProviderService.getProviderModels('openai', false);

            expect(result.success).toBe(true);
            expect(result.models).toHaveLength(2);
            expect(result.models[0].id).toBe('gpt-4o');
            expect(mockedAxios.get).toHaveBeenCalledWith(
                expect.stringContaining('/api/admin/providers/openai/models'),
                expect.objectContaining({
                    params: { refresh: false },
                })
            );
        });

        it('should handle cache refresh', async () => {
            const mockResponse = {
                data: {
                    success: true,
                    models: [],
                    cached: false,
                },
            };

            mockedAxios.get.mockResolvedValueOnce(mockResponse);

            await AdminProviderService.getProviderModels('anthropic', true);

            expect(mockedAxios.get).toHaveBeenCalledWith(
                expect.stringContaining('/api/admin/providers/anthropic/models'),
                expect.objectContaining({
                    params: { refresh: true },
                })
            );
        });

        it('should handle model fetch errors', async () => {
            const mockResponse = {
                data: {
                    success: false,
                    models: [],
                    cached: false,
                    error: 'API key not configured',
                },
            };

            mockedAxios.get.mockResolvedValueOnce(mockResponse);

            const result = await AdminProviderService.getProviderModels('openai');

            expect(result.success).toBe(false);
            expect(result.error).toBeTruthy();
        });
    });
});
