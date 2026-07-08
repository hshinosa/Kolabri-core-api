import { z } from 'zod';

const groupSizePolicySchema = z.object({
    min_members_per_group: z.number().int().min(1, 'Minimum group members must be at least 1').optional(),
    max_members_per_group: z.number().int().min(1, 'Maximum group members must be at least 1').max(8, 'Maximum group members cannot exceed 8').optional(),
}).refine((data) => {
    if (data.min_members_per_group === undefined || data.max_members_per_group === undefined) {
        return true;
    }

    return data.max_members_per_group >= data.min_members_per_group;
}, {
    message: 'Maximum group members must be greater than or equal to minimum group members',
    path: ['max_members_per_group'],
});

const aiGuardrailPolicySchema = z.object({
    ai_guardrail_preset: z.enum(['strict', 'balanced', 'relaxed']).optional(),
    ai_guardrail_allow_rewrite: z.boolean().optional(),
    ai_guardrail_allow_flag_only: z.boolean().optional(),
});

const aiScaffoldingPolicySchema = z.object({
    ai_scaffolding_level: z.enum(['early', 'late', 'auto']).optional(),
    ai_scaffolding_enabled: z.boolean().optional(),
});

export const createCourseSchema = z.object({
    code: z
        .string()
        .min(2, 'Course code must be at least 2 characters')
        .max(50, 'Course code must be less than 50 characters')
        .toUpperCase()
        .trim(),
    name: z
        .string()
        .min(3, 'Course name must be at least 3 characters')
        .max(255, 'Course name must be less than 255 characters')
        .trim(),
    description: z.string().max(1000, 'Description must be less than 1000 characters').optional(),
    semester: z.enum(['Ganjil', 'Genap']).optional(),
    academic_year: z
        .string()
        .regex(/^\d{4}\/\d{4}$/, 'Academic year format: YYYY/YYYY')
        .optional(),
}).and(groupSizePolicySchema).and(aiGuardrailPolicySchema).and(aiScaffoldingPolicySchema);

export const updateCourseSchema = z.object({
    name: z
        .string()
        .min(3, 'Course name must be at least 3 characters')
        .max(255, 'Course name must be less than 255 characters')
        .trim()
        .optional(),
    description: z.string().max(1000, 'Description must be less than 1000 characters').nullable().optional(),
    semester: z.enum(['Ganjil', 'Genap']).nullable().optional(),
    academic_year: z
        .string()
        .regex(/^\d{4}\/\d{4}$/, 'Academic year format: YYYY/YYYY')
        .nullable()
        .optional(),
    status: z.enum(['aktif', 'selesai']).optional(),
}).and(groupSizePolicySchema).and(aiGuardrailPolicySchema).and(aiScaffoldingPolicySchema);

export const joinCourseSchema = z.object({
    join_code: z
        .string()
        .min(4, 'Join code must be at least 4 characters')
        .max(20, 'Join code must be less than 20 characters')
        .toUpperCase()
        .trim(),
});

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type JoinCourseInput = z.infer<typeof joinCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
