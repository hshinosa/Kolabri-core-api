import { z } from 'zod';

export const cloneCourseSchema = z.object({
    code: z
        .string()
        .trim()
        .min(1, 'Course code is required')
        .max(10, 'Course code must be less than or equal to 10 characters')
        .regex(/^[A-Za-z0-9]+$/, 'Course code must be alphanumeric')
        .transform((val) => val.toUpperCase()),
    name: z.string().trim().min(3, 'Course name must be at least 3 characters').max(255, 'Course name must be less than 255 characters'),
});

export type CloneCourseInput = z.infer<typeof cloneCourseSchema>;
