/**
 * Admin embedding configuration controller.
 * Proxies embedding provider status/switch to the AI engine.
 */

import axios from 'axios';
import { NextFunction, Response } from 'express';

import { ApiError } from '../middleware/errorHandler.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

const AI_ENGINE_URL = process.env.AI_ENGINE_URL || 'http://localhost:8001';
const REQUEST_TIMEOUT = 15000;

function authHeaders() {
    const secret = process.env.AI_ENGINE_SECRET || process.env.CORE_API_SECRET || '';
    return { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' };
}

export class AdminEmbeddingController {
    static async getConfig(_req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const response = await axios.get(`${AI_ENGINE_URL}/api/admin/embedding-config`, {
                timeout: REQUEST_TIMEOUT,
                headers: authHeaders(),
            });
            res.json(response.data);
        } catch (error) {
            if (axios.isAxiosError(error) && error.response) {
                return next(
                    ApiError.badRequest('Embedding config unavailable', {
                        status: error.response.status,
                    })
                );
            }
            next(error);
        }
    }

    static async updateConfig(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const provider = (req.body as { provider?: string }).provider;
            if (!provider || !['voyage', 'local'].includes(provider)) {
                throw ApiError.badRequest("provider must be 'voyage' or 'local'");
            }

            const response = await axios.put(
                `${AI_ENGINE_URL}/api/admin/embedding-config`,
                { provider },
                // First switch to local can trigger a one-time model download
                // inside the engine; allow it to finish instead of aborting.
                { timeout: 120000, headers: authHeaders() }
            );
            res.json(response.data);
        } catch (error) {
            if (axios.isAxiosError(error) && error.response) {
                return next(
                    ApiError.badRequest('Embedding switch failed', {
                        status: error.response.status,
                        detail: error.response.data,
                    })
                );
            }
            next(error);
        }
    }
}
