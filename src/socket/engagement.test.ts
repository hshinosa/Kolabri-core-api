import { describe, expect, it } from 'vitest';
import { analyzeEngagement, decideQualityIntervention, QUALITY_THRESHOLDS } from './engagement.js';

describe('analyzeEngagement', () => {
    describe('HOT (Higher-Order Thinking) detection', () => {
        it('detects Indonesian HOT keywords', () => {
            const result = analyzeEngagement('Mengapa konsep ini penting? Bagaimana penerapannya?');
            expect(result.isHigherOrder).toBe(true);
            expect(result.hotIndicators).toContain('mengapa');
            expect(result.hotIndicators).toContain('bagaimana');
        });

        it('detects English HOT keywords', () => {
            const result = analyzeEngagement('Why is this important? How does it work? Please analyze it.');
            expect(result.isHigherOrder).toBe(true);
            expect(result.hotIndicators).toEqual(expect.arrayContaining(['why', 'how', 'analyze']));
        });

        it('detects opinion-and-reasoning markers', () => {
            const result = analyzeEngagement('Menurut saya, alasannya karena dampak ini sangat signifikan');
            expect(result.isHigherOrder).toBe(true);
        });

        it('returns isHigherOrder=false when no HOT keywords present', () => {
            const result = analyzeEngagement('halo bro');
            expect(result.isHigherOrder).toBe(false);
            expect(result.hotIndicators).toEqual([]);
        });
    });

    describe('engagement type classification', () => {
        it('classifies cognitive engagement', () => {
            const result = analyzeEngagement('Menurut saya, analisis ini menunjukkan hubungan kausal yang kuat. Konsep teori ini perlu argumen yang jelas.');
            expect(result.engagementType).toBe('cognitive');
        });

        it('classifies behavioral engagement', () => {
            const result = analyzeEngagement('Saya akan submit tugas ini sebelum deadline. Mari kita upload dan share hasilnya.');
            expect(result.engagementType).toBe('behavioral');
        });

        it('classifies emotional engagement', () => {
            const result = analyzeEngagement('Bagus sekali, terima kasih, mantap, semangat!');
            expect(result.engagementType).toBe('emotional');
        });

        it('defaults to cognitive on tied scores', () => {
            const result = analyzeEngagement('halo dunia');
            expect(result.engagementType).toBe('cognitive');
        });
    });

    describe('lexical variety (Type-Token Ratio)', () => {
        it('returns 100% for fully unique words above 2-char threshold', () => {
            const result = analyzeEngagement('apel jeruk mangga pisang nanas durian');
            expect(result.lexicalVariety).toBe(100);
        });

        it('returns lower score for repeated words', () => {
            const result = analyzeEngagement('kata kata kata kata sama sama sama sama');
            expect(result.lexicalVariety).toBeLessThan(100);
            expect(result.lexicalVariety).toBeGreaterThan(0);
        });

        it('returns 0 when no qualifying words (all under 3 chars)', () => {
            const result = analyzeEngagement('a b c d ya ok');
            expect(result.lexicalVariety).toBe(0);
        });

        it('handles empty input', () => {
            const result = analyzeEngagement('');
            expect(result.lexicalVariety).toBe(0);
        });
    });

    describe('confidence scoring', () => {
        it('assigns base confidence 0.3 when no keywords match', () => {
            const result = analyzeEngagement('xxx yyy zzz');
            expect(result.confidence).toBe(0.3);
        });

        it('increases confidence with more keyword matches', () => {
            const sparse = analyzeEngagement('mengapa');
            const rich = analyzeEngagement('mengapa bagaimana analisis evaluasi konsep teori');
            expect(rich.confidence).toBeGreaterThan(sparse.confidence);
        });

        it('caps confidence at 1.0', () => {
            const result = analyzeEngagement(
                'mengapa bagaimana analisis evaluasi bandingkan jelaskan menurut saya pendapat alasan karena sebab konsep teori hipotesis kesimpulan bukti argumen'
            );
            expect(result.confidence).toBeLessThanOrEqual(1.0);
        });
    });

    describe('quality threshold contract', () => {
        it('returns analysis shape compatible with quality intervention check', () => {
            const result = analyzeEngagement('Mengapa hal ini terjadi? Karena ada sebab yang jelas.');
            expect(result).toMatchObject({
                engagementType: expect.any(String),
                isHigherOrder: expect.any(Boolean),
                lexicalVariety: expect.any(Number),
                hotIndicators: expect.any(Array),
                confidence: expect.any(Number),
            });
        });
    });
});

describe('decideQualityIntervention', () => {
    it('triggers low_hot when HOT% below threshold', () => {
        const decision = decideQualityIntervention({
            hotPercentage: 10,
            cognitiveRatio: 50,
            avgLexical: 60,
        });
        expect(decision.interventionType).toBe('low_hot');
        expect(decision.qualityIssue).toMatch(/HOT thinking: 10%/);
    });

    it('triggers low_cognitive when HOT OK but cognitive ratio low', () => {
        const decision = decideQualityIntervention({
            hotPercentage: 50,
            cognitiveRatio: 10,
            avgLexical: 60,
        });
        expect(decision.interventionType).toBe('low_cognitive');
        expect(decision.qualityIssue).toMatch(/Cognitive engagement: 10%/);
    });

    it('triggers low_lexical when only lexical variety low', () => {
        const decision = decideQualityIntervention({
            hotPercentage: 50,
            cognitiveRatio: 50,
            avgLexical: 10,
        });
        expect(decision.interventionType).toBe('low_lexical');
        expect(decision.qualityIssue).toMatch(/Lexical variety: 10%/);
    });

    it('returns null intervention when all metrics above thresholds', () => {
        const decision = decideQualityIntervention({
            hotPercentage: 50,
            cognitiveRatio: 50,
            avgLexical: 60,
        });
        expect(decision.interventionType).toBeNull();
        expect(decision.qualityIssue).toBe('');
    });

    it('uses HOT priority over cognitive when both fail', () => {
        const decision = decideQualityIntervention({
            hotPercentage: 5,
            cognitiveRatio: 5,
            avgLexical: 5,
        });
        expect(decision.interventionType).toBe('low_hot');
    });

    it('respects exact threshold boundary (just below = trigger)', () => {
        const justBelow = decideQualityIntervention({
            hotPercentage: QUALITY_THRESHOLDS.LOW_HOT - 0.01,
            cognitiveRatio: 50,
            avgLexical: 60,
        });
        expect(justBelow.interventionType).toBe('low_hot');
    });

    it('respects exact threshold boundary (at threshold = no trigger)', () => {
        const atThreshold = decideQualityIntervention({
            hotPercentage: QUALITY_THRESHOLDS.LOW_HOT,
            cognitiveRatio: 50,
            avgLexical: 60,
        });
        expect(atThreshold.interventionType).toBeNull();
    });
});
