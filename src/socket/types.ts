import type { Socket } from 'socket.io';
import type { JwtPayload } from '../middleware/auth.js';
import type { IAttachment, IReplyTo } from '../models/ChatLog.js';

export interface AuthenticatedSocket extends Socket {
    user?: JwtPayload;
    currentRoom?: string;
}

export interface ChatHistoryItem {
    _id: { toString(): string };
    courseId: string;
    groupId: string;
    chatSpaceId: string;
    senderId: string;
    senderName: string;
    senderType: 'student' | 'lecturer' | 'ai' | 'bot' | 'system';
    content: string;
    isIntervention: boolean;
    isDeleted: boolean;
    replyTo?: IReplyTo;
    attachments: IAttachment[];
    mentions: string[];
    createdAt: Date;
}
