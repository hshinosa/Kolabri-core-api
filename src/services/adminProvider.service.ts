/**
 * Admin Provider Service
 * 
 * HTTP client for ai-engine admin endpoints.
 * Handles provider testing and model discovery by delegating to ai-engine.
 */

import axios, { AxiosError } from 'axios';
import { ApiError } from '../middleware/errorHandler.js';

const AI_ENGINE_URL = process.env.AI_ENGINE_URL || 'http://localhost:8001';
const REQUEST_TIMEOUT = 30000; // 30 seconds

interface TestProviderInput {
    name: string;
    apiKey: string;
    baseUrl?: string | null;
    model?: string | null;
    testPrompt?: string;
}

interface TestProviderResponse {
    success: boolean;
    response?: string;
    latencyMs?: number;
    model?: string;
    error?: string;
}

interface ModelMetadata {
    id: string;
    name: string;
    description?: string;
    contextWindow?: number;
    inputCost?: number;
    outputCost?: number;
}

interface ModelListResponse {
    success: boolean;
    models: ModelMetadata[];
    cached: boolean;
    error?: string;
}

export class AdminProviderService {
    /**
     * Test AI provider connection via ai-engine.
     * 
     * Sends a test prompt to the provider and returns success/failure with latency.
     * Used by admin UI to validate provider configuration before saving.
     */
    static async testProvider(input: TestProviderInput): Promise<TestProviderResponse> {
        try {
            const response = await axios.post<TestProviderResponse>(
                `${AI_ENGINE_URL}/api/admin/test-provider`,
                {
                    name: input.name,
                    apiKey: input.apiKey,
                    baseUrl: input.baseUrl,
                    model: input.model,
                    testPrompt: input.testPrompt || 'Hello',
                },
                {
                    timeout: REQUEST_TIMEOUT,
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            );

            return response.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                return this.handleAxiosError(error, 'provider test');
            }

            throw ApiError.internal('Provider test failed', {
                reason: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

    /**
     * Fetch available models from provider API via ai-engine.
     * 
     * Returns cached models (1-hour TTL) unless refresh=true is passed.
     * Used by admin UI to populate model dropdown for provider configuration.
     */
    static async getProviderModels(provider: string, refresh = false): Promise<ModelListResponse> {
        try {
            const response = await axios.get<ModelListResponse>(
                `${AI_ENGINE_URL}/api/admin/providers/${provider}/models`,
                {
                    params: { refresh },
                    timeout: REQUEST_TIMEOUT,
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            );

            return response.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                return this.handleAxiosError(error, 'model discovery');
            }

            throw ApiError.internal('Model discovery failed', {
                reason: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

    /**
     * Handle Axios errors with appropriate error messages.
     */
    private static handleAxiosError(error: AxiosError, operation: string): never {
        if (error.response) {
            // AI-engine returned an error response
            const status = error.response.status;
            const data = error.response.data as { detail?: string; error?: string };

            if (status === 400) {
                throw ApiError.badRequest(`Invalid ${operation} request`, {
                    reason: data.detail || data.error || 'Bad request',
                });
            }

            if (status === 404) {
                throw ApiError.notFound(`${operation} endpoint not found`);
            }

            if (status >= 500) {
                throw ApiError.internal(`AI-engine ${operation} failed`, {
                    reason: data.detail || data.error || 'Internal server error',
                });
            }

            throw ApiError.internal(`${operation} failed`, {
                reason: data.detail || data.error || 'Unknown error',
                status,
            });
        }

        if (error.code === 'ECONNREFUSED') {
            throw ApiError.internal(`AI-engine unavailable`, {
                reason: 'Cannot connect to AI-engine service',
            });
        }

        if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
            throw ApiError.internal(`${operation} timeout`, {
                reason: 'Request to AI-engine timed out',
            });
        }

        throw ApiError.internal(`${operation} failed`, {
            reason: error.message,
        });
    }
}
