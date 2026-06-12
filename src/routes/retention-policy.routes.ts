/**
 * Retention Policy Routes (NFR-DATA-01)
 * 
 * Admin-only routes for managing data retention policies.
 * All routes require authentication and admin role.
 */

import { Router } from 'express';
import { RetentionPolicyController } from '../controllers/retention-policy.controller.js';
import { verifyToken, checkRole } from '../middleware/auth.js';

const router = Router();

// Apply authentication and admin role check to all routes
router.use(verifyToken);
router.use(checkRole(['admin']));

// GET /api/admin/retention-policies - Get all policies
router.get('/', RetentionPolicyController.getAll);

// GET /api/admin/retention-policies/:id - Get single policy
router.get('/:id', RetentionPolicyController.getById);

// POST /api/admin/retention-policies - Create new policy
router.post('/', RetentionPolicyController.create);

// PUT /api/admin/retention-policies/:id - Update policy
router.put('/:id', RetentionPolicyController.update);

// DELETE /api/admin/retention-policies/:id - Delete policy
router.delete('/:id', RetentionPolicyController.delete);

export default router;
