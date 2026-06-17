import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, aiEngineServiceMock, providerResolutionServiceMock } = vi.hoisted(() => ({
    prismaMock: {
        course: { findUnique: vi.fn() },
        courseStudent: { findUnique: vi.fn() },
        knowledgeBase: { findMany: vi.fn() },
    },
    aiEngineServiceMock: {
        generateReadingRecommendations: vi.fn(),
    },
    providerResolutionServiceMock: {
        resolveProviderContext: vi.fn(),
        executeWithFallback: vi.fn(async (_input, operation, options) => {
            const resolution = await providerResolutionServiceMock.resolveProviderContext(_input);
            const result = await operation(resolution.primary.providerContext);
            if (options?.isSuccess && !options.isSuccess(result)) {
                throw new Error(`Provider ${resolution.primary.providerName} returned unsuccessful result`);
            }
            return result;
        }),
    },
}));

vi.mock('../config/database.js', () => ({
    default: prismaMock,
    prisma: prismaMock,
}));

vi.mock('./aiEngine.service.js', () => ({
    aiEngineService: aiEngineServiceMock,
}));

vi.mock('./providerResolution.service.js', () => ({
    providerResolutionService: providerResolutionServiceMock,
}));

import { ReadingRecommendationService } from './readingRecommendation.service.js';

function createProviderContext() {
    return {
        version: '1.0' as const,
        provider: { name: 'openai', displayName: 'OpenAI GPT' },
        execution: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
        auth: { type: 'api-key' as const, credential: 'sk-test' },
        metadata: { featureFamily: 'reading-recommendations', requestId: 'req-1', resolvedAt: '2026-06-16T10:00:00.000Z' },
    };
}

describe('ReadingRecommendationService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        providerResolutionServiceMock.resolveProviderContext.mockResolvedValue({
            primary: { providerId: 'provider-openai', providerName: 'openai', providerContext: createProviderContext() },
            fallbackChain: [],
        });
    });

    it('returns structured recommendations mapped to approved course materials', async () => {
        prismaMock.course.findUnique.mockResolvedValue({ id: 'course-1', ownerId: 'lecturer-1' });
        prismaMock.courseStudent.findUnique.mockResolvedValue({ courseId: 'course-1', userId: 'student-1' });
        prismaMock.knowledgeBase.findMany.mockResolvedValue([
            { id: 'kb-1', fileName: 'week-3-transformer.pdf', vectorStatus: 'ready' },
        ]);
        aiEngineServiceMock.generateReadingRecommendations.mockResolvedValue({
            success: true,
            recommendations: [
                {
                    source_title: 'week-3-transformer.pdf',
                    snippet: 'Self-attention menghitung relasi antar token.',
                    rationale: 'Membahas inti mekanisme transformer yang relevan dengan topik.',
                    suggested_action: 'Baca bagian self-attention lalu catat dua kelebihan utamanya.',
                    page: 12,
                    relevance_score: 0.91,
                },
            ],
            fallback: null,
        });

        const result = await ReadingRecommendationService.generate(
            'course-1',
            { topic: 'transformer', limit: 3, source_scope: 'course_knowledge_base' },
            'student-1',
            'student'
        );

        expect(providerResolutionServiceMock.resolveProviderContext).toHaveBeenCalledWith({ featureFamily: 'reading-recommendations' });
        expect(aiEngineServiceMock.generateReadingRecommendations).toHaveBeenCalledWith('transformer', 'course-1', 3, createProviderContext());
        expect(result.recommendations).toEqual([
            {
                knowledgeBaseId: 'kb-1',
                sourceTitle: 'week-3-transformer.pdf',
                snippet: 'Self-attention menghitung relasi antar token.',
                rationale: 'Membahas inti mekanisme transformer yang relevan dengan topik.',
                suggestedAction: 'Baca bagian self-attention lalu catat dua kelebihan utamanya.',
                page: 12,
                relevanceScore: 0.91,
            },
        ]);
        expect(result.fallback).toBeNull();
    });

    it('rejects unsupported source scope', async () => {
        await expect(
            ReadingRecommendationService.generate(
                'course-1',
                { topic: 'transformer', limit: 3, source_scope: 'external_web' as never },
                'student-1',
                'student'
            )
        ).rejects.toMatchObject({
            statusCode: 400,
            message: 'Unsupported source scope for reading recommendations',
        });
    });

    it('returns fallback when no approved ready material can support the topic', async () => {
        prismaMock.course.findUnique.mockResolvedValue({ id: 'course-1', ownerId: 'lecturer-1' });
        prismaMock.courseStudent.findUnique.mockResolvedValue({ courseId: 'course-1', userId: 'student-1' });
        prismaMock.knowledgeBase.findMany.mockResolvedValue([]);

        const result = await ReadingRecommendationService.generate(
            'course-1',
            { topic: 'transformer', limit: 3, source_scope: 'course_knowledge_base' },
            'student-1',
            'student'
        );

        expect(aiEngineServiceMock.generateReadingRecommendations).not.toHaveBeenCalled();
        expect(result.recommendations).toEqual([]);
        expect(result.fallback).toEqual({
            message: 'Belum ada materi relevan yang siap direkomendasikan untuk topik ini.',
            suggestedNextStep: 'Persempit topik atau minta dosen mengunggah materi tambahan ke knowledge base course ini.',
        });
    });
});
