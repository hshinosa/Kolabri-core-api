import { Request, Response, NextFunction } from 'express';
import { EmailVerificationService } from '../services/email-verification.service.js';

export class EmailVerificationController {
    /**
     * POST /api/auth/email-verification/verify
     * Verify email with token
     */
    static async verify(req: Request, res: Response, next: NextFunction) {
        try {
            const { token } = req.body;
            const result = await EmailVerificationService.verify(token);

            res.json({
                data: result,
                meta: { message: 'Email verified successfully' },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/auth/email-verification/resend
     * Resend verification email
     */
    static async resend(req: Request, res: Response, next: NextFunction) {
        try {
            const { email } = req.body;
            const result = await EmailVerificationService.resend(email);

            res.json({
                data: result,
                meta: { message: 'Verification email sent' },
            });
        } catch (error) {
            next(error);
        }
    }
}
