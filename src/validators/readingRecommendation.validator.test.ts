import { describe, expect, it } from 'vitest';

import { readingRecommendationRequestSchema } from './readingRecommendation.validator.js';

describe('readingRecommendationRequestSchema', () => {
    it('rejects unsupported source scope', () => {
        const result = readingRecommendationRequestSchema.safeParse({
            topic: 'transformer',
            source_scope: 'external_web',
        });

        expect(result.success).toBe(false);
    });
});
