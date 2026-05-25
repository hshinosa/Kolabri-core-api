import { Request, Response, NextFunction } from 'express';
import { PasswordResetService } from '../services/password-reset.service.js';

export class PasswordResetController {
    /**
     * POST /api/auth/password-reset/request
     * Request password reset
     */
    static async requestReset(req: Request, res: Response, next: NextFunction) {
        try {
            const { email } = req.body;
            const result = await PasswordResetService.requestReset(email);

            res.json({
                data: result,
                meta: { message: 'Password reset requested' },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/auth/password-reset/verify
     * Verify reset token
     */
    static async verifyToken(req: Request, res: Response, next: NextFunction) {
        try {
            const { token } = req.body;
            const result = await PasswordResetService.verifyToken(token);

            res.json({
                data: result,
                meta: { message: 'Token verified' },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/auth/password-reset/reset
     * Reset password
     */
    static async resetPassword(req: Request, res: Response, next: NextFunction) {
        try {
            const { token, newPassword } = req.body;
            const result = await PasswordResetService.resetPassword(token, newPassword);

            res.json({
                data: result,
                meta: { message: 'Password reset successful' },
            });
        } catch (error) {
            next(error);
        }
    }
}
