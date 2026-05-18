import { describe, expect, it } from 'vitest';
import {
    INTERVENTION_COOLDOWN_MS,
    MESSAGES_BEFORE_CHECK,
    SILENCE_TIMEOUT_MS,
    incrementMessageCount,
    shouldRunQualityCheck,
} from './interventionGate.js';

describe('interventionGate constants', () => {
    it('exports stable timing constants', () => {
        expect(SILENCE_TIMEOUT_MS).toBe(10 * 60 * 1000);
        expect(INTERVENTION_COOLDOWN_MS).toBe(3 * 60 * 1000);
        expect(MESSAGES_BEFORE_CHECK).toBe(5);
    });
});

describe('shouldRunQualityCheck', () => {
    const NOW = 1_000_000_000_000;

    it('returns false when messageCount is 0', () => {
        expect(shouldRunQualityCheck({ messageCount: 0, lastInterventionAt: 0 }, NOW)).toBe(false);
    });

    it('returns false when messageCount is not multiple of MESSAGES_BEFORE_CHECK', () => {
        expect(shouldRunQualityCheck({ messageCount: 1, lastInterventionAt: 0 }, NOW)).toBe(false);
        expect(shouldRunQualityCheck({ messageCount: 4, lastInterventionAt: 0 }, NOW)).toBe(false);
        expect(shouldRunQualityCheck({ messageCount: 6, lastInterventionAt: 0 }, NOW)).toBe(false);
    });

    it('returns true when messageCount is exactly MESSAGES_BEFORE_CHECK and no recent intervention', () => {
        expect(shouldRunQualityCheck({ messageCount: 5, lastInterventionAt: 0 }, NOW)).toBe(true);
    });

    it('returns true when messageCount is multiple of MESSAGES_BEFORE_CHECK', () => {
        expect(shouldRunQualityCheck({ messageCount: 10, lastInterventionAt: 0 }, NOW)).toBe(true);
        expect(shouldRunQualityCheck({ messageCount: 15, lastInterventionAt: 0 }, NOW)).toBe(true);
    });

    it('returns false when within cooldown window', () => {
        const lastIntervention = NOW - INTERVENTION_COOLDOWN_MS + 1000;
        expect(shouldRunQualityCheck({ messageCount: 5, lastInterventionAt: lastIntervention }, NOW)).toBe(false);
    });

    it('returns true after cooldown elapsed', () => {
        const lastIntervention = NOW - INTERVENTION_COOLDOWN_MS - 1;
        expect(shouldRunQualityCheck({ messageCount: 5, lastInterventionAt: lastIntervention }, NOW)).toBe(true);
    });

    it('returns true exactly at cooldown boundary', () => {
        const lastIntervention = NOW - INTERVENTION_COOLDOWN_MS;
        expect(shouldRunQualityCheck({ messageCount: 5, lastInterventionAt: lastIntervention }, NOW)).toBe(true);
    });
});

describe('incrementMessageCount', () => {
    it('starts from 1 for new rooms', () => {
        const map = new Map<string, number>();
        expect(incrementMessageCount(map, 'room-1')).toBe(1);
        expect(map.get('room-1')).toBe(1);
    });

    it('increments existing counts', () => {
        const map = new Map<string, number>([['room-1', 4]]);
        expect(incrementMessageCount(map, 'room-1')).toBe(5);
    });

    it('isolates counts per room', () => {
        const map = new Map<string, number>();
        incrementMessageCount(map, 'room-1');
        incrementMessageCount(map, 'room-1');
        incrementMessageCount(map, 'room-2');
        expect(map.get('room-1')).toBe(2);
        expect(map.get('room-2')).toBe(1);
    });
});
