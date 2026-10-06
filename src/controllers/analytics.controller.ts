import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AnalyticsService } from '../services/analytics.service.js';

export class AnalyticsController {
    static async getGroupAnalytics(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await AnalyticsService.getGroupAnalytics(
                req.params.groupId,
                req.user?.userId,
                req.user?.role
            );
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async getCourseAnalytics(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await AnalyticsService.getCourseAnalytics(
                req.params.courseId,
                req.user?.userId
            );
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async getStudentBreakdown(req: Request, res: Response, next: NextFunction) {
        try {
            const page = parseInt(req.query.page as string) || 1;
            const perPage = parseInt(req.query.perPage as string) || 15;
            const sortBy = (req.query.sortBy as string) || 'quality_score';
            const sortDir = (req.query.sortDir as string) || 'desc';
            const search = req.query.search as string;
            const minScore = req.query.minScore ? parseFloat(req.query.minScore as string) : undefined;
            const maxScore = req.query.maxScore ? parseFloat(req.query.maxScore as string) : undefined;
            const startDate = req.query.startDate as string;
            const endDate = req.query.endDate as string;

            const result = await AnalyticsService.getStudentBreakdown(
                req.params.courseId,
                { page, perPage, sortBy, sortDir, search, minScore, maxScore, startDate, endDate }
            );
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async analyzeText(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await AnalyticsService.analyzeText(req.body.text);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async exportProcessMining(req: Request, res: Response, next: NextFunction) {
        try {
            const format = (req.query.format as string) || 'json';
            
            if (!['json', 'csv'].includes(format)) {
                return res.status(400).json({ 
                    error: { 
                        code: 'INVALID_FORMAT', 
                        message: 'Format must be either json or csv' 
                    } 
                });
            }

            // Mendukung GET /api/analytics/export?courseId=... (dipakai BFF export-section)
            const courseId = req.params.courseId || (req.query.courseId as string);
            if (!courseId) {
                return res.status(400).json({
                    error: { code: 'BAD_REQUEST', message: 'courseId is required' },
                });
            }

            const result = await AnalyticsService.exportProcessMining(
                courseId,
                req.user?.userId,
                format
            );

            if (format === 'csv') {
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename="analytics-${req.params.courseId}.csv"`);
                res.send(result.data);
            } else {
                res.json(result);
            }
        } catch (error) {
            next(error);
        }
    }

    static async exportAnalyticsSummary(req: Request, res: Response, next: NextFunction) {
        try {
            const format = (req.query.format as string) || 'json';
            
            if (!['json', 'csv'].includes(format)) {
                return res.status(400).json({ 
                    error: { 
                        code: 'INVALID_FORMAT', 
                        message: 'Format must be either json or csv' 
                    } 
                });
            }

            const result = await AnalyticsService.getAnalyticsSummary(
                req.params.courseId,
                req.user?.userId
            );

            if (format === 'csv') {
                const csvData = AnalyticsService.formatAnalyticsAsCSV(result.summary);
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename="analytics-summary-${req.params.courseId}.csv"`);
                res.send(csvData);
            } else {
                res.json(result);
            }
        } catch (error) {
            next(error);
        }
    }

    static async getSessionDiscussionAnalytics(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await AnalyticsService.getSessionDiscussionAnalytics(
                req.params.sessionDiscussionId,
                req.user?.userId,
                req.user?.role
            );
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async getGroupQualityStatus(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await AnalyticsService.getGroupQualityStatus(
                req.params.groupId,
                req.user?.userId
            );
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async getParticipantActivity(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await AnalyticsService.getParticipantActivity(
                req.params.groupId,
                req.user?.userId
            );
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async getRecentActivity(req: Request, res: Response, next: NextFunction) {
        try {
            const limit = parseInt(req.query.limit as string) || 5;
            const result = await AnalyticsService.getRecentActivity(
                req.user!.userId,
                limit
            );
            res.json({ data: result });
        } catch (error) {
            next(error);
        }
    }

    static async getDashboardCharts(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await AnalyticsService.getDashboardCharts(req.user!.userId);
            res.json({ data: result });
        } catch (error) {
            next(error);
        }
    }

    static async getAnalyticsOverview(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await AnalyticsService.getAnalyticsOverview(req.user!.userId);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/analytics/courses/:courseId/live
     * Data segar per kelompok (refresh kartu analitik). Sebelumnya 404.
     */
    static async getCourseLive(req: Request, res: Response, next: NextFunction) {
        try {
            const result = (await AnalyticsService.getCourseAnalytics(
                req.params.courseId,
                req.user?.userId
            )) as { groups?: unknown[]; summary?: unknown; course?: unknown };
            res.json({
                success: true,
                data: {
                    groups: result.groups ?? [],
                    summary: result.summary ?? null,
                    course: result.course ?? null,
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/analytics/courses/:courseId/trends?metric=engagement|completion|attendance
     * Titik tren per hari. Sebelumnya 404.
     */
    static async getCourseTrends(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await AnalyticsService.getCourseTrendPoints(
                req.params.courseId,
                (req.query.metric as string) || 'engagement',
                (req.query.startDate as string) || (req.query.start_date as string),
                (req.query.endDate as string) || (req.query.end_date as string)
            );
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/analytics/courses/:courseId/share
     * Token berbagi laporan: stateless (JWT + exp), tanpa tabel baru.
     * Sebelumnya 404.
     */
    static async generateShareLink(req: Request, res: Response, next: NextFunction) {
        try {
            const secret = process.env.JWT_SECRET;
            if (!secret) {
                return res.status(500).json({
                    error: { code: 'CONFIG', message: 'JWT_SECRET not configured' },
                });
            }
            const section = (req.body?.section as string) || '';
            if (!section) {
                return res.status(400).json({
                    error: { code: 'VALIDATION', message: 'section is required' },
                });
            }
            const days = Math.min(30, Math.max(1, Number(req.body?.expiresInDays) || 7));
            const now = Math.floor(Date.now() / 1000);
            const token = jwt.sign(
                {
                    courseId: req.params.courseId,
                    section,
                    studentId: req.body?.studentId,
                    metric: req.body?.metric,
                    iat: now,
                    exp: now + days * 86400,
                },
                secret
            );
            res.json({
                success: true,
                data: {
                    token,
                    url: `/analytics/shared/${token}`,
                    expiresAt: new Date((now + days * 86400) * 1000).toISOString(),
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/analytics/shared/:token — akses PUBLIK (tanpa login) ke laporan berbagi.
     */
    static async getSharedReport(req: Request, res: Response, next: NextFunction) {
        try {
            const secret = process.env.JWT_SECRET;
            type SharedPayload = { courseId?: string; section?: string; exp?: number };
            let payload: SharedPayload | null = null;
            try {
                payload = jwt.verify(req.params.token, secret || '') as SharedPayload;
            } catch {
                return res.status(404).json({
                    error: { code: 'NOT_FOUND', message: 'Shared report not found or expired' },
                });
            }
            if (!payload?.courseId) {
                return res.status(404).json({
                    error: { code: 'NOT_FOUND', message: 'Shared report not found or expired' },
                });
            }
            const result = (await AnalyticsService.getCourseAnalytics(payload.courseId, undefined)) as {
                course?: unknown;
                summary?: unknown;
                groups?: unknown[];
            };
            res.json({
                success: true,
                data: {
                    section: payload.section || 'overview',
                    expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
                    generatedAt: new Date().toISOString(),
                    course: result.course ?? null,
                    summary: result.summary ?? null,
                    groups: result.groups ?? [],
                },
            });
        } catch (error) {
            next(error);
        }
    }
}
