import { z } from 'zod';

const providerNameSchema = z
    .string()
    .trim()
    .min(2, 'Provider name must be at least 2 characters')
    .max(50, 'Provider name must be less than 50 characters')
    .regex(/^[a-z0-9-]+$/, 'Provider name must use lowercase letters, numbers, or hyphens');

const displayNameSchema = z
    .string()
    .trim()
    .min(2, 'Display name must be at least 2 characters')
    .max(100, 'Display name must be less than 100 characters');

const apiKeySchema = z
    .string()
    .trim()
    .min(10, 'API key must be at least 10 characters')
    .max(500, 'API key must be less than 500 characters');

const baseUrlSchema = z
    .union([
        z.string().trim().url('Base URL must be a valid URL'),
        z.literal(''),
        z.null(),
        z.undefined(),
    ])
    .transform((value) => {
        if (value === '' || value === null || value === undefined) {
            return undefined;
        }

        return value;
    });

const jsonRecordSchema = z.record(z.string(), z.unknown());

export const listAiProvidersQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().optional(),
    sortBy: z.enum(['name', 'displayName', 'createdAt', 'updatedAt', 'isActive']).default('updatedAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const createAiProviderSchema = z.object({
    name: providerNameSchema,
    displayName: displayNameSchema,
    apiKey: apiKeySchema,
    baseUrl: baseUrlSchema,
    config: jsonRecordSchema.optional(),
});

export const updateAiProviderSchema = z
    .object({
        displayName: displayNameSchema.optional(),
        apiKey: apiKeySchema.optional(),
        baseUrl: baseUrlSchema,
        config: jsonRecordSchema.optional(),
        isActive: z.boolean().optional(),
        fallbackOrder: z.number().int().min(0).optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
        message: 'At least one field must be provided',
    });

export const testAiProviderConnectionSchema = z.object({
    testPrompt: z.string().trim().min(1, 'Test prompt cannot be empty').max(1000).default('Hello'),
});

export const updateFallbackOrderSchema = z.object({
    providerIds: z.array(z.string().uuid('Invalid provider id')).min(1, 'At least one provider is required'),
});

export type ListAiProvidersQuery = z.infer<typeof listAiProvidersQuerySchema>;
export type CreateAiProviderInput = z.infer<typeof createAiProviderSchema>;
export type UpdateAiProviderInput = z.infer<typeof updateAiProviderSchema>;
export type TestAiProviderConnectionInput = z.infer<typeof testAiProviderConnectionSchema>;
export type FallbackOrderInput = z.infer<typeof updateFallbackOrderSchema>;
