import { Response, NextFunction } from 'express';
import { GroupService } from '../services/group.service.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

export class GroupController {
    /**
     * POST /api/groups
     * Create a group in a course (lecturer or student)
     */
    static async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const { courseId, ...data } = req.body;
            const group = await GroupService.createGroup(courseId, data, req.user!.userId, req.user!.role);

            res.status(201).json({
                data: group,
                meta: {
                    message: 'Group created successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/courses/:id/groups
     * Create a group in a course (lecturer or student) - nested route
     */
    static async createInCourse(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const courseId = req.params.id;
            const group = await GroupService.createGroup(courseId, req.body, req.user!.userId, req.user!.role);

            res.status(201).json({
                data: group,
                meta: {
                    message: 'Group created successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/groups/join
     * Join a group by join code
     */
    static async joinByCode(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const { join_code } = req.body;
            const group = await GroupService.joinGroupByCode(join_code, req.user!.userId);

            res.json({
                data: group,
                meta: {
                    message: 'Successfully joined group',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/groups/:id/invite
     * Invite members to a group
     */
    static async inviteMembers(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const groupId = req.params.id;
            const { member_ids } = req.body;
            const group = await GroupService.inviteMembers(groupId, member_ids, req.user!.userId, req.user!.role);

            res.json({
                data: group,
                meta: {
                    message: 'Members invited successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/courses/:id/groups/:groupId/members
     * Add members to a group (lecturer only)
     */
    static async addMembers(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const { id: courseId, groupId } = req.params;
            const memberIds = req.body.member_ids;

            const group = await GroupService.addMembersToGroup(courseId, groupId, memberIds, req.user!.userId);

            res.json({
                data: group,
                meta: {
                    message: 'Members added successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/courses/:id/groups
     * Get all groups in a course - nested route
     */
    static async getCourseGroups(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const groups = await GroupService.getCourseGroups(
                req.params.id,
                req.user!.userId,
                req.user!.role
            );

            res.json({
                data: groups,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/groups/course/:courseId
     * Get all groups in a course
     */
    static async index(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const groups = await GroupService.getCourseGroups(
                req.params.courseId,
                req.user!.userId,
                req.user!.role
            );

            res.json({
                data: groups,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/groups/:id
     * Get group details
     */
    static async show(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const group = await GroupService.getGroupDetails(
                req.params.id,
                req.user!.userId,
                req.user!.role
            );

            res.json({
                data: group,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/groups/my/:courseId
     * Get my group in a course (student)
     */
    static async getMyGroup(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const group = await GroupService.getMyGroup(req.params.courseId, req.user!.userId);

            res.json({
                data: group,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * DELETE /api/groups/:id
     * Delete a group (lecturer only)
     */
    static async delete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            await GroupService.deleteGroup(req.params.id, req.user!.userId, req.user!.role);

            res.json({
                meta: {
                    message: 'Group deleted successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/groups/:id/leave
     * Student leaves a group (not the owner).
     */
    static async leave(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            await GroupService.leaveGroup(req.params.id, req.user!.userId);

            res.json({
                meta: {
                    message: 'Left group successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * DELETE /api/groups/:id/members/:memberId
     * Lecturer removes a member from a group.
     */
    static async removeMember(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            await GroupService.removeMember(
                req.params.id,
                req.params.memberId,
                req.user!.userId,
                req.user!.role
            );

            res.json({
                meta: {
                    message: 'Member removed successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/groups/:id/session-discussions
     * Create a new session discussion in a group
     */
    static async createSessionDiscussion(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const groupId = req.params.id;
            const sessionDiscussion = await GroupService.createSessionDiscussion(
                groupId,
                req.body,
                req.user!.userId,
                req.user!.role
            );

            res.status(201).json({
                data: sessionDiscussion,
                meta: {
                    message: 'Session discussion created successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/groups/:id/session-discussions
     * Get all session discussions in a group
     */
    static async getSessionDiscussions(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const groupId = req.params.id;
            const sessionDiscussions = await GroupService.getSessionDiscussions(
                groupId,
                req.user!.userId,
                req.user!.role,
                req.query as any
            );

            res.json(sessionDiscussions);
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/groups/session-discussions/:sessionDiscussionId
     * Get a specific session discussion by ID
     */
    static async getSessionDiscussionById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const sessionDiscussionId = req.params.sessionDiscussionId;
            const sessionDiscussion = await GroupService.getSessionDiscussionById(
                sessionDiscussionId,
                req.user!.userId,
                req.user!.role
            );

            res.json({
                data: sessionDiscussion,
            });
        } catch (error) {
            next(error);
        }
    }

    static async updateSessionDiscussionWeek(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const { week_id: weekId } = req.body as { week_id: string };
            const result = await GroupService.updateSessionDiscussionWeek(
                req.params.sessionDiscussionId,
                weekId,
                req.user!.userId,
                req.user!.role
            );
            res.json({ data: result });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/groups/session-discussions/:sessionDiscussionId/pre-read/complete
     */
    static async completePreRead(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const result = await GroupService.completePreRead(
                req.params.sessionDiscussionId,
                req.user!.userId,
                req.user!.role
            );

            res.json({
                data: result,
                meta: { message: 'Pre-read marked complete' },
            });
        } catch (error) {
            next(error);
        }
    }
}
