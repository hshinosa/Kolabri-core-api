import { z } from 'zod';

const uuidSchema = z.string().uuid('Invalid id');

const templateNameSchema = z
    .string()
    .trim()
    .min(3, 'Template name must be at least 3 characters')
    .max(255, 'Template name must be less than 255 characters');

const optionalDescriptionSchema = z
    .string()
    .trim()
    .max(1000, 'Description must be less than 1000 characters')
    .optional()
    .transform((value) => value || undefined);

const namePatternSchema = z
    .string()
    .trim()
    .min(3, 'Name pattern must be at least 3 characters')
    .max(255, 'Name pattern must be less than 255 characters');

const descriptionTemplateSchema = z
    .string()
    .trim()
    .max(2000, 'Description template must be less than 2000 characters')
    .optional()
    .transform((value) => value || undefined);

const templateGroupSchema = z.object({
    name: z.string().trim().min(1, 'Group name is required').max(255, 'Group name must be less than 255 characters'),
    description: z
        .string()
        .trim()
        .max(1000, 'Group description must be less than 1000 characters')
        .optional()
        .transform((value) => value || undefined),
});

export const createCourseTemplateSchema = z.object({
    name: templateNameSchema,
    description: optionalDescriptionSchema,
    namePattern: namePatternSchema,
    descriptionTemplate: descriptionTemplateSchema,
    defaultGroups: z.array(templateGroupSchema).max(20, 'Default groups must be 20 items or fewer').default([]),
    sourceCourseId: uuidSchema.optional(),
});

export const createCourseFromTemplateSchema = z.object({
    code: z
        .string()
        .trim()
        .min(1, 'Course code is required')
        .max(10, 'Course code must be at most 10 characters')
        .regex(/^[A-Za-z0-9]+$/, 'Course code must be alphanumeric')
        .transform((value) => value.toUpperCase()),
    name: z.string().trim().min(3, 'Course name must be at least 3 characters').max(255),
    description: z
        .string()
        .trim()
        .max(2000, 'Course description must be less than 2000 characters')
        .optional()
        .transform((value) => value || undefined),
    ownerId: uuidSchema,
});

export type CreateCourseTemplateInput = z.infer<typeof createCourseTemplateSchema>;
export type CreateCourseFromTemplateInput = z.infer<typeof createCourseFromTemplateSchema>;
