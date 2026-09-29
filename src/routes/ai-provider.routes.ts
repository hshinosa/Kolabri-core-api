import { Router } from 'express';
import { z } from 'zod';
import { AiProviderController } from '../controllers/ai-provider.controller.js';
import { checkRole, verifyToken } from '../middleware/auth.js';
import { rateLimiter, testConnectionLimiter } from '../middleware/rateLimiter.js';
import { validateBody, validateParams, validateQuery } from '../validators/validate.js';
import {
    createAiProviderSchema,
    listAiProvidersQuerySchema,
    testAiProviderConnectionSchema,
    updateFallbackOrderSchema,
    updateAiProviderSchema,
} from '../validators/ai-provider.validator.js';

const router = Router();

const idSchema = z.object({
    id: z.string().uuid('Invalid AI provider id'),
});

router.use(verifyToken);
router.use(checkRole(['admin']));
router.use(rateLimiter);

router.get('/', validateQuery(listAiProvidersQuerySchema), AiProviderController.index);
router.get('/:provider/models', AiProviderController.getModels);
router.get('/:id', validateParams(idSchema), AiProviderController.show);
router.post('/', validateBody(createAiProviderSchema), AiProviderController.create);
router.put('/fallback-order', validateBody(updateFallbackOrderSchema), AiProviderController.updateFallbackOrder);
router.put('/:id', validateParams(idSchema), validateBody(updateAiProviderSchema), AiProviderController.update);
router.delete('/:id', validateParams(idSchema), AiProviderController.delete);
router.post(
    '/:id/test',
    testConnectionLimiter,
    validateParams(idSchema),
    validateBody(testAiProviderConnectionSchema),
    AiProviderController.test
);
router.post('/:id/activate', validateParams(idSchema), AiProviderController.activate);

export default router;
