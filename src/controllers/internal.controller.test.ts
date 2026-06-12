import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCourseMaterialKbService } = vi.hoisted(() => ({
    mockCourseMaterialKbService: {
        queuePoolMaterial: vi.fn(),
        linkCourseMaterial: vi.fn(),
        clearWeekOnUnassign: vi.fn(),
        softDeleteForCourseMaterial: vi.fn(),
    },
}));

vi.mock('../services/courseMaterialKb.service.js', () => ({
    CourseMaterialKbService: mockCourseMaterialKbService,
}));

import { InternalController } from './internal.controller.js';

function mockReq(body: Record<string, unknown> = {}): Request {
    return { body } as Request;
}

function mockRes(): Response {
    const res = {
        status: vi.fn(),
        json: vi.fn(),
    };
    res.status.mockReturnValue(res);
    res.json.mockReturnValue(res);
    return res as unknown as Response;
}

function mockNext(): NextFunction {
    return vi.fn() as unknown as NextFunction;
}

const validQueueBody = {
    course_id: '11111111-1111-1111-1111-111111111111',
    course_material_id: '22222222-2222-2222-2222-222222222222',
    file_path: '/tmp/sample.pdf',
    file_name: 'sample.pdf',
    mime_type: 'application/pdf',
    file_size: 1024,
    uploaded_by: '33333333-3333-3333-3333-333333333333',
};

describe('InternalController.queueCourseMaterial', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('parses body and calls CourseMaterialKbService.queuePoolMaterial', async () => {
        const kbRow = { id: 'kb-1', status: 'pending' };
        mockCourseMaterialKbService.queuePoolMaterial.mockResolvedValue(kbRow);
        const res = mockRes();
        const next = mockNext();

        await InternalController.queueCourseMaterial(mockReq(validQueueBody), res, next);

        expect(mockCourseMaterialKbService.queuePoolMaterial).toHaveBeenCalledWith({
            courseId: validQueueBody.course_id,
            courseMaterialId: validQueueBody.course_material_id,
            filePath: validQueueBody.file_path,
            fileName: validQueueBody.file_name,
            mimeType: validQueueBody.mime_type,
            fileSize: validQueueBody.file_size,
            uploadedBy: validQueueBody.uploaded_by,
        });
        expect(res.json).toHaveBeenCalledWith({ data: kbRow });
        expect(next).not.toHaveBeenCalled();
    });

    it('forwards Zod validation errors to next', async () => {
        const res = mockRes();
        const next = mockNext();

        await InternalController.queueCourseMaterial(
            mockReq({ course_id: 'not-a-uuid' }),
            res,
            next
        );

        expect(mockCourseMaterialKbService.queuePoolMaterial).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalled();
    });
});

describe('InternalController.deleteCourseMaterialKb', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('calls softDeleteForCourseMaterial', async () => {
        mockCourseMaterialKbService.softDeleteForCourseMaterial.mockResolvedValue(undefined);
        const res = mockRes();
        const next = mockNext();
        const body = {
            course_id: validQueueBody.course_id,
            course_material_id: validQueueBody.course_material_id,
        };

        await InternalController.deleteCourseMaterialKb(mockReq(body), res, next);

        expect(mockCourseMaterialKbService.softDeleteForCourseMaterial).toHaveBeenCalledWith(
            body.course_id,
            body.course_material_id
        );
        expect(res.json).toHaveBeenCalledWith({ data: { success: true } });
    });
});