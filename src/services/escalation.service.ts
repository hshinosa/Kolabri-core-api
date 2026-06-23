import { EscalationState, IEscalationState, EscalationStage, IssueType } from '../models/EscalationState.js';
import { logger } from '../utils/logger.js';

const DEFAULT_THRESHOLDS = {
    nudgeAfterMs: 5 * 60 * 1000,
    probeAfterMs: 10 * 60 * 1000,
    flagAfterMs: 15 * 60 * 1000,
};

export function isStagedEscalationEnabled(): boolean {
    return process.env.STAGED_ESCALATION_ENABLED === 'true';
}

export function getThresholds(escalationConfig?: { nudgeAfterMs?: number; probeAfterMs?: number; flagAfterMs?: number } | null) {
    if (!escalationConfig) return DEFAULT_THRESHOLDS;
    return {
        nudgeAfterMs: escalationConfig.nudgeAfterMs ?? DEFAULT_THRESHOLDS.nudgeAfterMs,
        probeAfterMs: escalationConfig.probeAfterMs ?? DEFAULT_THRESHOLDS.probeAfterMs,
        flagAfterMs: escalationConfig.flagAfterMs ?? DEFAULT_THRESHOLDS.flagAfterMs,
    };
}

export async function findOrCreateState(
    courseId: string,
    groupId: string,
    sessionDiscussionId: string,
    issueType: IssueType,
): Promise<IEscalationState> {
    const existing = await EscalationState.findOne({
        sessionDiscussionId,
        issueType,
        currentStage: { $ne: 'resolved' },
    });

    if (existing) {
        existing.lastCheckedAt = new Date();
        await existing.save();
        return existing;
    }

    const state = new EscalationState({
        courseId,
        groupId,
        sessionDiscussionId,
        issueType,
        currentStage: 'new',
        history: [{
            stage: 'new',
            enteredAt: new Date(),
            reason: `Issue detected: ${issueType}`,
            triggeredBy: issueType === 'silence' ? 'silence_timer' : 'quality_check',
        }],
        lastCheckedAt: new Date(),
    });

    await state.save();
    return state;
}

export async function advanceStage(
    state: IEscalationState,
    newStage: EscalationStage,
    reason: string,
    triggeredBy: 'silence_timer' | 'quality_check' | 'ai_chat' | 'manual',
): Promise<IEscalationState> {
    if (state.currentStage === newStage) return state;
    if (state.currentStage === 'resolved') return state;

    const validTransitions: Record<EscalationStage, EscalationStage[]> = {
        'new': ['nudge', 'resolved'],
        'nudge': ['probe-blocker', 'resolved'],
        'probe-blocker': ['flag-lecturer', 'resolved'],
        'flag-lecturer': ['resolved'],
        'resolved': [],
    };

    const allowed = validTransitions[state.currentStage] || [];
    if (!allowed.includes(newStage)) {
        logger.warn(`Invalid stage transition: ${state.currentStage} → ${newStage} for escalation ${state._id}`);
        return state;
    }

    state.currentStage = newStage;
    state.history.push({
        stage: newStage,
        enteredAt: new Date(),
        reason,
        triggeredBy,
    });
    state.lastCheckedAt = new Date();

    if (newStage === 'resolved') {
        state.resolvedAt = new Date();
    }

    await state.save();
    logger.info(`Escalation ${state._id} advanced: ${state.currentStage} → ${newStage}`);
    return state;
}

export async function resolveState(
    state: IEscalationState,
    resolvedBy: string,
    reason: string,
): Promise<IEscalationState> {
    if (state.currentStage === 'resolved') return state;

    state.currentStage = 'resolved';
    state.resolvedAt = new Date();
    state.resolvedBy = resolvedBy;
    state.history.push({
        stage: 'resolved',
        enteredAt: new Date(),
        reason,
        triggeredBy: 'manual',
    });
    state.lastCheckedAt = new Date();

    await state.save();
    logger.info(`Escalation ${state._id} resolved by ${resolvedBy}`);
    return state;
}

export function shouldNotifyLecturer(state: IEscalationState): boolean {
    if (state.currentStage !== 'flag-lecturer') return false;
    if (state.notificationSentAt) return false;
    return true;
}

export function markNotificationSent(state: IEscalationState): IEscalationState {
    state.notificationSentAt = new Date();
    return state;
}
