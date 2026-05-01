import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

export class AuthController {
    /**
     * POST /api/auth/register
     * Register a new user
     */
    static async register(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await AuthService.register(req.body);

            res.status(201).json({
                data: result,
                meta: {
                    message: 'User registered successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/auth/login
     * Login user and return access + refresh tokens
     */
    static async login(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await AuthService.login(req.body);

            res.json({
                data: result,
                meta: {
                    message: 'Login successful',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/auth/refresh
     * Refresh access token using refresh token
     */
    static async refresh(req: Request, res: Response, next: NextFunction) {
        try {
            const { refreshToken } = req.body;

            if (!refreshToken) {
                return res.status(400).json({
                    error: { code: 'BAD_REQUEST', message: 'Refresh token required' },
                });
            }

            const result = await AuthService.refreshAccessToken(refreshToken);

            res.json({
                data: result,
                meta: {
                    message: 'Token refreshed successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/auth/logout
     * Logout and revoke refresh token
     */
    static async logout(req: Request, res: Response, next: NextFunction) {
        try {
            const { refreshToken } = req.body;

            if (!refreshToken) {
                return res.status(400).json({
                    error: { code: 'BAD_REQUEST', message: 'Refresh token required' },
                });
            }

            const result = await AuthService.logout(refreshToken);

            res.json({
                data: result,
                meta: {
                    message: 'Logged out successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/auth/me
     * Get current user profile
     */
    static async getProfile(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            if (!req.user) {
                return res.status(401).json({
                    error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
                });
            }

            const user = await AuthService.getProfile(req.user.userId);

            res.json({
                data: user,
            });
        } catch (error) {
            next(error);
        }
    }
}
