import { NextFunction, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { AiProviderService } from '../services/ai-provider.service.js';
import {
    CreateAiProviderInput,
    FallbackOrderInput,
    ListAiProvidersQuery,
    TestAiProviderConnectionInput,
    UpdateAiProviderInput,
} from '../validators/ai-provider.validator.js';

export class AiProviderController {
    static async index(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const result = await AiProviderService.getProviders(req.query as unknown as ListAiProvidersQuery);

            res.json({
                data: result.data,
                meta: result.meta,
            });
        } catch (error) {
            next(error);
        }
    }

    static async show(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const provider = await AiProviderService.getProviderById(req.params.id);

            res.json({
                data: provider,
            });
        } catch (error) {
            next(error);
        }
    }

    static async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const provider = await AiProviderService.createProvider(req.body as CreateAiProviderInput, req.user!.userId);

            res.status(201).json({
                data: provider,
                meta: {
                    message: 'AI provider created successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    static async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const provider = await AiProviderService.updateProvider(req.params.id, req.body as UpdateAiProviderInput, req.user!.userId);

            res.json({
                data: provider,
                meta: {
                    message: 'AI provider updated successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    static async delete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            await AiProviderService.deleteProvider(req.params.id, req.user!.userId);

            res.json({
                meta: {
                    message: 'AI provider deleted successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    static async test(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const result = await AiProviderService.testConnection(
                req.params.id,
                req.body as TestAiProviderConnectionInput
            );

            res.json({
                data: result,
                meta: {
                    message: 'AI provider connection test completed',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    static async activate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const provider = await AiProviderService.activate(req.params.id, req.user!.userId);

            res.json({
                data: provider,
                meta: {
                    message: 'AI provider activated successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    static async updateFallbackOrder(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const providers = await AiProviderService.updateFallbackOrder(req.body as FallbackOrderInput);

            res.json({
                data: providers,
                meta: {
                    message: 'Fallback order updated successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }
}
