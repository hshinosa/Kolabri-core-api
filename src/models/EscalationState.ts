import mongoose, { Schema, Document } from 'mongoose';

export type EscalationStage = 'new' | 'nudge' | 'probe-blocker' | 'flag-lecturer' | 'resolved';
export type IssueType = 'silence' | 'low_quality' | 'unresolved_blocker';

export interface EscalationHistoryEntry {
    stage: EscalationStage;
    enteredAt: Date;
    reason: string;
    triggeredBy: 'silence_timer' | 'quality_check' | 'ai_chat' | 'manual';
}

export interface IEscalationState extends Document {
    courseId: string;
    groupId: string;
    chatSpaceId: string;
    issueType: IssueType;
    currentStage: EscalationStage;
    history: EscalationHistoryEntry[];
    lastCheckedAt: Date;
    resolvedAt?: Date;
    resolvedBy?: string;
    notificationSentAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const EscalationHistorySchema = new Schema<EscalationHistoryEntry>(
    {
        stage: { type: String, enum: ['new', 'nudge', 'probe-blocker', 'flag-lecturer', 'resolved'], required: true },
        enteredAt: { type: Date, default: Date.now },
        reason: { type: String, required: true },
        triggeredBy: { type: String, enum: ['silence_timer', 'quality_check', 'ai_chat', 'manual'], required: true },
    },
    { _id: false }
);

const EscalationStateSchema = new Schema<IEscalationState>(
    {
        courseId: { type: String, required: true, index: true },
        groupId: { type: String, required: true, index: true },
        chatSpaceId: { type: String, required: true, index: true },
        issueType: { type: String, enum: ['silence', 'low_quality', 'unresolved_blocker'], required: true },
        currentStage: { type: String, enum: ['new', 'nudge', 'probe-blocker', 'flag-lecturer', 'resolved'], default: 'new' },
        history: { type: [EscalationHistorySchema], default: [] },
        lastCheckedAt: { type: Date, default: Date.now },
        resolvedAt: { type: Date, required: false },
        resolvedBy: { type: String, required: false },
        notificationSentAt: { type: Date, required: false },
    },
    {
        timestamps: true,
    }
);

EscalationStateSchema.index({ chatSpaceId: 1, issueType: 1, currentStage: 1 });
EscalationStateSchema.index({ courseId: 1, currentStage: 1 });
EscalationStateSchema.index({ groupId: 1, currentStage: 1 });

export const EscalationState = mongoose.model<IEscalationState>('EscalationState', EscalationStateSchema);
