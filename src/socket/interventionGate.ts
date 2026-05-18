export const SILENCE_TIMEOUT_MS = 10 * 60 * 1000;
export const INTERVENTION_COOLDOWN_MS = 3 * 60 * 1000;
export const MESSAGES_BEFORE_CHECK = 5;

export interface CooldownState {
    messageCount: number;
    lastInterventionAt: number;
}

export function shouldRunQualityCheck(state: CooldownState, now: number): boolean {
    if (state.messageCount === 0) return false;
    if (state.messageCount % MESSAGES_BEFORE_CHECK !== 0) return false;
    if (now - state.lastInterventionAt < INTERVENTION_COOLDOWN_MS) return false;
    return true;
}

export function incrementMessageCount(map: Map<string, number>, roomId: string): number {
    const next = (map.get(roomId) ?? 0) + 1;
    map.set(roomId, next);
    return next;
}
