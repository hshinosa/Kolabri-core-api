import { ApiError } from '../middleware/errorHandler.js';
import fs from 'fs/promises';
import path from 'path';
import prisma from '../config/database.js';
const EXPORT_DIR = path.join(process.cwd(), 'exports');
const EXPORT_EXPIRY_HOURS = 48;

interface ExportStatusCompleted {
    status: 'completed';
    jobId: string;
    filePath: string;
}

interface ExportStatusOther {
    status: string;
    jobId: string;
}

type ExportStatus = ExportStatusCompleted | ExportStatusOther;

export class DataExportService {
    // Rate limit: 1 export per 24h per user
    static async requestExport(userId: string, exportType: string = 'USER_DATA', courseId?: string) {
        // Validate exportType
        if (!['USER_DATA', 'COURSE_DATA'].includes(exportType)) {
            throw ApiError.badRequest('Invalid export type');
        }

        // Check for pending job (409 if exists)
        const pending = await prisma.exportJob.findFirst({
            where: { userId, exportType, status: { in: ['pending', 'processing'] } }
        });
        if (pending) {
            throw ApiError.conflict('Export already in progress');
        }

        // Rate limit: check if user has a completed export within last 24h
        const recentExport = await prisma.exportJob.findFirst({
            where: {
                userId,
                status: 'completed',
                createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
            },
            orderBy: { createdAt: 'desc' }
        });
        if (recentExport) {
            throw ApiError.tooManyRequests('Please wait 24 hours between export requests');
        }

        // Create job
        const job = await prisma.exportJob.create({
            data: { userId, exportType, courseId, status: 'pending' }
        });

        // Process async (don't await — return 202 immediately)
        this.processExport(job.id, userId, exportType, courseId).catch(async () => {
            await prisma.exportJob.update({
                where: { id: job.id },
                data: { status: 'failed' }
            });
        });

        return { jobId: job.id, status: 'pending' };
    }

    private static async processExport(jobId: string, userId: string, exportType: string, courseId?: string) {
        await prisma.exportJob.update({ where: { id: jobId }, data: { status: 'processing' } });

        // Ensure export directory exists
        await fs.mkdir(EXPORT_DIR, { recursive: true });

        // Gather user data
        const userData: Record<string, unknown> = {};

        // Profile
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { name: true, email: true, role: true, createdAt: true }
        });
        userData.profile = user;

        // Journals (reflections)
        userData.reflections = await prisma.reflection.findMany({
            where: { userId },
            select: { content: true, type: true, createdAt: true }
        });

        // Learning goals
        userData.learningGoals = await prisma.learningGoal.findMany({
            where: { userId },
            select: { content: true, isValidated: true, createdAt: true }
        });

        // Chat messages (from PostgreSQL)
        userData.chatMessages = await prisma.chatMessage.findMany({
            where: { senderId: userId },
            select: { content: true, senderType: true, createdAt: true, chatSpaceId: true }
        });

        // AI chats
        const aiChats = await prisma.aiChat.findMany({
            where: { userId },
            include: { messages: { select: { role: true, content: true, createdAt: true } } }
        });
        userData.aiChats = aiChats;

        // Consent records
        userData.consentRecords = await prisma.consentRecord.findMany({
            where: { userId },
            select: { consentType: true, granted: true, grantedAt: true, revokedAt: true }
        });

        // Privacy preferences
        const prefs = await prisma.user.findUnique({
            where: { id: userId },
            select: { analyticsVisibility: true, aiInteractionConsent: true, dataSharingConsent: true }
        });
        userData.privacyPreferences = prefs;

        // Course data export (if requested)
        if (exportType === 'COURSE_DATA' && courseId) {
            const course = await prisma.course.findUnique({
                where: { id: courseId },
                select: { id: true, code: true, name: true, description: true, semester: true, academicYear: true }
            });
            userData.course = course;

            userData.courseReflections = await prisma.reflection.findMany({
                where: { chatSpace: { group: { courseId } } },
                select: { content: true, type: true, createdAt: true }
            });

            userData.courseGoals = await prisma.learningGoal.findMany({
                where: { chatSpace: { group: { courseId } } },
                select: { content: true, isValidated: true, createdAt: true }
            });
        }

        // Write JSON file
        const fileName = `export-${userId}-${Date.now()}.json`;
        const filePath = path.join(EXPORT_DIR, fileName);
        await fs.writeFile(filePath, JSON.stringify(userData, null, 2), 'utf-8');

        // Update job
        await prisma.exportJob.update({
            where: { id: jobId },
            data: { status: 'completed', filePath: fileName, completedAt: new Date() }
        });
    }

    static async getExportStatus(userId: string, jobId: string): Promise<ExportStatus> {
        const job = await prisma.exportJob.findUnique({
            where: { id: jobId }
        });

        if (!job || job.userId !== userId) {
            throw ApiError.notFound('Export job not found');
        }

        if (job.status === 'completed' && job.completedAt) {
            // Check expiry (48h)
            const expiryTime = new Date(job.completedAt.getTime() + EXPORT_EXPIRY_HOURS * 60 * 60 * 1000);
            if (new Date() > expiryTime) {
                return { status: 'expired', jobId: job.id };
            }
            return { status: 'completed', jobId: job.id, filePath: job.filePath! };
        }

        return { status: job.status, jobId: job.id };
    }

    static async getExportFile(userId: string, jobId: string) {
        const status = await this.getExportStatus(userId, jobId);

        if (status.status === 'expired') {
            throw ApiError.gone('Export file has expired');
        }
        if (status.status !== 'completed') {
            throw ApiError.badRequest('Export not ready yet');
        }

        const completedStatus = status as ExportStatusCompleted;
        const filePath = path.join(EXPORT_DIR, completedStatus.filePath);
        const content = await fs.readFile(filePath, 'utf-8');
        return content;
    }

    // Cleanup expired exports (call from scheduled job)
    static async cleanupExpiredExports() {
        const cutoff = new Date(Date.now() - EXPORT_EXPIRY_HOURS * 60 * 60 * 1000);
        const expired = await prisma.exportJob.findMany({
            where: { status: 'completed', completedAt: { lt: cutoff } }
        });

        for (const job of expired) {
            if (job.filePath) {
                try {
                    await fs.unlink(path.join(EXPORT_DIR, job.filePath));
                } catch {
                    // Ignore file not found errors
                }
            }
            await prisma.exportJob.update({
                where: { id: job.id },
                data: { status: 'expired', filePath: null }
            });
        }

        return { cleaned: expired.length };
    }
}
