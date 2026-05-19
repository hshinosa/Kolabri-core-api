import { logger } from '../utils/logger.js';
import { ChatLog } from '../models/ChatLog.js';
import { SilenceEvent } from '../models/SilenceEvent.js';
import { aiEngineService } from '../services/aiEngine.service.js';
import { INTERVENTION_MESSAGES, pickRandom } from './interventionMessages.js';
import { tryAcquireSilenceLock, SILENCE_TIMEOUT_MS } from './interventionGate.js';

export interface SilenceInterventionContext {
    roomId: string;
    courseId: string;
    groupId: string;
    chatSpaceId: string;
}

export interface SilenceInterventionDeps {
    emit: (room: string, event: string, payload: unknown) => void;
    onSent?: (roomId: string) => void;
}

async function selectMessage(chatSpaceId: string): Promise<string> {
    try {
        const recentMessages = await ChatLog.find({
            chatSpaceId,
            isDeleted: { $ne: true },
            senderType: { $in: ['student', 'lecturer'] },
        })
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();

        const aiResult = await aiEngineService.analyzeIntervention({
            messages: recentMessages.reverse().map((m) => ({
                sender: m.senderName,
                content: m.content,
                timestamp: new Date(m.createdAt).toISOString(),
                sender_id: m.senderId,
            })),
            topic: 'Diskusi sepi',
            chat_room_id: chatSpaceId,
            intervention_type: 'silence',
            force: true,
        });

        if (aiResult.success && aiResult.message) {
            return aiResult.message;
        }

        const promptResult = await aiEngineService.generatePrompt(
            'Diskusi sepi',
            'Bantu mendorong diskusi yang sudah sepi tanpa terkesan menggurui',
            'easy',
        );
        if (promptResult.success && promptResult.prompt) {
            return promptResult.prompt;
        }
        return pickRandom(INTERVENTION_MESSAGES);
    } catch {
        return pickRandom(INTERVENTION_MESSAGES);
    }
}

export async function runSilenceIntervention(
    ctx: SilenceInterventionContext,
    deps: SilenceInterventionDeps,
): Promise<void> {
    const { roomId, courseId, groupId, chatSpaceId } = ctx;
    try {
        const lockAcquired = await tryAcquireSilenceLock(roomId);
        if (!lockAcquired) {
            logger.debug(`Silence intervention skipped for ${roomId} (lock held by another instance)`);
            return;
        }

        const silenceEvent = new SilenceEvent({
            courseId,
            groupId,
            chatSpaceId,
            silenceDuration: SILENCE_TIMEOUT_MS / 1000,
            interventionSent: true,
        });
        await silenceEvent.save();

        const message = await selectMessage(chatSpaceId);

        const chatLog = new ChatLog({
            courseId,
            groupId,
            chatSpaceId,
            senderId: 'bot',
            senderName: 'CoRegula Bot',
            senderType: 'bot',
            content: message,
            isIntervention: true,
        });
        await chatLog.save();

        deps.emit(roomId, 'receive_message', {
            id: chatLog._id?.toString(),
            senderId: 'bot',
            senderName: 'CoRegula Bot',
            senderType: 'bot',
            content: message,
            isIntervention: true,
            createdAt: chatLog.createdAt.toISOString(),
        });

        deps.onSent?.(roomId);

        logger.info(`Intervention sent to room ${roomId}`);
    } catch (error) {
        logger.error('Intervention error:', error);
    }
}
