import { z } from 'zod';

export const previewRequestSchema = z.object({
    prompt: z.string().trim().min(1, 'Prompt is required').max(10000, 'Prompt too long'),
    systemPrompt: z.string().max(5000).optional(),
    courseId: z.string().uuid().optional(),
    providerName: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    temperature: z.number().min(0).max(2).optional().default(0.7),
    maxTokens: z.number().int().min(1).max(4096).optional().default(1024),
});

export const courseContextParamsSchema = z.object({
    courseId: z.string().uuid(),
});

export const courseContextQuerySchema = z.object({
    includeStudents: z
        .string()
        .optional()
        .transform((v) => v === 'true'),
    includeKnowledgeBase: z
        .string()
        .optional()
        .transform((v) => v === 'true'),
});

export const historyQuerySchema = z.object({
    courseId: z.string().uuid().optional(),
    studentId: z.string().uuid().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    provider: z.string().optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const abTestCreateSchema = z.object({
    name: z.string().trim().min(1, 'Name is required').max(200),
    description: z.string().max(1000).optional(),
    courseId: z.string().uuid(),
    variantA: z.object({
        systemPrompt: z.string().min(1).max(5000),
        temperature: z.number().min(0).max(2).optional().default(0.7),
        maxTokens: z.number().int().min(1).max(4096).optional().default(1024),
        model: z.string().optional(),
    }),
    variantB: z.object({
        systemPrompt: z.string().min(1).max(5000),
        temperature: z.number().min(0).max(2).optional().default(0.7),
        maxTokens: z.number().int().min(1).max(4096).optional().default(1024),
        model: z.string().optional(),
    }),
});

export const abTestUpdateSchema = z.object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(1000).optional(),
    status: z.enum(['draft', 'active', 'paused', 'completed']).optional(),
});

export const abTestParamsSchema = z.object({
    testId: z.string().uuid(),
});

export const abTestListQuerySchema = z.object({
    courseId: z.string().uuid().optional(),
    status: z.enum(['draft', 'active', 'paused', 'completed']).optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

// ============================================
// Type exports
// ============================================

export type PreviewRequest = z.infer<typeof previewRequestSchema>;
export type CourseContextParams = z.infer<typeof courseContextParamsSchema>;
export type CourseContextQuery = z.infer<typeof courseContextQuerySchema>;
export type HistoryQuery = z.infer<typeof historyQuerySchema>;
export type AbTestCreateInput = z.infer<typeof abTestCreateSchema>;
export type AbTestUpdateInput = z.infer<typeof abTestUpdateSchema>;
export type AbTestParams = z.infer<typeof abTestParamsSchema>;
export type AbTestListQuery = z.infer<typeof abTestListQuerySchema>;
