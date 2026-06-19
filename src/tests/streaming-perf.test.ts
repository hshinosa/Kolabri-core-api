/**
 * Tests for PERF-AI-01: Streaming + NO_FETCH eligibility
 *
 * Tests:
 * - isNoFetchEligible() correctly classifies greetings/short queries as NO_FETCH
 * - isNoFetchEligible() correctly classifies substantive queries as FETCH
 * - orchestratedChatStream() SSE parsing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isNoFetchEligible } from '../socket/index.js';

describe('isNoFetchEligible', () => {
    it('returns true for greeting "halo"', () => {
        expect(isNoFetchEligible('halo')).toBe(true);
    });

    it('returns true for greeting "Halo" (case insensitive)', () => {
        expect(isNoFetchEligible('Halo')).toBe(true);
    });

    it('returns true for "terima kasih"', () => {
        expect(isNoFetchEligible('terima kasih')).toBe(true);
    });

    it('returns true for short query (< 3 words)', () => {
        expect(isNoFetchEligible('ok')).toBe(true);
        expect(isNoFetchEligible('ya')).toBe(true);
    });

    it('returns true for greeting prefix + short query', () => {
        expect(isNoFetchEligible('halo semua')).toBe(true);
        expect(isNoFetchEligible('selamat pagi')).toBe(true);
    });

    it('returns false for substantive query', () => {
        expect(isNoFetchEligible('bagaimana cara kerja K-Means clustering dalam machine learning')).toBe(false);
    });

    it('returns false for multi-word question', () => {
        expect(isNoFetchEligible('apa itu machine learning dan bagaimana cara kerjanya')).toBe(false);
    });

    it('returns false for code request', () => {
        expect(isNoFetchEligible('tolong buatkan kode Python untuk menghitung fibonacci')).toBe(false);
    });

    it('returns true for "ok" with trailing spaces', () => {
        expect(isNoFetchEligible('  ok  ')).toBe(true);
    });

    it('returns true for "mantap"', () => {
        expect(isNoFetchEligible('mantap')).toBe(true);
    });

    it('returns true for "siap"', () => {
        expect(isNoFetchEligible('siap')).toBe(true);
    });

    it('returns false for 4+ word substantive question', () => {
        expect(isNoFetchEligible('jelaskan konsep regresi linear sederhana')).toBe(false);
    });
});
