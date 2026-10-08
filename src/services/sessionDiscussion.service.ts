import { randomUUID } from "node:crypto";

import prisma from "../config/database.js";
import { ApiError } from "../middleware/errorHandler.js";
import { getSocketEmitter } from "../utils/socketEmitter.js";
import { logger } from "../utils/logger.js";
import { ChatLog } from "../models/ChatLog.js";
import { aiEngineService } from "./aiEngine.service.js";
import { DiscussionDirectionService } from "./discussion-direction.service.js";
import {
  AttendanceService,
  type AttendanceResult,
} from "./attendance.service.js";

// Type for SessionDiscussion with session fields
interface SessionDiscussionWithSession {
  id: string;
  name: string;
  closedAt: Date | null;
  closedBy: string | null;
  weekId: string | null;
  group: {
    course: { id: string; ownerId: string };
    members: { userId: string }[];
  };
}

export class SessionDiscussionService {
  /**
   * Close a session discussion session (lecturer/admin owner or group member)
   */
  static async closeSession(
    sessionDiscussionId: string,
    userId: string,
    userRole: "student" | "lecturer" | "admin",
  ) {
    const sessionDiscussion = (await prisma.sessionDiscussion.findFirst({
      where: { id: sessionDiscussionId, deletedAt: null },
      include: {
        group: {
          include: {
            course: true,
            members: {
              select: { userId: true },
            },
          },
        },
      },
    })) as SessionDiscussionWithSession | null;

    if (!sessionDiscussion) {
      throw ApiError.notFound("Session discussion not found");
    }

    // M10: permission check MUST run before the closedAt check — a
    // non-member must get 403, not a 400 that reveals the session status.
    if (userRole === "lecturer") {
      if (sessionDiscussion.group.course.ownerId !== userId) {
        throw ApiError.forbidden("You do not own this course");
      }
    } else if (userRole === "student") {
      const isMember = (sessionDiscussion.group.members ?? []).some(
        (member) => member.userId === userId,
      );
      if (!isMember) {
        throw ApiError.forbidden("You are not a member of this group");
      }
    }

    if (sessionDiscussion.closedAt) {
      throw ApiError.badRequest("This session is already closed");
    }

    // M5: claim the close atomically — the check above is only advisory.
    // updateMany guarded on closedAt: null guarantees a single winner for
    // concurrent close requests (summary + attendance run for that winner only).
    const closedAt = new Date();
    const claimed = await prisma.sessionDiscussion.updateMany({
      where: { id: sessionDiscussionId, closedAt: null },
      data: {
        closedAt,
        closedBy: userId,
      },
    });

    if (claimed.count === 0) {
      throw ApiError.badRequest("This session is already closed");
    }

    const updatedSessionDiscussion = {
      id: sessionDiscussion.id,
      name: sessionDiscussion.name,
      closedAt,
      closedBy: userId,
    };

    const roleLabels: Record<"student" | "lecturer" | "admin", string> = {
      student: "mahasiswa",
      lecturer: "dosen",
      admin: "admin",
    };
    const actorLabel = roleLabels[userRole] ?? "pengguna";
    const closeMessage = `Sesi diskusi ini telah ditutup oleh ${actorLabel}.`;

    try {
      getSocketEmitter()?.emit(sessionDiscussionId, "session_closed", {
        sessionDiscussionId,
        closedAt: updatedSessionDiscussion.closedAt?.toISOString(),
        message: closeMessage,
      });
    } catch (error) {
      logger.warn("Failed to broadcast session closure", { error });
    }

    let summary: string | null = null;
    let summaryGeneratedAt: Date | null = null;
    let summaryError: string | null = null;
    // Dipakai bersama oleh ringkasan teks dan penilaian tujuan (di bawah).
    let recentMessages: Array<{
      content: string;
      senderName: string;
      senderId: string;
      senderType: string;
      createdAt: Date;
    }> = [];
    try {
      recentMessages = await ChatLog.find({
        sessionDiscussionId,
        deletedAt: null,
        senderType: { $in: ["student", "lecturer", "ai"] },
      })
        .sort({ createdAt: -1 })
        .limit(30)
        .lean();

      if (recentMessages.length > 0) {
        const summaryResult = await aiEngineService.generateSummary(
          recentMessages.reverse().map((m) => ({
            sender: m.senderType === "ai" ? "AI" : m.senderName,
            content: m.content,
            timestamp: new Date(m.createdAt).toISOString(),
          })),
          sessionDiscussionId,
          undefined,
        );
        if (summaryResult.success && summaryResult.summary) {
          summary = summaryResult.summary;
          summaryGeneratedAt = new Date();
          await prisma.sessionDiscussion.update({
            where: { id: sessionDiscussionId },
            data: { summary, summaryGeneratedAt },
          });
        } else {
          summaryError =
            summaryResult.error || "AI Engine failed to generate summary";
          logger.warn(
            "Summary generation returned no summary during session close",
            {
              sessionDiscussionId,
              error: summaryError,
            },
          );
        }
      }
    } catch (error) {
      logger.warn("Summary generation failed during session close", {
        sessionDiscussionId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      summaryError =
        error instanceof Error ? error.message : "Failed to generate summary";
    }

    // Penilaian capaian tujuan — dihasilkan sekali di sini (server-side),
    // bukan oleh client: endpoint direction/summary dosen-only (P2-04) agar
    // kuota AI tak bisa dibakar sembarang client, sementara modal ringkasan
    // mahasiswa tetap mendapat penilaian.
    try {
      const goal = await prisma.learningGoal.findFirst({
        where: { sessionDiscussionId },
        orderBy: { createdAt: "desc" },
        select: { content: true },
      });
      if (goal && recentMessages.length > 0) {
        const goalAssessment = await DiscussionDirectionService.generateSessionSummary(
          recentMessages.map((m) => ({
            content: m.content,
            senderName: m.senderName || m.senderType,
          })),
          goal.content,
          {
            totalMessages: recentMessages.length,
            participantCount: new Set(
              recentMessages.map((m) => m.senderId).filter(Boolean),
            ).size,
          },
        );
        await prisma.sessionDiscussion.update({
          where: { id: sessionDiscussionId },
          data: { goalAssessment: goalAssessment as never },
        });
      }
    } catch (error) {
      logger.warn("Goal assessment generation failed during session close", {
        sessionDiscussionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    let attendanceData: AttendanceResult | null = null;
    try {
      attendanceData =
        await AttendanceService.computeAttendance(sessionDiscussionId);
      if (attendanceData) {
        attendanceData.weekId = sessionDiscussion.weekId;
        // Persist attendance to PostgreSQL (shared with client-app)
        await this.saveAttendanceToDb(
          sessionDiscussionId,
          sessionDiscussion,
          attendanceData,
        );
      }
    } catch (error) {
      logger.warn(
        "Auto-attendance computation/persistence failed during session close",
        {
          sessionDiscussionId,
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }

    return {
      id: updatedSessionDiscussion.id,
      name: updatedSessionDiscussion.name,
      closedAt: updatedSessionDiscussion.closedAt,
      closedBy: updatedSessionDiscussion.closedBy,
      summary,
      summaryGeneratedAt,
      summaryError,
      attendanceData,
    };
  }

  /**
   * Save attendance data to PostgreSQL (attendance_sessions + attendance_records).
   * Called automatically when a session is closed.
   */
  static async saveAttendanceToDb(
    sessionDiscussionId: string,
    sessionDiscussion: SessionDiscussionWithSession,
    attendanceData: AttendanceResult,
  ): Promise<void> {
    // Check if attendance session already exists for this sessionDiscussionId
    const existing = await prisma.attendanceSession.findUnique({
      where: { sessionDiscussionId },
    });
    if (existing) return; // Already saved

    const courseId = sessionDiscussion.group.course.id;
    const sessionId = randomUUID();
    const students = attendanceData.students;
    const presentCount = students.filter((s) => s.status === "present").length;
    const absentCount = students.filter((s) => s.status === "absent").length;

    try {
      await prisma.attendanceSession.create({
      data: {
        id: sessionId,
        courseId,
        sessionDiscussionId,
        weekId: attendanceData.weekId,
        groupId: attendanceData.groupId,
        title: `Auto Attendance - ${sessionDiscussion.name}`,
        sessionDate: new Date(),
        autoGenerated: true,
        attendanceMethod: "auto",
        notes: "Auto-generated from discussion participation",
        totalStudents: students.length,
        presentCount,
        absentCount,
        markedCount: students.length,
        attendanceRate:
          students.length > 0
            ? Math.round((presentCount / students.length) * 100 * 100) / 100
            : 0,
        records: {
          create: students.map((s) => ({
            id: randomUUID(),
            studentId: s.studentId,
            studentName: s.studentName,
            status: s.status,
            notes: `${s.messageCount} pesan, ${s.hotCount} HOT`,
            markedAt: new Date(),
          })),
        },
      },
    });
    } catch (error) {
      // TOCTOU defence: baris attendance sudah dibuat pihak lain (race) —
      // unique constraint sessionDiscussionId menang, jangan gagalkan close.
      if ((error as { code?: string })?.code === "P2002") {
        return;
      }
      throw error;
    }
  }

  /**
   * Reopen a session discussion session (lecturer only)
   */
  static async reopenSession(
    sessionDiscussionId: string,
    userId: string,
    userRole: string,
  ) {
    if (userRole !== "lecturer") {
      throw ApiError.forbidden("Only lecturers can reopen chat sessions");
    }

    const sessionDiscussion = (await prisma.sessionDiscussion.findFirst({
      where: { id: sessionDiscussionId, deletedAt: null },
      include: {
        group: {
          include: {
            course: true,
          },
        },
      },
    })) as SessionDiscussionWithSession | null;

    if (!sessionDiscussion) {
      throw ApiError.notFound("Session discussion not found");
    }

    if (sessionDiscussion.group.course.ownerId !== userId) {
      throw ApiError.forbidden("You do not own this course");
    }

    if (!sessionDiscussion.closedAt) {
      throw ApiError.badRequest("This session is not closed");
    }

    const updatedSessionDiscussion = (await prisma.sessionDiscussion.update({
      where: { id: sessionDiscussionId },
      data: {
        closedAt: null,
        closedBy: null,
      } as Record<string, unknown>,
    })) as unknown as {
      id: string;
      name: string;
      closedAt: Date | null;
      closedBy: string | null;
    };

    try {
      getSocketEmitter()?.emit(sessionDiscussionId, "session_reopened", {
        sessionDiscussionId,
      });
    } catch (error) {
      logger.warn("Failed to broadcast session reopen", { error });
    }

    return {
      id: updatedSessionDiscussion.id,
      name: updatedSessionDiscussion.name,
      closedAt: updatedSessionDiscussion.closedAt,
      closedBy: updatedSessionDiscussion.closedBy,
    };
  }

  /**
   * Check if user has submitted reflection for a closed session
   */
  static async hasSubmittedReflection(
    sessionDiscussionId: string,
    userId: string,
  ): Promise<boolean> {
    const reflection = await prisma.reflection.findFirst({
      where: {
        sessionDiscussionId,
        userId,
      } as Record<string, unknown>,
    });

    return !!reflection;
  }

  /**
   * Get session discussion status including reflection requirement
   */
  static async getSessionDiscussionStatus(
    sessionDiscussionId: string,
    userId: string,
    userRole: string,
  ) {
    const sessionDiscussion = (await prisma.sessionDiscussion.findFirst({
      where: { id: sessionDiscussionId, deletedAt: null },
      include: {
        group: {
          include: {
            course: true,
            members: true,
          },
        },
        goals: {
          where: { userId },
          take: 1,
        },
        reflections: {
          where: { userId },
          take: 1,
        },
      } as Record<string, unknown>,
    })) as unknown as
      | (SessionDiscussionWithSession & {
          goals: unknown[];
          reflections: unknown[];
        })
      | null;

    if (!sessionDiscussion) {
      throw ApiError.notFound("Session discussion not found");
    }

    // Check permission
    if (userRole === "lecturer") {
      if (sessionDiscussion.group.course.ownerId !== userId) {
        throw ApiError.forbidden("You do not own this course");
      }
    } else {
      const isMember = sessionDiscussion.group.members.some(
        (m: { userId: string }) => m.userId === userId,
      );
      if (!isMember) {
        throw ApiError.forbidden("You are not a member of this group");
      }
    }

    const isClosed = !!sessionDiscussion.closedAt;
    const hasReflection = sessionDiscussion.reflections.length > 0;
    const needsReflection =
      isClosed && !hasReflection && userRole === "student";

    return {
      id: sessionDiscussion.id,
      name: sessionDiscussion.name,
      isClosed,
      closedAt: sessionDiscussion.closedAt,
      hasReflection,
      needsReflection,
      hasGoal: sessionDiscussion.goals.length > 0,
    };
  }

  /**
   * Submit session reflection
   */
  static async submitSessionReflection(
    sessionDiscussionId: string,
    content: string,
    userId: string,
  ) {
    const sessionDiscussion = (await prisma.sessionDiscussion.findFirst({
      where: { id: sessionDiscussionId, deletedAt: null },
      include: {
        group: {
          include: {
            course: true,
            members: true,
          },
        },
        goals: {
          where: { userId: userId },
          take: 1,
        },
      },
    })) as (SessionDiscussionWithSession & { goals: { id: string }[] }) | null;

    if (!sessionDiscussion) {
      throw ApiError.notFound("Session discussion not found");
    }

    // Verify user is member
    const isMember = sessionDiscussion.group.members.some(
      (m: { userId: string }) => m.userId === userId,
    );
    if (!isMember) {
      throw ApiError.forbidden("You are not a member of this group");
    }

    // Check if session is closed
    if (!sessionDiscussion.closedAt) {
      throw ApiError.badRequest(
        "Session must be closed before submitting reflection",
      );
    }

    // Check if already submitted
    const existingReflection = await prisma.reflection.findFirst({
      where: {
        sessionDiscussionId,
        userId,
      } as Record<string, unknown>,
    });

    if (existingReflection) {
      throw ApiError.badRequest(
        "You have already submitted a reflection for this session",
      );
    }

    // Get user's goal for this session discussion if exists
    const goalId =
      sessionDiscussion.goals.length > 0
        ? sessionDiscussion.goals[0].id
        : undefined;

    const reflection = (await prisma.reflection.create({
      data: {
        content,
        type: "session",
        userId,
        sessionDiscussionId,
        goalId,
      },
      include: {
        user: {
          select: { id: true, name: true },
        },
        sessionDiscussion: {
          select: {
            id: true,
            name: true,
          },
        },
        goal: {
          select: { id: true, content: true },
        },
      },
    })) as {
      id: string;
      content: string;
      type: string;
      sessionDiscussion: { id: string; name: string } | null;
      goal: { id: string; content: string } | null;
      user: { id: string; name: string };
      createdAt: Date;
    };

    return {
      id: reflection.id,
      content: reflection.content,
      type: reflection.type,
      sessionDiscussion: reflection.sessionDiscussion,
      goal: reflection.goal,
      createdBy: reflection.user,
      createdAt: reflection.createdAt,
    };
  }

  static async getSummary(
    sessionDiscussionId: string,
    userId: string,
    userRole: string,
  ) {
    const sessionDiscussion = await prisma.sessionDiscussion.findFirst({
      where: { id: sessionDiscussionId, deletedAt: null },
      select: {
        id: true,
        summary: true,
        summaryGeneratedAt: true,
        goalAssessment: true,
        group: {
          select: {
            course: { select: { ownerId: true } },
            members: { select: { userId: true } },
          },
        },
      },
    });

    if (!sessionDiscussion) {
      throw ApiError.notFound("Session discussion not found");
    }

    if (userRole === "student") {
      const isMember = sessionDiscussion.group.members.some(
        (m) => m.userId === userId,
      );
      if (!isMember) {
        throw ApiError.forbidden("You are not a member of this group");
      }
    } else if (userRole === "lecturer") {
      if (sessionDiscussion.group.course.ownerId !== userId) {
        throw ApiError.forbidden("You do not own this course");
      }
    }

    return {
      summary: sessionDiscussion.summary,
      generatedAt: sessionDiscussion.summaryGeneratedAt,
      goalAssessment: sessionDiscussion.goalAssessment ?? null,
    };
  }

  /**
   * Regenerate summary for a session discussion (when initial generation failed)
   */
  static async regenerateSummary(
    sessionDiscussionId: string,
    userId: string,
    userRole: string,
  ) {
    const sessionDiscussion = await prisma.sessionDiscussion.findFirst({
      where: { id: sessionDiscussionId, deletedAt: null },
      include: {
        group: {
          include: {
            course: { select: { ownerId: true } },
            members: { select: { userId: true } },
          },
        },
      },
    });

    if (!sessionDiscussion) {
      throw ApiError.notFound("Session discussion not found");
    }

    if (userRole === "student") {
      const isMember = sessionDiscussion.group.members.some(
        (m) => m.userId === userId,
      );
      if (!isMember) {
        throw ApiError.forbidden("You are not a member of this group");
      }
    } else if (userRole === "lecturer") {
      if (sessionDiscussion.group.course.ownerId !== userId) {
        throw ApiError.forbidden("You do not own this course");
      }
    }

    const recentMessages = await ChatLog.find({
      sessionDiscussionId,
      deletedAt: null,
      senderType: { $in: ["student", "lecturer", "ai"] },
    })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    if (recentMessages.length === 0) {
      return {
        success: false,
        summary: null,
        generatedAt: null,
        error: "No messages found to summarize",
      };
    }

    const summaryResult = await aiEngineService.generateSummary(
      recentMessages.reverse().map((m) => ({
        sender: m.senderType === "ai" ? "AI" : m.senderName,
        content: m.content,
        timestamp: new Date(m.createdAt).toISOString(),
      })),
      sessionDiscussionId,
      undefined,
    );

    if (summaryResult.success && summaryResult.summary) {
      const summaryGeneratedAt = new Date();
      await prisma.sessionDiscussion.update({
        where: { id: sessionDiscussionId },
        data: { summary: summaryResult.summary, summaryGeneratedAt },
      });
      return {
        success: true,
        summary: summaryResult.summary,
        generatedAt: summaryGeneratedAt,
        error: null,
      };
    }

    return {
      success: false,
      summary: null,
      generatedAt: null,
      error: summaryResult.error || "AI Engine failed to generate summary",
    };
  }
}
