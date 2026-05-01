import { z } from 'zod';

export const usageStatsQuerySchema = z.object({
    userId: z.string().uuid().optional(),
    courseId: z.string().uuid().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
});

export const usageReportParamsSchema = z.object({
    userId: z.string().uuid(),
    month: z.coerce.number().int().min(1).max(12),
    year: z.coerce.number().int().min(2000).max(3000),
});

export const aiCompareSchema = z.object({
    prompt: z.string().trim().min(1).max(10000),
    models: z.array(z.string().min(1)).min(1),
});

export type UsageStatsQuery = z.infer<typeof usageStatsQuerySchema>;
export type UsageReportParams = z.infer<typeof usageReportParamsSchema>;
export type AiCompareInput = z.infer<typeof aiCompareSchema>;
