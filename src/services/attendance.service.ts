/**
 * Attendance Service — computes auto-attendance from discussion participation.
 *
 * Status determination:
 *   present = ≥3 messages AND ≥1 HOT (Higher-Order Thinking)
 *   absent  = <3 messages OR 0 HOT
 *
 * HOT detection uses the `engagement.isHigherOrder` field on each ChatLog,
 * populated by `socket/engagement.ts` when messages are sent.
 */

import { ChatLog } from '../models/ChatLog.js';
import { logger } from '../utils/logger.js';

const DEFAULT_MIN_MESSAGES = 3;
const DEFAULT_MIN_HOT = 1;

export interface StudentParticipation {
    studentId: string;
    studentName: string;
    messageCount: number;
    hotCount: number;
    status: 'present' | 'absent';
}

export interface AttendanceResult {
    sessionDiscussionId: string;
    groupId: string;
    courseId: string;
    weekId: string | null;
    students: StudentParticipation[];
}

export class AttendanceService {
    /**
     * Compute participation metrics per student for a session discussion.
     * Returns present/absent status based on message count + HOT count.
     */
    static async computeAttendance(
        sessionDiscussionId: string,
        options?: { minMessages?: number; minHot?: number },
    ): Promise<AttendanceResult | null> {
        const minMessages = options?.minMessages ?? DEFAULT_MIN_MESSAGES;
        const minHot = options?.minHot ?? DEFAULT_MIN_HOT;

        // Aggregate per student: count messages + count HOT
        const pipeline = [
            {
                $match: {
                    sessionDiscussionId,
                    deletedAt: null,
                    senderType: { $in: ['student', 'lecturer'] },
                },
            },
            {
                $group: {
                    _id: '$senderId',
                    studentName: { $first: '$senderName' },
                    messageCount: { $sum: 1 },
                    hotCount: {
                        $sum: {
                            $cond: [
                                { $eq: ['$engagement.isHigherOrder', true] },
                                1,
                                0,
                            ],
                        },
                    },
                },
            },
        ];

        const results = await ChatLog.aggregate(pipeline);

        if (results.length === 0) {
            logger.info('No messages found for attendance', { sessionDiscussionId });
            return null;
        }

        // Get session metadata for groupId, courseId, weekId
        // We need to fetch this from the first message or pass it in
        const firstMessage = await ChatLog.findOne({
            sessionDiscussionId,
            deletedAt: null,
        })
            .select('courseId groupId')
            .lean();

        if (!firstMessage) {
            return null;
        }

        const students: StudentParticipation[] = results.map((r: { _id: string; studentName: string; messageCount: number; hotCount: number }) => ({
            studentId: r._id,
            studentName: r.studentName,
            messageCount: r.messageCount,
            hotCount: r.hotCount,
            status:
                r.messageCount >= minMessages && r.hotCount >= minHot
                    ? ('present' as const)
                    : ('absent' as const),
        }));

        return {
            sessionDiscussionId,
            groupId: firstMessage.groupId,
            courseId: firstMessage.courseId,
            weekId: null, // Will be filled by caller from session discussion record
            students,
        };
    }
}
