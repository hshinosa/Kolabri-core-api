import { z } from 'zod';

export const activityQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
});

export const chartPeriodSchema = z.object({
    period: z.enum(['7d', '30d', '90d', '1y']).default('30d'),
});

export const statsDateRangeSchema = z
    .object({
        startDate: z.string().datetime({ offset: true }).or(z.string().date()).optional(),
        endDate: z.string().datetime({ offset: true }).or(z.string().date()).optional(),
    })
    .refine(
        (data) => {
            if (!data.startDate || !data.endDate) {
                return true;
            }

            return new Date(data.startDate).getTime() <= new Date(data.endDate).getTime();
        },
        {
            message: 'Start date must be before or equal to end date',
            path: ['startDate'],
        }
    );

export type ActivityQuery = z.infer<typeof activityQuerySchema>;
export type ChartPeriod = z.infer<typeof chartPeriodSchema>;
export type StatsDateRangeQuery = z.infer<typeof statsDateRangeSchema>;
