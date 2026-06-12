import prisma from '../config/database.js';
import { ApiError } from '../middleware/errorHandler.js';
import { aiEngineService } from './aiEngine.service.js';
import type { ReadingRecommendationRequest } from '../validators/readingRecommendation.validator.js';

interface RecommendationFallback {
    message: string;
    suggestedNextStep: string;
}

interface RecommendationItem {
    knowledgeBaseId: string;
    sourceTitle: string;
    snippet: string;
    rationale: string;
    suggestedAction: string;
    page?: number;
    relevanceScore: number;
}

export class ReadingRecommendationService {
    static async generate(courseId: string, input: ReadingRecommendationRequest, userId: string, role: string) {
        if (input.source_scope !== 'course_knowledge_base') {
            throw ApiError.badRequest('Unsupported source scope for reading recommendations');
        }

        const course = await prisma.course.findUnique({ where: { id: courseId } });
        if (!course) {
            throw ApiError.notFound('Course not found');
        }

        if (role === 'lecturer') {
            if (course.ownerId !== userId) {
                throw ApiError.forbidden('You do not own this course');
            }
        } else {
            const enrollment = await prisma.courseStudent.findUnique({
                where: {
                    courseId_userId: { courseId, userId },
                },
            });

            if (!enrollment) {
                throw ApiError.forbidden('You are not enrolled in this course');
            }
        }

        const approvedMaterials = await prisma.knowledgeBase.findMany({
            where: {
                courseId,
                deletedAt: null,
                vectorStatus: 'ready',
            },
            select: {
                id: true,
                fileName: true,
            },
            orderBy: { uploadedAt: 'desc' },
        });

        if (approvedMaterials.length === 0) {
            return {
                recommendations: [] satisfies RecommendationItem[],
                fallback: this.buildNoResultFallback(),
            };
        }

        const engineResult = await aiEngineService.generateReadingRecommendations(input.topic, courseId, input.limit ?? 3);
        if (!engineResult.success || engineResult.recommendations.length === 0) {
            return {
                recommendations: [] satisfies RecommendationItem[],
                fallback: engineResult.fallback ?? this.buildNoResultFallback(),
            };
        }

        const materialsByName = new Map(approvedMaterials.map((material) => [material.fileName, material]));
        const recommendations = engineResult.recommendations
            .map((item) => {
                const material = materialsByName.get(item.source_title);
                if (!material) {
                    return null;
                }

                return {
                    knowledgeBaseId: material.id,
                    sourceTitle: item.source_title,
                    snippet: item.snippet,
                    rationale: item.rationale,
                    suggestedAction: item.suggested_action,
                    page: item.page,
                    relevanceScore: item.relevance_score,
                } as RecommendationItem;
            })
            .filter((item): item is RecommendationItem => item !== null);

        return {
            recommendations,
            fallback: recommendations.length > 0 ? null : this.buildNoResultFallback(),
        };
    }

    private static buildNoResultFallback(): RecommendationFallback {
        return {
            message: 'Belum ada materi relevan yang siap direkomendasikan untuk topik ini.',
            suggestedNextStep: 'Persempit topik atau minta dosen mengunggah materi tambahan ke knowledge base course ini.',
        };
    }
}
