import { Router } from 'express';
import { GroupController } from '../controllers/group.controller.js';
import { verifyToken, requireStudent } from '../middleware/auth.js';
import { validateBody } from '../validators/validate.js';
import { z } from 'zod';

const router = Router();

// Schema for create group with courseId
const createGroupWithCourseSchema = z.object({
    courseId: z.string().uuid('Invalid course ID'),
    name: z.string().min(2).max(100).trim(),
    memberIds: z.array(z.string().uuid()).optional(),
});

// Schema for join by code
const joinGroupSchema = z.object({
    join_code: z.string().length(8, 'Join code must be 8 characters'),
});

// Schema for invite members
const inviteMembersSchema = z.object({
    member_ids: z.array(z.string().uuid()).min(1, 'At least one member required'),
});

// Schema for chat space
const createChatSpaceSchema = z.object({
    name: z.string().min(1).max(50).trim(),
    description: z.string().max(200).nullish(),
    week_id: z.string().uuid('Invalid week ID').optional(),
});

const updateChatSpaceWeekSchema = z.object({
    week_id: z.string().uuid('Invalid week ID'),
});

// All routes require authentication
router.use(verifyToken);

// Group CRUD
router.post('/', validateBody(createGroupWithCourseSchema), GroupController.create);
router.post('/join', requireStudent, validateBody(joinGroupSchema), GroupController.joinByCode);
router.get('/course/:courseId', GroupController.index);
router.get('/my/:courseId', GroupController.getMyGroup);
router.get('/:id', GroupController.show);
router.delete('/:id', GroupController.delete);
router.post('/:id/leave', requireStudent, GroupController.leave);
router.delete('/:id/members/:memberId', GroupController.removeMember);

// Group member management
router.post('/:id/invite', validateBody(inviteMembersSchema), GroupController.inviteMembers);

// Chat spaces
router.get('/chat-spaces/:chatSpaceId', GroupController.getChatSpaceById);
router.patch(
    '/chat-spaces/:chatSpaceId/week',
    validateBody(updateChatSpaceWeekSchema),
    GroupController.updateChatSpaceWeek
);
router.post(
    '/chat-spaces/:chatSpaceId/pre-read/complete',
    requireStudent,
    GroupController.completePreRead
);
router.get('/:id/chat-spaces', GroupController.getChatSpaces);
router.post('/:id/chat-spaces', validateBody(createChatSpaceSchema), GroupController.createChatSpace);

export default router;
