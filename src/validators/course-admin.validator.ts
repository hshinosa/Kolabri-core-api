import { z } from 'zod';

const courseCodeSchema = z
    .string()
    .trim()
    .min(1, 'Course code is required')
    .max(10, 'Course code must be less than or equal to 10 characters')
    .regex(/^[A-Za-z0-9]+$/, 'Course code must be alphanumeric')
    .transform((value) => value.toUpperCase());

const courseNameSchema = z
    .string()
    .trim()
    .min(3, 'Course name must be at least 3 characters')
    .max(255, 'Course name must be less than 255 characters');

const courseDescriptionSchema = z
    .string()
    .trim()
    .max(1000, 'Description must be less than 1000 characters')
    .optional();

const ownerIdSchema = z.string().uuid('Invalid owner id');

export const listCoursesQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().optional(),
    ownerId: ownerIdSchema.optional(),
    sortBy: z.enum(['code', 'name', 'createdAt', 'updatedAt']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const createCourseSchema = z.object({
    code: courseCodeSchema,
    name: courseNameSchema,
    description: courseDescriptionSchema,
    ownerId: ownerIdSchema,
});

export const updateCourseSchema = z
    .object({
        code: courseCodeSchema.optional(),
        name: courseNameSchema.optional(),
        description: courseDescriptionSchema,
        ownerId: ownerIdSchema.optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
        message: 'At least one field must be provided',
    });

export const bulkCourseSelectionSchema = z.object({
    courseIds: z.array(z.string().uuid('Invalid course id')).min(1, 'Select at least one course').max(1000, 'Maximum 1000 courses allowed'),
});

export type ListCoursesQuery = z.infer<typeof listCoursesQuerySchema>;
export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
export type BulkCourseSelectionInput = z.infer<typeof bulkCourseSelectionSchema>;
