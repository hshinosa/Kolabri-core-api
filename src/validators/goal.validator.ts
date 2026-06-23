import { z } from 'zod';

export const createGoalSchema = z.object({
    session_discussion_id: z.string().uuid('Invalid session discussion ID'),
    content: z
        .string()
        .min(20, 'Goal must be at least 20 characters')
        .max(500, 'Goal must be less than 500 characters')
        .trim(),
    week_context: z
        .object({
            week_title: z.string(),
            week_index: z.number(),
            material_titles: z.array(z.string()),
        })
        .nullish(),
});

export type CreateGoalInput = z.infer<typeof createGoalSchema>;
