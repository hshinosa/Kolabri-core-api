import { z } from 'zod';

export const cloneCourseSchema = z.object({
    code: z
        .string()
        .min(1, 'Course code is required')
        .max(10, 'Course code must be at most 10 characters')
        .regex(/^[A-Z0-9]+$/, 'Course code must be uppercase alphanumeric')
        .transform((val) => val.toUpperCase()),
    name: z.string().min(3, 'Course name must be at least 3 characters').max(255),
});

export type CloneCourseInput = z.infer<typeof cloneCourseSchema>;
