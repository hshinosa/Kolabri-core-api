import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { CourseMaterialKbService } from '../services/courseMaterialKb.service.js';
import { GroupService } from '../services/group.service.js';

const linkSchema = z.object({
    course_id: z.string().uuid(),
    course_material_id: z.string().uuid(),
    week_id: z.string().uuid(),
    week_index: z.number().int().min(1),
    file_path: z.string().min(1),
    file_name: z.string().min(1),
    mime_type: z.string().min(1),
    file_size: z.number().int().min(0),
    uploaded_by: z.string().uuid(),
});

const queueSchema = z.object({
    course_id: z.string().uuid(),
    course_material_id: z.string().uuid(),
    file_path: z.string().min(1),
    file_name: z.string().min(1),
    mime_type: z.string().min(1),
    file_size: z.number().int().min(0),
    uploaded_by: z.string().min(1),
    extract_images: z.boolean().optional(),
    perform_ocr: z.boolean().optional(),
});

const unassignSchema = z.object({
    course_id: z.string().uuid(),
    course_material_id: z.string().uuid(),
});

const deleteMaterialSchema = z.object({
    course_id: z.string().uuid(),
    course_material_id: z.string().uuid(),
});

export class InternalController {
    static async linkCourseMaterial(req: Request, res: Response, next: NextFunction) {
        try {
            const body = linkSchema.parse(req.body);
            const result = await CourseMaterialKbService.linkCourseMaterial({
                courseId: body.course_id,
                courseMaterialId: body.course_material_id,
                weekId: body.week_id,
                weekIndex: body.week_index,
                filePath: body.file_path,
                fileName: body.file_name,
                mimeType: body.mime_type,
                fileSize: body.file_size,
                uploadedBy: body.uploaded_by,
            });
            res.json({ data: result });
        } catch (error) {
            next(error);
        }
    }

    static async queueCourseMaterial(req: Request, res: Response, next: NextFunction) {
        try {
            const body = queueSchema.parse(req.body);
            const result = await CourseMaterialKbService.queuePoolMaterial({
                courseId: body.course_id,
                courseMaterialId: body.course_material_id,
                filePath: body.file_path,
                fileName: body.file_name,
                mimeType: body.mime_type,
                fileSize: body.file_size,
                uploadedBy: body.uploaded_by,
                extractImages: body.extract_images,
                performOcr: body.perform_ocr,
            });
            res.json({ data: result });
        } catch (error) {
            next(error);
        }
    }

    static async unassignCourseMaterial(req: Request, res: Response, next: NextFunction) {
        try {
            const body = unassignSchema.parse(req.body);
            await CourseMaterialKbService.clearWeekOnUnassign(body.course_id, body.course_material_id);
            res.json({ data: { success: true } });
        } catch (error) {
            next(error);
        }
    }

    static async deleteCourseMaterialKb(req: Request, res: Response, next: NextFunction) {
        try {
            const body = deleteMaterialSchema.parse(req.body);
            await CourseMaterialKbService.softDeleteForCourseMaterial(body.course_id, body.course_material_id);
            res.json({ data: { success: true } });
        } catch (error) {
            next(error);
        }
    }

    static async backfillChatSpaceWeeks(req: Request, res: Response, next: NextFunction) {
        try {
            const courseId = typeof req.query.course_id === 'string' ? req.query.course_id : undefined;
            const result = await GroupService.backfillChatSpaceWeekIds(courseId);
            res.json({ data: result });
        } catch (error) {
            next(error);
        }
    }
}