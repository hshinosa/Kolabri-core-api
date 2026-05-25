import { z } from 'zod';

export const createGroupSchema = z.object({
    name: z
        .string()
        .min(2, 'Group name must be at least 2 characters')
        .max(100, 'Group name must be less than 100 characters')
        .trim(),
    member_ids: z
        .array(z.string().uuid('Invalid member ID'))
        .max(1000, 'Maximum 1000 members allowed')
        .optional(),
});

export const addMembersSchema = z.object({
    member_ids: z
        .array(z.string().uuid('Invalid member ID'))
        .min(1, 'At least one member is required')
        .max(1000, 'Maximum 1000 members allowed'),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type AddMembersInput = z.infer<typeof addMembersSchema>;
