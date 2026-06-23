import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ApiError } from './errorHandler.js';
import prisma from '../config/database.js';
import { userActiveCache } from '../utils/userActiveCache.js';

export interface JwtPayload {
    userId: string;
    email: string;
    role: 'student' | 'lecturer' | 'admin';
}

 export interface AuthenticatedRequest extends Request {
     user?: JwtPayload;
     sessionDiscussionId?: string;
     groupId?: string;
 }

export async function verifyToken(req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw ApiError.unauthorized('No token provided');
        }

        const token = authHeader.split(' ')[1];
        const secret = process.env.JWT_SECRET;

        if (!secret) {
            throw ApiError.internal('JWT secret not configured');
        }

        const decoded = jwt.verify(token, secret) as JwtPayload;

        const cached = userActiveCache.get(decoded.userId);
        if (cached === null) {
            const user = await prisma.user.findFirst({
                where: { id: decoded.userId, deletedAt: null, isActive: true },
                select: { id: true },
            });
            if (!user) {
                userActiveCache.set(decoded.userId, false);
                return next(ApiError.unauthorized('User not found'));
            }
            userActiveCache.set(decoded.userId, true);
        } else if (cached === false) {
            return next(ApiError.unauthorized('User not found'));
        }

        req.user = decoded;
        next();
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            next(ApiError.unauthorized('Token expired'));
        } else if (error instanceof jwt.JsonWebTokenError) {
            next(ApiError.unauthorized('Invalid token'));
        } else {
            next(error);
        }
    }
}

export function checkRole(allowedRoles: Array<'student' | 'lecturer' | 'admin'>) {
    return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
        if (!req.user) {
            return next(ApiError.unauthorized('Not authenticated'));
        }

        if (!allowedRoles.includes(req.user.role)) {
            return next(ApiError.forbidden(`Access denied. Required role: ${allowedRoles.join(' or ')}`));
        }

        next();
    };
}

export const requireLecturer = checkRole(['lecturer', 'admin']);
export const requireStudent = checkRole(['student']);
export const requireAuth = verifyToken;
