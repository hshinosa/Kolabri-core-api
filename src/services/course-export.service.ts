import { PrismaClient } from '@prisma/client';
import { ApiError } from '../middleware/errorHandler.js';
import fs from 'fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'path';
import { finished } from 'node:stream/promises';
import { ZipArchive } from 'archiver';
import { Parser } from 'json2csv';
import { ChatLog } from '../models/ChatLog.js';
import { logger } from '../utils/logger.js';

const prisma = new PrismaClient();
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

export class CourseExportService {
    static async requestCourseExport(userId: string, courseId: string) {
        const course = await prisma.course.findFirst({
            where: { id: courseId, deletedAt: null },
            include: { owner: { select: { id: true } } }
        });

        if (!course) {
            throw ApiError.notFound('Course not found');
        }

        if (course.ownerId !== userId) {
            throw ApiError.forbidden('You do not own this course');
        }

        const pending = await prisma.exportJob.findFirst({
            where: { 
                userId, 
                courseId,
                exportType: 'COURSE_DATA',
                status: { in: ['pending', 'processing'] } 
            }
        });

        if (pending) {
            throw ApiError.conflict('Export already in progress for this course');
        }

        const recentExport = await prisma.exportJob.findFirst({
            where: {
                userId,
                courseId,
                exportType: 'COURSE_DATA',
                status: 'completed',
                createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
            },
            orderBy: { createdAt: 'desc' }
        });

        if (recentExport) {
            throw ApiError.tooManyRequests('Please wait 24 hours between course export requests');
        }

        const job = await prisma.exportJob.create({
            data: { 
                userId, 
                courseId,
                exportType: 'COURSE_DATA',
                status: 'pending' 
            }
        });

        this.processCourseExport(job.id, courseId).catch(async (error) => {
            logger.error('Course export failed', {
                jobId: job.id,
                userId,
                courseId,
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            });
            try {
                await prisma.exportJob.update({
                    where: { id: job.id },
                    data: { status: 'failed' }
                });
            } catch (updateError) {
                logger.error('Failed to mark course export as failed', {
                    jobId: job.id,
                    error: updateError instanceof Error ? updateError.message : String(updateError),
                    stack: updateError instanceof Error ? updateError.stack : undefined,
                });
            }
        });

        return { jobId: job.id, status: 'pending' };
    }

