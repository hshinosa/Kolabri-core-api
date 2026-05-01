import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGroupService } = vi.hoisted(() => ({
    mockGroupService: {
        createGroup: vi.fn(),
        joinGroupByCode: vi.fn(),
        inviteMembers: vi.fn(),
        addMembersToGroup: vi.fn(),
        getCourseGroups: vi.fn(),
        getGroupDetails: vi.fn(),
        getMyGroup: vi.fn(),
        deleteGroup: vi.fn(),
        createChatSpace: vi.fn(),
        getChatSpaces: vi.fn(),
        getChatSpaceById: vi.fn(),
    },
}));

vi.mock('../services/group.service.js', () => ({
    GroupService: mockGroupService,
}));

import { GroupController } from './group.controller.js';

function mockReq(overrides: Partial<Request> = {}) {
    return {
        body: {},
        params: {},
        query: {},
        user: {
            userId: 'user-1',
            role: 'lecturer',
            email: 'user@example.com',
        },
        ...overrides,
    } as Partial<Request>;
}

function mockRes(): Partial<Response> {
    const res: Partial<Response> & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } = {
        status: vi.fn(),
        json: vi.fn(),
    };
    res.status.mockReturnValue(res as Response);
    res.json.mockReturnValue(res as Response);
    return res;
}

function mockNext(): NextFunction {
    return vi.fn() as unknown as NextFunction;
}

