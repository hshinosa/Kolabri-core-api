import { z } from 'zod';

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
});

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
