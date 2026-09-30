import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
    listCoursesQuerySchema,
    bulkCourseSelectionSchema,
} from '../validators/course-admin.validator.js';
import {
    bulkDeleteUsersSchema,
    bulkRoleChangeSchema,
    listUsersQuerySchema,
} from '../validators/user.validator.js';
import { sendMessageSchema } from '../validators/socket.validator.js';
import { createGroupSchema, addMembersSchema } from '../validators/group.validator.js';
import { updateFallbackOrderSchema } from '../validators/ai-provider.validator.js';

describe('Boundary Validation Tests', () => {
    describe('Pagination Limits', () => {
        it('should reject page size > 100', () => {
            const result = listCoursesQuerySchema.safeParse({ limit: 101 });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toContain('100');
            }
        });

        it('should accept page size = 100', () => {
            const result = listCoursesQuerySchema.safeParse({ limit: 100 });
            expect(result.success).toBe(true);
        });

        it('should default to 20 when limit not provided', () => {
            const result = listCoursesQuerySchema.parse({});
            expect(result.limit).toBe(20);
        });

        it('should reject page size > 100 in user list', () => {
            const result = listUsersQuerySchema.safeParse({ limit: 150 });
            expect(result.success).toBe(false);
        });
    });

    describe('String Length Limits', () => {
        it('should reject message content > 10000 chars', () => {
            const longContent = 'a'.repeat(10001);
            const result = sendMessageSchema.safeParse({
                roomId: 'room1',
                content: longContent,
                courseId: 'course1',
                groupId: 'group1',
            });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toContain('too long');
            }
        });

        it('should accept message content = 10000 chars', () => {
            const maxContent = 'a'.repeat(10000);
            const result = sendMessageSchema.safeParse({
                roomId: 'room1',
                content: maxContent,
                courseId: 'course1',
                groupId: 'group1',
            });
            expect(result.success).toBe(true);
        });
    });

    describe('Array Size Limits', () => {
        it('should reject bulk course selection > 1000 items', () => {
            const tooManyCourses = Array(1001).fill('550e8400-e29b-41d4-a716-446655440000');
            const result = bulkCourseSelectionSchema.safeParse({
                courseIds: tooManyCourses,
            });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toContain('1000');
            }
        });

        it('should accept bulk course selection = 1000 items', () => {
            const maxCourses = Array(1000).fill('550e8400-e29b-41d4-a716-446655440000');
            const result = bulkCourseSelectionSchema.safeParse({
                courseIds: maxCourses,
            });
            expect(result.success).toBe(true);
        });

        it('should reject bulk user deletion > 1000 items', () => {
            const tooManyUsers = Array(1001).fill('550e8400-e29b-41d4-a716-446655440000');
            const result = bulkDeleteUsersSchema.safeParse({
                userIds: tooManyUsers,
            });
            expect(result.success).toBe(false);
        });

        it('should reject bulk role change > 1000 items', () => {
            const tooManyUsers = Array(1001).fill('550e8400-e29b-41d4-a716-446655440000');
            const result = bulkRoleChangeSchema.safeParse({
                userIds: tooManyUsers,
                role: 'student',
            });
            expect(result.success).toBe(false);
        });

        it('should reject group members > 1000 items', () => {
            const tooManyMembers = Array(1001).fill('550e8400-e29b-41d4-a716-446655440000');
            const result = createGroupSchema.safeParse({
                name: 'Test Group',
                member_ids: tooManyMembers,
            });
            expect(result.success).toBe(false);
        });

        it('should accept group members = 1000 items', () => {
            const maxMembers = Array(1000).fill('550e8400-e29b-41d4-a716-446655440000');
            const result = createGroupSchema.safeParse({
                name: 'Test Group',
                member_ids: maxMembers,
            });
            expect(result.success).toBe(true);
        });

        it('should reject add members > 1000 items', () => {
            const tooManyMembers = Array(1001).fill('550e8400-e29b-41d4-a716-446655440000');
            const result = addMembersSchema.safeParse({
                member_ids: tooManyMembers,
            });
            expect(result.success).toBe(false);
        });

        it('should reject message attachments > 10 items', () => {
            const tooManyAttachments = Array(11).fill({
                id: '1',
                name: 'file.pdf',
                type: 'application/pdf',
                size: 1000,
                url: 'https://example.com/file.pdf',
            });
            const result = sendMessageSchema.safeParse({
                roomId: 'room1',
                content: 'test',
                courseId: 'course1',
                groupId: 'group1',
                attachments: tooManyAttachments,
            });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toContain('10');
            }
        });

        it('should reject message mentions > 50 items', () => {
            const tooManyMentions = Array(51).fill('user123');
            const result = sendMessageSchema.safeParse({
                roomId: 'room1',
                content: 'test',
                courseId: 'course1',
                groupId: 'group1',
                mentions: tooManyMentions,
            });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toContain('50');
            }
        });

        it('should reject provider fallback order > 100 items', () => {
            const tooManyProviders = Array(101).fill('550e8400-e29b-41d4-a716-446655440000');
            const result = updateFallbackOrderSchema.safeParse({
                providerIds: tooManyProviders,
            });
            expect(result.success).toBe(false);
        });
    });
});
