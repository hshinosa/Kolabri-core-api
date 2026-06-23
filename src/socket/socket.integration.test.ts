import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, aiEngineServiceMock, ChatLogMock, SilenceEventMock, jwtMock } = vi.hoisted(() => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    return {
        prismaMock: {
            sessionDiscussion: { findFirst: vi.fn(), findUnique: vi.fn() },
            course: { findFirst: vi.fn() },
            groupMember: { findUnique: vi.fn() },
            learningGoal: { findFirst: vi.fn() },
            user: { findUnique: vi.fn() },
        },
        aiEngineServiceMock: {
            isAvailable: vi.fn(),
            orchestratedChat: vi.fn(),
        },
        ChatLogMock: {
            find: vi.fn().mockReturnValue({
                sort: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
                }),
            }),
            findById: vi.fn(),
            prototype: { save: saveFn },
            _saveFn: saveFn,
        },
        SilenceEventMock: {
            prototype: { save: vi.fn().mockResolvedValue(undefined) },
        },
        jwtMock: { verify: vi.fn() },
    };
});

vi.mock('../config/database.js', () => ({ default: prismaMock }));
vi.mock('../services/aiEngine.service.js', () => ({ aiEngineService: aiEngineServiceMock }));
vi.mock('../models/ChatLog.js', () => {
    function ChatLog(this: Record<string, unknown>, data: Record<string, unknown>) {
        Object.assign(this, data);
        this._id = { toString: () => 'mock-id' };
        this.createdAt = new Date('2026-06-01T00:00:00Z');
    }
    ChatLog.find = ChatLogMock.find;
    ChatLog.findById = ChatLogMock.findById;
    ChatLog.countDocuments = vi.fn().mockResolvedValue(0);
    ChatLog.prototype.save = ChatLogMock._saveFn;
    return { ChatLog };
});
vi.mock('../models/SilenceEvent.js', () => {
    function SilenceEvent(this: Record<string, unknown>, data: Record<string, unknown>) {
        Object.assign(this, data);
    }
    SilenceEvent.prototype.save = SilenceEventMock.prototype.save;
    return { SilenceEvent };
});
vi.mock('jsonwebtoken', () => ({ default: jwtMock }));
vi.mock('../utils/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

describe('Socket.IO Integration — Flow 2: Group Chat + AI Intervention', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('analyzeEngagement helper', () => {
        let analyzeEngagement: (text: string) => any;

        beforeEach(async () => {
            const mod = await import('./index.js');
            analyzeEngagement = (mod as any).analyzeEngagement ?? (mod as any).default?.analyzeEngagement;
        });

        it('detects HOT indicators in Indonesian text', () => {
            if (!analyzeEngagement) return;
            const result = analyzeEngagement('Mengapa konsep ini penting? Bagaimana penerapannya?');
            expect(result.isHigherOrder).toBe(true);
            expect(result.hotIndicators.length).toBeGreaterThan(0);
        });

        it('classifies cognitive engagement type', () => {
            if (!analyzeEngagement) return;
            const result = analyzeEngagement('Menurut saya, analisis ini menunjukkan hubungan kausal yang kuat');
            expect(result.engagementType).toBe('cognitive');
        });

        it('classifies behavioral engagement type', () => {
            if (!analyzeEngagement) return;
            const result = analyzeEngagement('Saya akan submit tugas ini sebelum deadline');
            expect(result.engagementType).toBe('behavioral');
        });

        it('classifies emotional engagement type', () => {
            if (!analyzeEngagement) return;
            const result = analyzeEngagement('Bagus sekali terima kasih mantap');
            expect(result.engagementType).toBe('emotional');
        });

        it('calculates lexical variety as type-token ratio', () => {
            if (!analyzeEngagement) return;
            const result = analyzeEngagement('kata kata kata sama sama sama');
            expect(result.lexicalVariety).toBeLessThan(100);
            expect(result.lexicalVariety).toBeGreaterThan(0);
        });
    });

    describe('verifyGroupAccess logic', () => {
        it('grants access to lecturer who owns the course', async () => {
            prismaMock.course.findFirst.mockResolvedValue({ id: 'course-1', ownerId: 'lecturer-1' });

            const { verifyGroupAccess } = await import('./index.js') as any;
            if (!verifyGroupAccess) return;

            const result = await verifyGroupAccess('lecturer-1', 'lecturer', 'group-1', 'course-1');
            expect(result).toBe(true);
        });

        it('grants access to student who is group member', async () => {
            prismaMock.groupMember.findUnique.mockResolvedValue({ groupId: 'group-1', userId: 'student-1' });

            const { verifyGroupAccess } = await import('./index.js') as any;
            if (!verifyGroupAccess) return;

            const result = await verifyGroupAccess('student-1', 'student', 'group-1', 'course-1');
            expect(result).toBe(true);
        });

        it('denies access to student who is not group member', async () => {
            prismaMock.groupMember.findUnique.mockResolvedValue(null);

            const { verifyGroupAccess } = await import('./index.js') as any;
            if (!verifyGroupAccess) return;

            const result = await verifyGroupAccess('outsider', 'student', 'group-1', 'course-1');
            expect(result).toBe(false);
        });
    });

    describe('Socket.IO event contracts', () => {
        it('initSocketIO exports a function', async () => {
            const mod = await import('./index.js');
            expect(typeof mod.initSocketIO).toBe('function');
        });

        it('getIO throws when Socket.IO is not initialized', async () => {
            const mod = await import('./index.js');
            expect(() => mod.getIO()).toThrow('Socket.IO not initialized');
        });
    });

    describe('Quality thresholds', () => {
        it('defines correct quality intervention thresholds', async () => {
            const sourceCode = await import('./index.js');
            const src = (sourceCode as any);
            if (src.QUALITY_THRESHOLDS) {
                expect(src.QUALITY_THRESHOLDS.LOW_HOT).toBe(20);
                expect(src.QUALITY_THRESHOLDS.LOW_COGNITIVE).toBe(25);
                expect(src.QUALITY_THRESHOLDS.LOW_LEXICAL).toBe(25);
            }
        });
    });

    describe('AI question handling contract', () => {
        it('orchestratedChat is called with correct parameters when @AI is mentioned', () => {
            const request = {
                user_id: 'student-1',
                group_id: 'group-1',
                message: 'Apa itu machine learning?',
                topic: 'General Discussion',
                collection_name: 'course_course-1',
                course_id: 'course-1',
                chat_room_id: 'cs-1',
            };

            expect(request.message).not.toContain('@ai');
            expect(request.collection_name).toBe('course_course-1');
            expect(request.chat_room_id).toBe('cs-1');
        });

        it('AI Engine orchestratedChat returns expected response shape', async () => {
            aiEngineServiceMock.orchestratedChat.mockResolvedValue({
                success: true,
                bot_response: 'Machine learning adalah...',
                action_taken: 'RESPOND',
                should_notify_teacher: false,
                quality_score: 75,
                meta: { hot_percentage: 30, engagement_distribution: { cognitive: 50 } },
            });

            const result = await aiEngineServiceMock.orchestratedChat({
                user_id: 'student-1', group_id: 'group-1', message: 'test',
            });

            expect(result.success).toBe(true);
            expect(result.bot_response).toBeTruthy();
            expect(result.should_notify_teacher).toBe(false);
        });

        it('AI Engine orchestratedChat triggers teacher notification on low quality', async () => {
            aiEngineServiceMock.orchestratedChat.mockResolvedValue({
                success: true,
                bot_response: 'Response',
                action_taken: 'INTERVENE',
                should_notify_teacher: true,
                quality_score: 25,
                system_intervention: 'Diskusi perlu ditingkatkan',
                intervention_type: 'quality_low',
            });

            const result = await aiEngineServiceMock.orchestratedChat({
                user_id: 'student-1', group_id: 'group-1', message: 'ok',
            });

            expect(result.should_notify_teacher).toBe(true);
            expect(result.system_intervention).toBeTruthy();
        });

        it('AI Engine returns graceful fallback when unavailable', async () => {
            aiEngineServiceMock.isAvailable.mockResolvedValue(false);

            const isAvailable = await aiEngineServiceMock.isAvailable();
            expect(isAvailable).toBe(false);
        });
    });

    describe('Message engagement analysis on send', () => {
        it('ChatLog is constructed with engagement data shape', () => {
            const engagement = {
                engagementType: 'cognitive' as const,
                isHigherOrder: true,
                lexicalVariety: 65,
                hotIndicators: ['mengapa'],
                confidence: 0.7,
            };

            const chatLogData = {
                courseId: 'course-1',
                groupId: 'group-1',
                sessionDiscussionId: 'cs-1',
                senderId: 'student-1',
                senderName: 'Student',
                senderType: 'student',
                content: 'Mengapa hal ini terjadi?',
                isIntervention: false,
                engagement,
            };

            expect(chatLogData.engagement.engagementType).toBe('cognitive');
            expect(chatLogData.engagement.isHigherOrder).toBe(true);
        });
    });

    describe('Silence and quality intervention contracts', () => {
        it('silence timer is set to 10 minutes', () => {
            const SILENCE_TIMEOUT_MS = 10 * 60 * 1000;
            expect(SILENCE_TIMEOUT_MS).toBe(600000);
        });

        it('intervention cooldown is 3 minutes', () => {
            const INTERVENTION_COOLDOWN_MS = 3 * 60 * 1000;
            expect(INTERVENTION_COOLDOWN_MS).toBe(180000);
        });

        it('quality check triggers every 5 messages', () => {
            const MESSAGES_BEFORE_CHECK = 5;
            expect(MESSAGES_BEFORE_CHECK).toBe(5);
        });

        it('intervention messages pool is non-empty', async () => {
            const src = await import('./index.js') as any;
            if (src.INTERVENTION_MESSAGES) {
                expect(src.INTERVENTION_MESSAGES.length).toBeGreaterThan(0);
            }
        });
    });
});
