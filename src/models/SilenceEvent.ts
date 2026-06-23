import mongoose, { Schema, Document } from 'mongoose';

export interface ISilenceEvent extends Document {
    courseId: string;
    groupId: string;
    sessionDiscussionId: string;
    silenceDuration: number; // in seconds
    interventionSent: boolean;
    createdAt: Date;
}

const SilenceEventSchema = new Schema<ISilenceEvent>(
    {
        courseId: { type: String, required: true, index: true },
        groupId: { type: String, required: true, index: true },
        sessionDiscussionId: { type: String, required: true, index: true },
        silenceDuration: { type: Number, required: true },
        interventionSent: { type: Boolean, default: false },
    },
    {
        timestamps: { createdAt: true, updatedAt: false },
    }
);

SilenceEventSchema.index({ sessionDiscussionId: 1, createdAt: -1 });
SilenceEventSchema.index({ courseId: 1, groupId: 1, createdAt: -1 });

export const SilenceEvent = mongoose.model<ISilenceEvent>('SilenceEvent', SilenceEventSchema);