describe('GroupController', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('creates a group from body.courseId and returns 201', async () => {
        const group = { id: 'group-1', name: 'Alpha' };
        mockGroupService.createGroup.mockResolvedValue(group);
        const req = mockReq({
            body: { courseId: 'course-1', name: 'Alpha', member_ids: ['student-1'] },
            user: { userId: 'lecturer-1', role: 'lecturer' } as Request['user'],
        });
        const res = mockRes();
        const next = mockNext();

        await GroupController.create(req as Request, res as Response, next);

        expect(mockGroupService.createGroup).toHaveBeenCalledWith(
            'course-1',
            { name: 'Alpha', member_ids: ['student-1'] },
            'lecturer-1',
            'lecturer'
        );
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({
            data: group,
            meta: { message: 'Group created successfully' },
        });
    });

    it('creates a nested course group using route params', async () => {
        const group = { id: 'group-1' };
        mockGroupService.createGroup.mockResolvedValue(group);
        const req = mockReq({
            params: { id: 'course-1' },
            body: { name: 'Beta' },
            user: { userId: 'student-1', role: 'student' } as Request['user'],
        });
        const res = mockRes();
        const next = mockNext();

        await GroupController.createInCourse(req as Request, res as Response, next);

        expect(mockGroupService.createGroup).toHaveBeenCalledWith('course-1', { name: 'Beta' }, 'student-1', 'student');
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({
            data: group,
            meta: { message: 'Group created successfully' },
        });
    });

    it('joins a group by code and returns success message', async () => {
        const group = { id: 'group-1' };
        mockGroupService.joinGroupByCode.mockResolvedValue(group);
        const req = mockReq({ body: { join_code: 'ABC12345' }, user: { userId: 'student-1', role: 'student' } as Request['user'] });
        const res = mockRes();
        const next = mockNext();

        await GroupController.joinByCode(req as Request, res as Response, next);

        expect(mockGroupService.joinGroupByCode).toHaveBeenCalledWith('ABC12345', 'student-1');
        expect(res.json).toHaveBeenCalledWith({
            data: group,
            meta: { message: 'Successfully joined group' },
        });
    });

    it('invites members to a group', async () => {
        const group = { id: 'group-1', members: [] };
        mockGroupService.inviteMembers.mockResolvedValue(group);
        const req = mockReq({
            params: { id: 'group-1' },
            body: { member_ids: ['student-2', 'student-3'] },
            user: { userId: 'student-1', role: 'student' } as Request['user'],
        });
        const res = mockRes();
        const next = mockNext();

        await GroupController.inviteMembers(req as Request, res as Response, next);

        expect(mockGroupService.inviteMembers).toHaveBeenCalledWith('group-1', ['student-2', 'student-3'], 'student-1', 'student');
        expect(res.json).toHaveBeenCalledWith({
            data: group,
            meta: { message: 'Members invited successfully' },
        });
    });

    it('adds members to a group in a course', async () => {
        const group = { id: 'group-1' };
        mockGroupService.addMembersToGroup.mockResolvedValue(group);
        const req = mockReq({
            params: { id: 'course-1', groupId: 'group-1' },
            body: { member_ids: ['student-2'] },
            user: { userId: 'lecturer-1', role: 'lecturer' } as Request['user'],
        });
        const res = mockRes();
        const next = mockNext();

        await GroupController.addMembers(req as Request, res as Response, next);

        expect(mockGroupService.addMembersToGroup).toHaveBeenCalledWith('course-1', 'group-1', ['student-2'], 'lecturer-1');
        expect(res.json).toHaveBeenCalledWith({
            data: group,
            meta: { message: 'Members added successfully' },
        });
    });

    it('returns course groups for nested course route', async () => {
        const groups = [{ id: 'group-1' }];
        mockGroupService.getCourseGroups.mockResolvedValue(groups);
        const req = mockReq({
            params: { id: 'course-1' },
            user: { userId: 'lecturer-1', role: 'lecturer' } as Request['user'],
        });
        const res = mockRes();
        const next = mockNext();

        await GroupController.getCourseGroups(req as Request, res as Response, next);

        expect(mockGroupService.getCourseGroups).toHaveBeenCalledWith('course-1', 'lecturer-1', 'lecturer');
        expect(res.json).toHaveBeenCalledWith({ data: groups });
    });

    it('returns course groups for the legacy index route', async () => {
        const groups = [{ id: 'group-1' }];
        mockGroupService.getCourseGroups.mockResolvedValue(groups);
        const req = mockReq({
            params: { courseId: 'course-1' },
            user: { userId: 'student-1', role: 'student' } as Request['user'],
        });
        const res = mockRes();
        const next = mockNext();

        await GroupController.index(req as Request, res as Response, next);

        expect(mockGroupService.getCourseGroups).toHaveBeenCalledWith('course-1', 'student-1', 'student');
        expect(res.json).toHaveBeenCalledWith({ data: groups });
    });

    it('returns a group detail view', async () => {
        const group = { id: 'group-1', name: 'Alpha' };
        mockGroupService.getGroupDetails.mockResolvedValue(group);
        const req = mockReq({
            params: { id: 'group-1' },
            user: { userId: 'student-1', role: 'student' } as Request['user'],
        });
        const res = mockRes();
        const next = mockNext();

        await GroupController.show(req as Request, res as Response, next);

        expect(mockGroupService.getGroupDetails).toHaveBeenCalledWith('group-1', 'student-1', 'student');
        expect(res.json).toHaveBeenCalledWith({ data: group });
    });

    it('returns the authenticated student group for a course', async () => {
        const group = { id: 'group-1' };
        mockGroupService.getMyGroup.mockResolvedValue(group);
        const req = mockReq({ params: { courseId: 'course-1' }, user: { userId: 'student-1', role: 'student' } as Request['user'] });
        const res = mockRes();
        const next = mockNext();

        await GroupController.getMyGroup(req as Request, res as Response, next);

        expect(mockGroupService.getMyGroup).toHaveBeenCalledWith('course-1', 'student-1');
        expect(res.json).toHaveBeenCalledWith({ data: group });
    });

    it('deletes a group and returns confirmation message', async () => {
        mockGroupService.deleteGroup.mockResolvedValue({ success: true });
        const req = mockReq({ params: { id: 'group-1' }, user: { userId: 'lecturer-1', role: 'lecturer' } as Request['user'] });
        const res = mockRes();
        const next = mockNext();

        await GroupController.delete(req as Request, res as Response, next);

        expect(mockGroupService.deleteGroup).toHaveBeenCalledWith('group-1', 'lecturer-1', 'lecturer');
        expect(res.json).toHaveBeenCalledWith({
            meta: { message: 'Group deleted successfully' },
        });
    });

    it('creates a chat space and returns 201', async () => {
        const chatSpace = { id: 'chat-1', name: 'General' };
        mockGroupService.createChatSpace.mockResolvedValue(chatSpace);
        const req = mockReq({
            params: { id: 'group-1' },
            body: { name: 'General', description: 'Main space' },
            user: { userId: 'lecturer-1', role: 'lecturer' } as Request['user'],
        });
        const res = mockRes();
        const next = mockNext();

        await GroupController.createChatSpace(req as Request, res as Response, next);

        expect(mockGroupService.createChatSpace).toHaveBeenCalledWith(
            'group-1',
            { name: 'General', description: 'Main space' },
            'lecturer-1',
            'lecturer'
        );
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({
            data: chatSpace,
            meta: { message: 'Chat space created successfully' },
        });
    });

    it('returns all chat spaces in a group', async () => {
        const chatSpaces = [{ id: 'chat-1' }];
        mockGroupService.getChatSpaces.mockResolvedValue(chatSpaces);
        const req = mockReq({
            params: { id: 'group-1' },
            user: { userId: 'student-1', role: 'student' } as Request['user'],
        });
        const res = mockRes();
        const next = mockNext();

        await GroupController.getChatSpaces(req as Request, res as Response, next);

        expect(mockGroupService.getChatSpaces).toHaveBeenCalledWith('group-1', 'student-1', 'student');
        expect(res.json).toHaveBeenCalledWith({ data: chatSpaces });
    });

    it('returns a chat space by id', async () => {
        const chatSpace = { id: 'chat-1', name: 'General' };
        mockGroupService.getChatSpaceById.mockResolvedValue(chatSpace);
        const req = mockReq({
            params: { chatSpaceId: 'chat-1' },
            user: { userId: 'student-1', role: 'student' } as Request['user'],
        });
        const res = mockRes();
        const next = mockNext();

        await GroupController.getChatSpaceById(req as Request, res as Response, next);

        expect(mockGroupService.getChatSpaceById).toHaveBeenCalledWith('chat-1', 'student-1', 'student');
        expect(res.json).toHaveBeenCalledWith({ data: chatSpace });
    });

    it('forwards service errors to next', async () => {
        const error = new Error('group failed');
        mockGroupService.joinGroupByCode.mockRejectedValue(error);
        const req = mockReq({ body: { join_code: 'ABC12345' } });
        const res = mockRes();
        const next = mockNext();

        await GroupController.joinByCode(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith(error);
    });
});
