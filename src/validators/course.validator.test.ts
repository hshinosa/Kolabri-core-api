import { describe, expect, it } from 'vitest';

import { updateCourseSchema } from './course.validator.js';

describe('updateCourseSchema AI guardrail policy', () => {
    it('accepts supported preset and toggles', () => {
        const result = updateCourseSchema.safeParse({
            ai_guardrail_preset: 'balanced',
            ai_guardrail_allow_rewrite: true,
            ai_guardrail_allow_flag_only: false,
        });

        expect(result.success).toBe(true);
    });

    it('rejects unsupported preset', () => {
        const result = updateCourseSchema.safeParse({
            ai_guardrail_preset: 'custom',
        });

        expect(result.success).toBe(false);
    });
});