    private static async processCourseExport(jobId: string, courseId: string) {
        await prisma.exportJob.update({ 
            where: { id: jobId }, 
            data: { status: 'processing' } 
        });

        await fs.mkdir(EXPORT_DIR, { recursive: true });

        const fileName = `course-export-${courseId}-${Date.now()}.zip`;
        const zipPath = path.join(EXPORT_DIR, fileName);

        const writeStream = createWriteStream(zipPath);
        const archive = new ZipArchive({ zlib: { level: 9 } });
        const streamFinished = finished(writeStream);
        archive.on('error', (error) => writeStream.destroy(error));
        archive.pipe(writeStream);

        try {
            const course = await prisma.course.findUnique({
                where: { id: courseId },
                select: {
                    id: true,
                    code: true,
                    name: true,
                    description: true,
                    semester: true,
                    academicYear: true,
                    createdAt: true,
                    minMembersPerGroup: true,
                    maxMembersPerGroup: true
                }
            });

            archive.append(JSON.stringify(course, null, 2), { name: 'course.json' });

            const enrollments = await prisma.courseStudent.findMany({
                where: { courseId },
                include: {
                    user: {
                        select: { id: true, name: true, email: true }
                    }
                }
            });

            const enrollmentData = enrollments.map(e => ({
                studentId: e.user.id,
                studentName: e.user.name,
                studentEmail: e.user.email,
                enrolledAt: e.enrolledAt.toISOString()
            }));

            if (enrollmentData.length > 0) {
                const parser = new Parser();
                const enrollmentsCsv = parser.parse(enrollmentData);
                archive.append(enrollmentsCsv, { name: 'enrollments.csv' });
            } else {
                archive.append('studentId,studentName,studentEmail,enrolledAt\n', { name: 'enrollments.csv' });
            }

            const groups = await prisma.group.findMany({
                where: { courseId, deletedAt: null },
                include: {
                    chatSpaces: {
                        select: {
                            id: true,
                            name: true,
                            type: true,
                            createdAt: true,
                            closedAt: true
                        }
                    },
                    members: {
                        include: {
                            user: { select: { id: true, name: true } }
                        }
                    }
                }
            });

            const sessionData: any[] = [];
            const interactionData: any[] = [];

            for (const group of groups) {
                for (const chatSpace of group.chatSpaces) {
                    const messageCount = await ChatLog.countDocuments({
                        chatSpaceId: chatSpace.id,
                        deletedAt: null
                    });

                    sessionData.push({
                        groupId: group.id,
                        groupName: group.name,
                        chatSpaceId: chatSpace.id,
                        chatSpaceName: chatSpace.name,
                        chatSpaceType: chatSpace.type || '',
                        createdAt: chatSpace.createdAt.toISOString(),
                        closedAt: chatSpace.closedAt?.toISOString() || '',
                        totalMessages: messageCount,
                        memberCount: group.members.length
                    });

                    const messageCounts = await ChatLog.aggregate([
                        {
                            $match: {
                                chatSpaceId: chatSpace.id,
                                deletedAt: null,
                                senderType: 'student'
                            }
                        },
                        {
                            $group: {
                                _id: '$senderId',
                                messageCount: { $sum: 1 }
                            }
                        }
                    ]);

                    for (const mc of messageCounts) {
                        const member = group.members.find(m => m.userId === mc._id);
                        interactionData.push({
                            chatSpaceId: chatSpace.id,
                            chatSpaceName: chatSpace.name,
                            groupId: group.id,
                            groupName: group.name,
                            studentId: mc._id,
                            studentName: member?.user.name || 'Unknown',
                            messageCount: mc.messageCount
                        });
                    }
                }
            }

            if (sessionData.length > 0) {
                const parser = new Parser();
                const sessionsCsv = parser.parse(sessionData);
                archive.append(sessionsCsv, { name: 'sessions.csv' });
            } else {
                archive.append('groupId,groupName,chatSpaceId,chatSpaceName,chatSpaceType,createdAt,closedAt,totalMessages,memberCount\n', { name: 'sessions.csv' });
            }

            if (interactionData.length > 0) {
                const parser = new Parser();
                const interactionsCsv = parser.parse(interactionData);
                archive.append(interactionsCsv, { name: 'interactions.csv' });
            } else {
                archive.append('chatSpaceId,chatSpaceName,groupId,groupName,studentId,studentName,messageCount\n', { name: 'interactions.csv' });
            }

            const totalMessages = sessionData.reduce((sum, s) => sum + s.totalMessages, 0);
            const avgMessagesPerSession = sessionData.length > 0 ? totalMessages / sessionData.length : 0;

            const analyticsSummary = {
                courseId: course?.id,
                courseName: course?.name,
                courseCode: course?.code,
                totalStudents: enrollmentData.length,
                totalGroups: groups.length,
                totalChatSpaces: sessionData.length,
                totalMessages,
                averageMessagesPerSession: Math.round(avgMessagesPerSession * 10) / 10,
                exportedAt: new Date().toISOString()
            };

            archive.append(JSON.stringify(analyticsSummary, null, 2), { name: 'analytics-summary.json' });

            await archive.finalize();
            await streamFinished;

            const stats = await fs.stat(zipPath);
            if (stats.size === 0) {
                throw new Error('Course export generated an empty zip file');
            }

            await prisma.exportJob.update({
                where: { id: jobId },
                data: {
                    status: 'completed',
                    filePath: fileName,
                    completedAt: new Date()
                }
            });
        } catch (error) {
            archive.abort();
            writeStream.destroy();
            await Promise.allSettled([streamFinished, fs.rm(zipPath, { force: true })]);
            throw error;
        } finally {
            if (!writeStream.closed) {
                writeStream.destroy();
            }
        }
    }

    static async getExportStatus(userId: string, jobId: string): Promise<ExportStatus> {
        const job = await prisma.exportJob.findUnique({
            where: { id: jobId }
        });

        if (!job || job.userId !== userId) {
            throw ApiError.notFound('Export job not found');
        }

        if (job.status === 'completed' && job.completedAt) {
            const expiryTime = new Date(job.completedAt.getTime() + EXPORT_EXPIRY_HOURS * 60 * 60 * 1000);
            if (new Date() > expiryTime) {
                return { status: 'expired', jobId: job.id };
            }
            return { status: 'completed', jobId: job.id, filePath: job.filePath! };
        }

        return { status: job.status, jobId: job.id };
    }

    static async downloadExport(userId: string, jobId: string): Promise<string> {
        const status = await this.getExportStatus(userId, jobId);

        if (status.status === 'expired') {
            throw ApiError.gone('Export file has expired');
        }
        if (status.status !== 'completed') {
            throw ApiError.badRequest('Export not ready yet');
        }

        const completedStatus = status as ExportStatusCompleted;
        const filePath = path.join(EXPORT_DIR, completedStatus.filePath);
        
        try {
            await fs.access(filePath);
        } catch {
            throw ApiError.notFound('Export file not found');
        }

        return filePath;
    }
}
