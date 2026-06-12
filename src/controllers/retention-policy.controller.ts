/**
 * Retention Policy Controller (NFR-DATA-01)
 * 
 * REST API endpoints for managing data retention policies.
 * Admin-only access enforced by route middleware.
 */

import { Request, Response, NextFunction } from 'express';
import { RetentionPolicyService } from '../services/retention-policy.service.js';
import { DataType } from '@prisma/client';

export class RetentionPolicyController {
    /**
     * GET /api/admin/retention-policies
     * Get all retention policies
     */
    static async getAll(_req: Request, res: Response, next: NextFunction) {
        try {
            const policies = await RetentionPolicyService.getAll();
            
            res.json({
                success: true,
                data: policies,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/admin/retention-policies/:id
     * Get a single retention policy by ID
     */
    static async getById(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const policy = await RetentionPolicyService.getById(id);
            
            res.json({
                success: true,
                data: policy,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/admin/retention-policies
     * Create a new retention policy
     */
    static async create(req: Request, res: Response, next: NextFunction) {
        try {
            const { dataType, retentionDays, archiveAfterDays, autoPurge } = req.body;

            // Validate required fields
            if (!dataType) {
                return res.status(400).json({
                    success: false,
                    message: 'dataType is required',
                });
            }

            if (retentionDays === undefined || retentionDays === null) {
                return res.status(400).json({
                    success: false,
                    message: 'retentionDays is required',
                });
            }

            if (archiveAfterDays === undefined || archiveAfterDays === null) {
                return res.status(400).json({
                    success: false,
                    message: 'archiveAfterDays is required',
                });
            }

            // Validate dataType is valid enum value
            if (!Object.values(DataType).includes(dataType)) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid dataType. Must be one of: ${Object.values(DataType).join(', ')}`,
                });
            }

            const policy = await RetentionPolicyService.create({
                dataType,
                retentionDays: parseInt(retentionDays, 10),
                archiveAfterDays: parseInt(archiveAfterDays, 10),
                autoPurge: autoPurge ?? false,
            });

            res.status(201).json({
                success: true,
                data: policy,
                message: 'Retention policy created successfully',
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * PUT /api/admin/retention-policies/:id
     * Update an existing retention policy
     */
    static async update(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const { retentionDays, archiveAfterDays, autoPurge } = req.body;

            // Build update data object
            const updateData: {
                retentionDays?: number;
                archiveAfterDays?: number;
                autoPurge?: boolean;
            } = {};

            if (retentionDays !== undefined && retentionDays !== null) {
                updateData.retentionDays = parseInt(retentionDays, 10);
            }

            if (archiveAfterDays !== undefined && archiveAfterDays !== null) {
                updateData.archiveAfterDays = parseInt(archiveAfterDays, 10);
            }

            if (autoPurge !== undefined && autoPurge !== null) {
                updateData.autoPurge = Boolean(autoPurge);
            }

            // Check if there's anything to update
            if (Object.keys(updateData).length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No fields to update',
                });
            }

            const policy = await RetentionPolicyService.update(id, updateData);

            res.json({
                success: true,
                data: policy,
                message: 'Retention policy updated successfully',
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * DELETE /api/admin/retention-policies/:id
     * Delete a retention policy
     */
    static async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const result = await RetentionPolicyService.delete(id);

            res.json(result);
        } catch (error) {
            next(error);
        }
    }
}
