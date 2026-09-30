import { logger } from '../utils/logger.js';
import { ChatLog } from '../models/ChatLog.js';
import { SilenceEvent } from '../models/SilenceEvent.js';
import { aiEngineService } from '../services/aiEngine.service.js';
import { INTERVENTION_MESSAGES, pickRandom } from './interventionMessages.js';
import { tryAcquireSilenceLock, SILENCE_TIMEOUT_MS } from './interventionGate.js';
import { isStagedEscalationEnabled, findOrCreateState, advanceStage } from '../services/escalation.service.js';

export interface SilenceInterventionContext {
    roomId: string;
    courseId: string;
    groupId: string;
    sessionDiscussionId: string;
}

export interface SilenceInterventionDeps {
    emit: (room: string, event: string, payload: unknown) => void;
    onSent?: (roomId: string) => void;
}

async function selectMessage(sessionDiscussionId: string): Promise<string> {
    try {
        const recentMessages = await ChatLog.find({
            sessionDiscussionId,
            deletedAt: null,
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
            chat_room_id: sessionDiscussionId,
            intervention_type: 'silence',
            force: true,
            provider_context: undefined,
        });

        if (!aiResult.success || !aiResult.message) {
            throw new Error(aiResult.error || 'Intervention analysis unsuccessful');
        }

        return aiResult.message;
    } catch {
        try {
            const promptResult = await aiEngineService.generatePrompt(
                'Diskusi sepi',
                'Bantu mendorong diskusi yang sudah sepi tanpa terkesan menggurui',
                'easy',
                undefined,
            );
            // generatePrompt failures resolve to { success: false, prompt: '' }
            // (HTTP 200 shape), so `??` would broadcast an empty message —
            // only a successful non-empty prompt beats the hardcoded pool.
            return promptResult.success && promptResult.prompt
                ? promptResult.prompt
                : pickRandom(INTERVENTION_MESSAGES);
        } catch {
            return pickRandom(INTERVENTION_MESSAGES);
        }
    }
}

export async function runSilenceIntervention(
    ctx: SilenceInterventionContext,
    deps: SilenceInterventionDeps,
): Promise<void> {
    const { roomId, courseId, groupId, sessionDiscussionId } = ctx;
    try {
        const lockAcquired = await tryAcquireSilenceLock(roomId);
        if (!lockAcquired) {
            logger.debug(`Silence intervention skipped for ${roomId} (lock held by another instance)`);
            return;
        }

        if (isStagedEscalationEnabled()) {
            const state = await findOrCreateState(courseId, groupId, sessionDiscussionId, 'silence');

            if (state.currentStage === 'resolved') {
                logger.debug(`Silence intervention skipped for ${roomId} (escalation resolved)`);
                return;
            }

            if (state.currentStage === 'flag-lecturer') {
                logger.debug(`Silence intervention skipped for ${roomId} (already escalated to lecturer)`);
                return;
            }

            if (state.currentStage === 'new') {
                await advanceStage(state, 'nudge', 'Silence detected, sending nudge', 'silence_timer');
            } else if (state.currentStage === 'nudge') {
                await advanceStage(state, 'probe-blocker', 'Silence persists after nudge, probing for blockers', 'silence_timer');
            } else if (state.currentStage === 'probe-blocker') {
                await advanceStage(state, 'flag-lecturer', 'No response after probe, escalating to lecturer', 'silence_timer');
            }
        }

        const silenceEvent = new SilenceEvent({
            courseId,
            groupId,
            sessionDiscussionId,
            silenceDuration: SILENCE_TIMEOUT_MS / 1000,
            interventionSent: true,
        });
        await silenceEvent.save();

        const message = await selectMessage(sessionDiscussionId);

        const chatLog = new ChatLog({
            courseId,
            groupId,
            sessionDiscussionId,
            senderId: 'bot',
            senderName: 'Kolabri',
            senderType: 'bot',
            content: message,
            isIntervention: true,
        });
        await chatLog.save();

        deps.emit(roomId, 'receive_message', {
            id: chatLog._id?.toString(),
            senderId: 'bot',
            senderName: 'Kolabri',
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
