import { z } from 'zod';

export const readingRecommendationRequestSchema = z.object({
    topic: z.string().min(1, 'Topic is required').max(200, 'Topic is too long').trim(),
    limit: z.number().int().min(1).max(5).optional().default(3),
    source_scope: z.enum(['course_knowledge_base']).optional().default('course_knowledge_base'),
});

export type ReadingRecommendationRequest = z.infer<typeof readingRecommendationRequestSchema>;
