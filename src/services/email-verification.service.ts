import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { ApiError } from '../middleware/errorHandler.js';

const prisma = new PrismaClient();

export class EmailVerificationService {
    /**
     * Verify email using token
     */
    static async verify(token: string): Promise<{ message: string }> {
        const verificationToken = await prisma.emailVerificationToken.findUnique({
            where: { token },
        });

        if (!verificationToken || verificationToken.expiresAt < new Date()) {
            throw ApiError.badRequest('Invalid or expired token');
        }

        await prisma.user.update({
            where: { email: verificationToken.email },
            data: { emailVerifiedAt: new Date() },
        });

        await prisma.emailVerificationToken.delete({ where: { token } });

        return { message: 'Email verified successfully' };
    }

    /**
     * Resend verification email
     */
    static async resend(email: string): Promise<{ message: string }> {
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            return { message: 'If email exists, verification sent' };
        }

        if (user.emailVerifiedAt) {
            throw ApiError.badRequest('Email already verified');
        }

        await prisma.emailVerificationToken.deleteMany({ where: { email } });

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await prisma.emailVerificationToken.create({
            data: { email, token, expiresAt },
        });

        return { message: 'If email exists, verification sent' };
    }
}
