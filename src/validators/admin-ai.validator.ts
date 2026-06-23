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


export type UsageStatsQuery = z.infer<typeof usageStatsQuerySchema>;
export type UsageReportParams = z.infer<typeof usageReportParamsSchema>;
