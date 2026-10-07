import { z } from "zod";

export const createUserSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(255, "Name must be less than 255 characters")
    .trim(),
  email: z.string().email("Invalid email address").toLowerCase().trim(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(100, "Password must be less than 100 characters"),
  role: z.enum(["student", "lecturer", "admin"]),
});

/**
 * PUT /api/users/me — profil diri sendiri (name/email saja), semua role.
 *
 * `role` & `isActive` TIDAK didefinisikan di schema ini sehingga z.object
 * membuang key tak dikenal: upaya eskalasi (`{role:'admin'}`) tidak pernah
 * sampai ke service. Payload yang hanya berisi field terlarang menyisakan
 * object kosong → gagal di refine bawah (400).
 */
export const updateUserSchema = z
  .object({
    name: z
      .string()
      .min(2, "Name must be at least 2 characters")
      .max(255, "Name must be less than 255 characters")
      .trim()
      .optional(),
    email: z
      .string()
      .email("Invalid email address")
      .toLowerCase()
      .trim()
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

/**
 * PUT /api/users/:id — hanya dipakai route di belakang `checkRole(['admin'])`
 * (user.routes.ts), jadi manajemen role/isActive admin tetap hidup lewat sini
 * dan lewat /bulk-role-change + /:id/toggle-status.
 */
export const adminUpdateUserSchema = z
  .object({
    name: z
      .string()
      .min(2, "Name must be at least 2 characters")
      .max(255, "Name must be less than 255 characters")
      .trim()
      .optional(),
    email: z
      .string()
      .email("Invalid email address")
      .toLowerCase()
      .trim()
      .optional(),
    role: z.enum(["student", "lecturer", "admin"]).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  role: z.enum(["student", "lecturer", "admin"]).optional(),
  search: z.string().trim().optional(),
  sortBy: z.enum(["name", "email", "createdAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const resetPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(100, "Password must be less than 100 characters"),
});

export const bulkDeleteUsersSchema = z.object({
  userIds: z
    .array(z.string().uuid("Invalid user id"))
    .min(1, "Select at least one user")
    .max(1000, "Maximum 1000 users allowed"),
});

export const bulkRoleChangeSchema = z.object({
  userIds: z
    .array(z.string().uuid("Invalid user id"))
    .min(1, "Select at least one user")
    .max(1000, "Maximum 1000 users allowed"),
  role: z.enum(["student", "lecturer", "admin"]),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type BulkDeleteUsersInput = z.infer<typeof bulkDeleteUsersSchema>;
export type BulkRoleChangeInput = z.infer<typeof bulkRoleChangeSchema>;
export type UserRole = z.infer<typeof createUserSchema.shape.role>;
