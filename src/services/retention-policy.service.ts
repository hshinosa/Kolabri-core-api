/**
 * Retention Policy Service (NFR-DATA-01)
 * 
 * Manages data retention policies for different entity types.
 * Policies control how long data is retained before automatic cleanup.
 */

import prisma from '../config/database.js';
import { ApiError } from '../middleware/errorHandler.js';
import { DataType } from '@prisma/client';

interface CreateRetentionPolicyData {
    dataType: DataType;
    retentionDays: number;
    archiveAfterDays: number;
    autoPurge: boolean;
}

interface UpdateRetentionPolicyData {
    retentionDays?: number;
    archiveAfterDays?: number;
    autoPurge?: boolean;
}

export class RetentionPolicyService {
    /**
     * Get all retention policies, sorted by dataType
     */
    static async getAll() {
        const policies = await prisma.dataRetentionPolicy.findMany({
            orderBy: {
                dataType: 'asc',
            },
        });

        return policies;
    }

    /**
     * Get a single retention policy by ID
     */
    static async getById(id: string) {
        const policy = await prisma.dataRetentionPolicy.findUnique({
            where: { id },
        });

        if (!policy) {
            throw ApiError.notFound('Retention policy not found');
        }

        return policy;
    }

    /**
     * Get retention policy by data type
     */
    static async getByDataType(dataType: DataType) {
        const policy = await prisma.dataRetentionPolicy.findUnique({
            where: { dataType },
        });

        if (!policy) {
            throw ApiError.notFound(`Retention policy for ${dataType} not found`);
        }

        return policy;
    }

    /**
     * Create a new retention policy
     */
    static async create(data: CreateRetentionPolicyData) {
        // Validate retention days > archive days
        if (data.retentionDays < data.archiveAfterDays) {
            throw ApiError.badRequest('Retention days must be greater than or equal to archive days');
        }

        // Validate positive values
        if (data.retentionDays < 1 || data.archiveAfterDays < 1) {
            throw ApiError.badRequest('Retention and archive days must be positive numbers');
        }

        // Check if policy for this data type already exists
        const existing = await prisma.dataRetentionPolicy.findUnique({
            where: { dataType: data.dataType },
        });

        if (existing) {
            throw ApiError.badRequest(`Retention policy for ${data.dataType} already exists`);
        }

        const policy = await prisma.dataRetentionPolicy.create({
            data,
        });

        return policy;
    }

    /**
     * Update an existing retention policy
     */
    static async update(id: string, data: UpdateRetentionPolicyData) {
        // Check if policy exists
        const existing = await prisma.dataRetentionPolicy.findUnique({
            where: { id },
        });

        if (!existing) {
            throw ApiError.notFound('Retention policy not found');
        }

        // Validate if retention days and archive days are being updated
        const newRetentionDays = data.retentionDays ?? existing.retentionDays;
        const newArchiveAfterDays = data.archiveAfterDays ?? existing.archiveAfterDays;

        if (newRetentionDays < newArchiveAfterDays) {
            throw ApiError.badRequest('Retention days must be greater than or equal to archive days');
        }

        // Validate positive values
        if (data.retentionDays !== undefined && data.retentionDays < 1) {
            throw ApiError.badRequest('Retention days must be a positive number');
        }

        if (data.archiveAfterDays !== undefined && data.archiveAfterDays < 1) {
            throw ApiError.badRequest('Archive days must be a positive number');
        }

        const policy = await prisma.dataRetentionPolicy.update({
            where: { id },
            data,
        });

        return policy;
    }

    /**
     * Delete a retention policy
     */
    static async delete(id: string) {
        // Check if policy exists
        const existing = await prisma.dataRetentionPolicy.findUnique({
            where: { id },
        });

        if (!existing) {
            throw ApiError.notFound('Retention policy not found');
        }

        await prisma.dataRetentionPolicy.delete({
            where: { id },
        });

        return { success: true, message: 'Retention policy deleted successfully' };
    }
}
