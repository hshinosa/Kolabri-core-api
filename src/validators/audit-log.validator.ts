import { z } from 'zod';

const dateStringSchema = z.string().datetime({ offset: true }).or(z.string().date()).optional();

export const auditLogQuerySchema = z
    .object({
        action: z.string().trim().min(1).optional(),
        entityType: z.string().trim().min(1).optional(),
        entityId: z.string().trim().min(1).optional(),
        userId: z.string().uuid('Invalid user id').optional(),
        startDate: dateStringSchema,
        endDate: dateStringSchema,
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
    })
    .refine(
        (data) => {
            if (!data.startDate || !data.endDate) {
                return true;
            }

            return new Date(data.startDate).getTime() <= new Date(data.endDate).getTime();
        },
        {
            message: 'Start date must be before or equal to end date',
            path: ['startDate'],
        }
    );

export const auditEntityParamsSchema = z.object({
    entityType: z.string().trim().min(1, 'Entity type is required'),
    entityId: z.string().trim().min(1, 'Entity id is required'),
});

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
export type AuditEntityParams = z.infer<typeof auditEntityParamsSchema>;
