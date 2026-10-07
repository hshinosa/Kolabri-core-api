import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { ApiError } from "../middleware/errorHandler.js";
import { setRevokedBefore } from "../utils/tokenRevocation.js";

const prisma = new PrismaClient();

export class PasswordResetService {
  /**
   * Request password reset - generate token and send email
   */
  static async requestReset(email: string): Promise<{ message: string }> {
    const user = await prisma.user.findUnique({ where: { email } });

    // Always return success to prevent email enumeration
    if (!user) {
      return { message: "If email exists, reset link sent" };
    }

    await prisma.passwordResetToken.deleteMany({ where: { email } });

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.passwordResetToken.create({
      data: { email, token, expiresAt },
    });

    // TODO: Send email with reset link
    // await EmailService.sendPasswordReset(email, token);

    return { message: "If email exists, reset link sent" };
  }

  /**
   * Verify reset token validity
   */
  static async verifyToken(
    token: string,
  ): Promise<{ valid: boolean; email?: string }> {
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
    });

    if (!resetToken || resetToken.expiresAt < new Date()) {
      return { valid: false };
    }

    return { valid: true, email: resetToken.email };
  }

  /**
   * Reset password using token
   */
  static async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
    });

    if (!resetToken || resetToken.expiresAt < new Date()) {
      throw ApiError.badRequest("Invalid or expired token");
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const updatedUser = await prisma.user.update({
      where: { email: resetToken.email },
      data: { password: hashedPassword },
      select: { id: true },
    });

    await prisma.passwordResetToken.delete({ where: { token } });

    // H5 (F5): ganti password = akhiri SEMUA sesi lama — watermark
    // revoked_before (TTL 7 hari) membuat access & refresh JWT yang terbit
    // sebelum detik ini 401 di verifyToken / refresh.
    await setRevokedBefore(updatedUser.id);

    return { message: "Password reset successful" };
  }
}
