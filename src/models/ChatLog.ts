import mongoose, { Schema, Document } from 'mongoose';

export interface IReplyTo {
    messageId: string;
    senderId: string;
    senderName: string;
    content: string;
}

export interface IAttachment {
    id: string;
    name: string;
    type: string;
    size: number;
    url: string;
    previewUrl?: string;
}

export interface IEngagementAnalysis {
    engagementType: 'cognitive' | 'behavioral' | 'emotional';
    isHigherOrder: boolean;
    lexicalVariety: number;
    hotIndicators: string[];
    confidence: number;
}

export interface IChatLog extends Document {
    courseId: string;
    groupId: string;
    chatSpaceId: string;
    senderId: string;
    senderName: string;
    senderType: 'student' | 'lecturer' | 'ai' | 'bot' | 'system';
    content: string;
    isIntervention: boolean;
    deletedAt?: Date;
    version: number;
    replyTo?: IReplyTo;
    attachments: IAttachment[];
    mentions: string[];
    engagement?: IEngagementAnalysis;
    isRelevant?: boolean | null;
    topic?: string;
    threadId?: string;
    isPinned: boolean;
    pinnedAt?: Date;
    pinnedBy?: string;
    // AI Explainability metadata (NFR-MNT-02)
    guardrailReason?: string;
    guardrailOutcome?: string;
    interventionType?: string;
    interventionReason?: string;
    scaffoldingLevel?: string;
    qualityScore?: number;
    citations?: Array<{ course_material_id: string; label?: string; page?: number }>;
    createdAt: Date;
}

const ReplyToSchema = new Schema<IReplyTo>(
    {
        messageId: { type: String, required: true },
        senderId: { type: String, required: true },
        senderName: { type: String, required: true },
        content: { type: String, required: true },
    },
    { _id: false }
);

const AttachmentSchema = new Schema<IAttachment>(
    {
        id: { type: String, required: true },
        name: { type: String, required: true },
        type: { type: String, required: true },
        size: { type: Number, required: true },
        url: { type: String, required: true },
        previewUrl: { type: String, required: false },
    },
    { _id: false }
);

const EngagementAnalysisSchema = new Schema<IEngagementAnalysis>(
    {
        engagementType: {
            type: String,
            enum: ['cognitive', 'behavioral', 'emotional'],
            required: true,
        },
        isHigherOrder: { type: Boolean, required: true },
        lexicalVariety: { type: Number, required: true },
        hotIndicators: { type: [String], default: [] },
        confidence: { type: Number, required: true },
    },
    { _id: false }
);

const ChatLogSchema = new Schema<IChatLog>(
    {
        courseId: { type: String, required: true, index: true },
        groupId: { type: String, required: true, index: true },
        chatSpaceId: { type: String, required: true, index: true },
        senderId: { type: String, required: true },
        senderName: { type: String, required: true },
        senderType: {
            type: String,
            enum: ['student', 'lecturer', 'ai', 'bot', 'system'],
            default: 'student',
        },
        content: { type: String, default: '' },
        isIntervention: { type: Boolean, default: false },
        deletedAt: { type: Date, default: null },
        version: { type: Number, default: 0 },
        replyTo: { type: ReplyToSchema, required: false },
        attachments: { type: [AttachmentSchema], default: [] },
        mentions: { type: [String], default: [] },
        engagement: { type: EngagementAnalysisSchema, required: false },
        isRelevant: { type: Schema.Types.Mixed, default: null },
        topic: { type: String, required: false },
        threadId: { type: String, required: false },
        isPinned: { type: Boolean, default: false },
        pinnedAt: { type: Date, required: false },
        pinnedBy: { type: String, required: false },
        guardrailReason: { type: String, required: false },
        guardrailOutcome: { type: String, required: false },
        interventionType: { type: String, required: false },
        interventionReason: { type: String, required: false },
        scaffoldingLevel: { type: String, required: false },
        qualityScore: { type: Number, required: false },
        citations: {
            type: [
                {
                    course_material_id: { type: String, required: true },
                    label: { type: String, required: false },
                    page: { type: Number, required: false },
                },
            ],
            default: undefined,
        },
    },
    {
        timestamps: { createdAt: true, updatedAt: false },
    }
);

ChatLogSchema.index({ chatSpaceId: 1, createdAt: -1 });
ChatLogSchema.index({ courseId: 1, groupId: 1, createdAt: -1 });
ChatLogSchema.index({ chatSpaceId: 1, isPinned: 1, createdAt: -1 });
ChatLogSchema.index({ chatSpaceId: 1, topic: 1, createdAt: -1 });

export const ChatLog = mongoose.model<IChatLog>('ChatLog', ChatLogSchema);
