import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { AuthController } from "../controllers/auth.controller.js";
import { UserController } from "../controllers/user.controller.js";
import { AdminUserController } from "../controllers/admin-user.controller.js";
import { verifyToken, checkRole } from "../middleware/auth.js";
import { ApiError } from "../middleware/errorHandler.js";
import { rateLimiter } from "../middleware/rateLimiter.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../validators/validate.js";
import {
  bulkDeleteUsersSchema,
  bulkRoleChangeSchema,
  createUserSchema,
  listUsersQuerySchema,
  resetPasswordSchema,
  updateUserSchema,
  adminUpdateUserSchema,
} from "../validators/user.validator.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === "text/csv" ||
      file.originalname.toLowerCase().endsWith(".csv")
    ) {
      cb(null, true);
      return;
    }

    cb(ApiError.badRequest("Only CSV files are allowed"));
  },
});

const idSchema = z.object({
  id: z.string().uuid("Invalid user id"),
});

router.use(verifyToken);

// Profil diri sendiri — boleh untuk semua role (client-app ProfileController PUT /api/users/me).
// HARUS sebelum checkRole(['admin']) di bawah. updateUserSchema tidak punya
// role/isActive → eskalasi privil lewat profil diri mustahil (fix C1/F-01).
router.put("/me", validateBody(updateUserSchema), AuthController.updateProfile);

router.use(checkRole(["admin"]));
router.use(rateLimiter);

router.get("/", validateQuery(listUsersQuerySchema), UserController.index);
router.post(
  "/bulk-delete",
  validateBody(bulkDeleteUsersSchema),
  UserController.bulkDelete,
);
router.post(
  "/bulk-role-change",
  validateBody(bulkRoleChangeSchema),
  UserController.bulkRoleChange,
);
router.post("/bulk-import", upload.single("file"), UserController.bulkImport);
router.get("/:id", validateParams(idSchema), UserController.show);
router.post("/", validateBody(createUserSchema), UserController.create);
router.put(
  "/:id",
  validateParams(idSchema),
  validateBody(adminUpdateUserSchema),
  UserController.update,
);
router.delete("/:id", validateParams(idSchema), UserController.delete);
router.delete(
  "/:id/hard",
  validateParams(idSchema),
  AdminUserController.forceHardDelete,
);
router.post(
  "/:id/reset-password",
  validateParams(idSchema),
  validateBody(resetPasswordSchema),
  UserController.resetPassword,
);
router.put(
  "/:id/toggle-status",
  validateParams(idSchema),
  UserController.toggleStatus,
);

export default router;
