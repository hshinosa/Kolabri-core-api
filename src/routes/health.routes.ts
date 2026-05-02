import { Router, Request, Response } from 'express';
import prisma from '../config/database.js';
import mongoose from 'mongoose';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
    const services: Record<string, string> = {};
    let isHealthy = true;

    // Check PostgreSQL
    try {
        await prisma.$queryRaw`SELECT 1`;
        services.postgres = 'up';
    } catch {
        services.postgres = 'down';
        isHealthy = false;
    }

    // Check MongoDB
    try {
        if (mongoose.connection.readyState === 1) {
            services.mongodb = 'up';
        } else {
            services.mongodb = 'not connected';
        }
    } catch {
        services.mongodb = 'down';
    }

    res.status(200).json({
        status: isHealthy ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        services,
    });
});

export default router;
