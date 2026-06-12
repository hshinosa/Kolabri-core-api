import prisma from '../config/database.js';
import { ChatLog } from '../models/ChatLog.js';
import { DiscussionDirectionService } from './discussion-direction.service.js';
import { ApiError } from '../middleware/errorHandler.js';

export class DiscussionHealthService {
  static async listForLecturer(lecturerId: string, role: string) {
    const courseWhere =
      role === 'admin'
        ? { deletedAt: null, isArchived: false }
        : { ownerId: lecturerId, deletedAt: null, isArchived: false };

    const courses = await prisma.course.findMany({
      where: courseWhere,
      select: {
        id: true,
        name: true,
        groups: {
          where: { deletedAt: null },
          select: {
            id: true,
            name: true,
            chatSpaces: {
              where: { deletedAt: null, closedAt: null },
              select: {
                id: true,
                name: true,
                goals: {
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                  select: { content: true },
                },
              },
            },
          },
        },
      },
    });

    const chatSpaces: Array<{
      id: string;
      name: string;
      courseId: string;
      courseName: string;
      groupId: string;
      groupName: string;
      activeMembers: number;
      totalMessages: number;
      relevantMessages: number;
      hasGoal: boolean;
      healthScore: number;
    }> = [];

    for (const course of courses) {
      for (const group of course.groups) {
        for (const space of group.chatSpaces) {
          const logs = await ChatLog.find({
            chatSpaceId: space.id,
            deletedAt: null,
            senderType: { $in: ['student', 'lecturer'] },
          })
            .select({ senderId: 1, isRelevant: 1 })
            .lean();

          const totalMessages = logs.length;
          const relevantMessages = logs.filter((l) => l.isRelevant === true).length;
          const activeMembers = new Set(logs.map((l) => l.senderId).filter(Boolean)).size;
          const hasGoal = (space.goals?.[0]?.content?.trim().length ?? 0) > 0;

          let healthScore = 0;
          if (hasGoal && totalMessages > 0) {
            const relevanceRatio = relevantMessages / totalMessages;
            const contributions: Record<string, number> = {};
            for (const log of logs) {
              const sid = log.senderId || 'unknown';
              contributions[sid] = (contributions[sid] || 0) + 1;
            }
            const participationBalance = DiscussionDirectionService.shannonEntropy(contributions);
            const goalProgress = Math.min(totalMessages / 20, 1);
            healthScore = DiscussionDirectionService.computeHealthScore(
              relevanceRatio,
              participationBalance,
              goalProgress
            );
          }

          chatSpaces.push({
            id: space.id,
            name: space.name,
            courseId: course.id,
            courseName: course.name,
            groupId: group.id,
            groupName: group.name,
            activeMembers,
            totalMessages,
            relevantMessages,
            hasGoal,
            healthScore,
          });
        }
      }
    }

    chatSpaces.sort((a, b) => b.healthScore - a.healthScore);
    return { chatSpaces };
  }

  static async assertLecturerAccess(lecturerId: string, role: string) {
    if (role !== 'lecturer' && role !== 'admin') {
      throw ApiError.forbidden('Lecturer access required');
    }
    if (role === 'admin') {
      return;
    }
    const user = await prisma.user.findFirst({
      where: { id: lecturerId, role: 'lecturer', deletedAt: null },
      select: { id: true },
    });
    if (!user) {
      throw ApiError.forbidden('Lecturer access required');
    }
  }
}