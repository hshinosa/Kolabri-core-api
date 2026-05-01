import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../config/database.js';
import { ApiError } from '../middleware/errorHandler.js';
import { RegisterInput, LoginInput } from '../validators/auth.validator.js';
import { JwtPayload } from '../middleware/auth.js';

const SALT_ROUNDS = 10;

// In-memory token blacklist (for revoked tokens)
const tokenBlacklist = new Set<string>();

export interface RefreshTokenPayload {
    userId: string;
    email: string;
    role: 'student' | 'lecturer' | 'admin';
    type: 'refresh';
}

export class AuthService {
    /**
     * Register a new user
     */
    static async register(data: RegisterInput) {
        // Check if email already exists
        const existingUser = await prisma.user.findUnique({
            where: { email: data.email },
        });

        if (existingUser) {
            throw ApiError.conflict('Email already registered');
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);

        // Create user
        const user = await prisma.user.create({
            data: {
                name: data.name,
                email: data.email,
                password: hashedPassword,
                role: data.role,
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                createdAt: true,
            },
        });

        // Generate access and refresh tokens for auto-login after registration
        const accessToken = this.generateAccessToken({
            userId: user.id,
            email: user.email,
            role: user.role,
        });

        const refreshToken = this.generateRefreshToken({
            userId: user.id,
            email: user.email,
            role: user.role,
        });

        return {
            accessToken,
            refreshToken,
            user,
        };
    }

    /**
     * Login user and return JWT token
     */
    static async login(data: LoginInput) {
        // Find user by email
        const user = await prisma.user.findUnique({
            where: { email: data.email },
        });

        if (!user) {
            throw ApiError.unauthorized('Invalid email or password');
        }

        if (!user.isActive) {
            throw ApiError.forbidden('Account is deactivated');
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(data.password, user.password);

        if (!isValidPassword) {
            throw ApiError.unauthorized('Invalid email or password');
        }

        // Generate access and refresh tokens
        const accessToken = this.generateAccessToken({
            userId: user.id,
            email: user.email,
            role: user.role,
        });

        const refreshToken = this.generateRefreshToken({
            userId: user.id,
            email: user.email,
            role: user.role,
        });

        return {
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        };
    }

    /**
     * Get current user profile
     */
    static async getProfile(userId: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                avatarUrl: true,
                createdAt: true,
            },
        });

        if (!user) {
            throw ApiError.notFound('User not found');
        }

        return user;
    }

    /**
     * Generate access token (short-lived: 15 minutes)
     */
    private static generateAccessToken(payload: JwtPayload): string {
        const secret = process.env.JWT_SECRET;

        if (!secret) {
            throw ApiError.internal('JWT secret not configured');
        }

        return jwt.sign(payload, secret, { expiresIn: '15m' } as jwt.SignOptions);
    }

    /**
     * Generate refresh token (long-lived: 7 days)
     */
    private static generateRefreshToken(payload: Omit<JwtPayload, 'type'>): string {
        const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;

        if (!secret) {
            throw ApiError.internal('JWT secret not configured');
        }

        const refreshPayload: RefreshTokenPayload = {
            ...payload,
            type: 'refresh',
        };

        return jwt.sign(refreshPayload, secret, { expiresIn: '7d' } as jwt.SignOptions);
    }

    /**
     * Refresh access token using refresh token
     */
    static async refreshAccessToken(refreshToken: string) {
        const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;

        if (!secret) {
            throw ApiError.internal('JWT secret not configured');
        }

        // Check if token is blacklisted
        if (tokenBlacklist.has(refreshToken)) {
            throw ApiError.unauthorized('Token has been revoked');
        }

        try {
            const decoded = jwt.verify(refreshToken, secret) as RefreshTokenPayload;

            // Verify it's a refresh token
            if (decoded.type !== 'refresh') {
                throw ApiError.unauthorized('Invalid token type');
            }

            // Verify user still exists and is active
            const user = await prisma.user.findUnique({
                where: { id: decoded.userId },
            });

            if (!user || !user.isActive) {
                throw ApiError.unauthorized('User not found or inactive');
            }

            // Generate new access token
            const newAccessToken = this.generateAccessToken({
                userId: decoded.userId,
                email: decoded.email,
                role: decoded.role,
            });

            return {
                accessToken: newAccessToken,
            };
        } catch (error) {
            if (error instanceof jwt.JsonWebTokenError) {
                throw ApiError.unauthorized('Invalid refresh token');
            } else if (error instanceof jwt.TokenExpiredError) {
                throw ApiError.unauthorized('Refresh token expired');
            }
            throw error;
        }
    }

    /**
     * Logout and revoke refresh token
     */
    static async logout(refreshToken: string) {
        // Add token to blacklist
        tokenBlacklist.add(refreshToken);

        return {
            message: 'Logged out successfully',
        };
    }

    /**
     * Check if token is blacklisted
     */
    static isTokenBlacklisted(token: string): boolean {
        return tokenBlacklist.has(token);
    }
}
