import { z } from 'zod';

export const createReflectionSchema = z
    .object({
        goalId: z.string().uuid('Invalid goal ID').nullish(),
        courseId: z.string().uuid('Invalid course ID').nullish(),
        type: z.enum(['session', 'weekly']).default('weekly'),
        content: z
            .string()
            .min(20, 'Reflection must be at least 20 characters')
            .max(2000, 'Reflection must be less than 2000 characters')
            .trim(),
    })
    .refine((d) => d.goalId || d.courseId, {
        message: 'Either goalId or courseId is required',
        path: ['courseId'],
    });

export type CreateReflectionInput = z.infer<typeof createReflectionSchema>;
