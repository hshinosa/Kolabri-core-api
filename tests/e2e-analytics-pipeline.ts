/**
 * E2E Analytics Pipeline Test
 *
 * Seeds real data → runs all analytics flows → verifies results → cleans up.
 * Tests: dashboard analytics, real-time quality, engagement analysis,
 * intervention pipeline, group/individual dashboards, process mining export.
 *
 * Run: ./node_modules/.bin/tsx tests/e2e-analytics-pipeline.ts
 */

import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import mongoose from 'mongoose';

const CORE_API = 'http://localhost:3000';
const AI_ENGINE = 'http://localhost:8001';
const JWT_SECRET = 'your-super-secret-jwt-key-change-this-in-production';
const AI_SECRET = 'shared-secret-key';
const MONGO_URI = 'mongodb://localhost:27017/kolabri';

const prisma = new PrismaClient();

function makeToken(role: 'student' | 'lecturer', userId: string, email: string) {
    return jwt.sign({ userId, email, role }, JWT_SECRET, { expiresIn: '1h' });
}

let passed = 0;
let failed = 0;
const results: { name: string; ok: boolean; detail?: string }[] = [];

async function test(name: string, fn: () => Promise<void>) {
    try {
        await fn();
        passed++;
        results.push({ name, ok: true });
        console.log(`  ✅ ${name}`);
    } catch (err: any) {
        failed++;
        const detail = err.message || String(err);
        results.push({ name, ok: false, detail });
        console.log(`  ❌ ${name} — ${detail}`);
    }
}

function assert(condition: boolean, msg: string) {
    if (!condition) throw new Error(msg);
}

async function fetchJSON(url: string, opts: RequestInit = {}) {
    const res = await fetch(url, opts);
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
}

const IDS = {
    lecturer: 'e2e-analytics-lecturer',
    student1: 'e2e-analytics-student-1',
    student2: 'e2e-analytics-student-2',
    course: 'e2e-analytics-course',
    group: 'e2e-analytics-group',
    chatSpace: 'e2e-analytics-chatspace',
    goal: 'e2e-analytics-goal',
};

const LECTURER_TOKEN = makeToken('lecturer', IDS.lecturer, 'e2e-lecturer@kolabri.test');
const STUDENT_TOKEN = makeToken('student', IDS.student1, 'e2e-student1@kolabri.test');

function lecturerHeaders() {
    return { Authorization: `Bearer ${LECTURER_TOKEN}`, 'Content-Type': 'application/json' };
}
function aiHeaders() {
    return { Authorization: `Bearer ${AI_SECRET}`, 'Content-Type': 'application/json' };
}

async function seedData() {
    console.log('\n🌱 Seeding test data...');

    await prisma.user.createMany({
        data: [
            { id: IDS.lecturer, email: 'e2e-lecturer@kolabri.test', name: 'E2E Lecturer', role: 'lecturer', password: 'hashed' },
            { id: IDS.student1, email: 'e2e-student1@kolabri.test', name: 'E2E Student 1', role: 'student', password: 'hashed' },
            { id: IDS.student2, email: 'e2e-student2@kolabri.test', name: 'E2E Student 2', role: 'student', password: 'hashed' },
        ],
        skipDuplicates: true,
    });

    await prisma.course.create({
        data: { id: IDS.course, name: 'E2E Analytics Course', code: 'E2E101', joinCode: 'E2E-JOIN-' + Date.now(), ownerId: IDS.lecturer },
    }).catch((e: any) => { console.log(`  ⚠️ Course seed: ${e.message?.substring(0, 80)}`); });

    await prisma.courseStudent.createMany({
        data: [
            { courseId: IDS.course, userId: IDS.student1 },
            { courseId: IDS.course, userId: IDS.student2 },
        ],
        skipDuplicates: true,
    });

    const group = await prisma.group.create({
        data: {
            id: IDS.group, name: 'E2E Analytics Group', courseId: IDS.course,
            joinCode: 'E2E-GRP-' + Date.now(), createdBy: IDS.lecturer,
            members: { createMany: { data: [{ userId: IDS.student1 }, { userId: IDS.student2 }] } },
        },
    });
    console.log(`  → Group created: ${group.id}`);

    const chatSpace = await prisma.chatSpace.create({
        data: { id: IDS.chatSpace, name: 'E2E Analytics Session', groupId: IDS.group, createdBy: IDS.lecturer },
    });
    console.log(`  → ChatSpace created: ${chatSpace.id}`);

    await prisma.learningGoal.create({
        data: { id: IDS.goal, content: 'Menganalisis dampak collaborative learning terhadap pemahaman konsep', chatSpaceId: IDS.chatSpace, userId: IDS.student1, isValidated: true },
    });

    await mongoose.connect(MONGO_URI);

    const chatMessages = [
        { sender: IDS.student1, name: 'E2E Student 1', type: 'student', content: 'Mengapa collaborative learning efektif untuk pemahaman konsep?', isHOT: true },
        { sender: IDS.student2, name: 'E2E Student 2', type: 'student', content: 'Menurut saya karena ada proses diskusi yang mendalam dan saling menjelaskan', isHOT: true },
        { sender: IDS.student1, name: 'E2E Student 1', type: 'student', content: 'Bagaimana kita bisa mengukur efektivitasnya?', isHOT: true },
        { sender: IDS.student2, name: 'E2E Student 2', type: 'student', content: 'Bisa pakai pre-test dan post-test untuk bandingkan hasilnya', isHOT: true },
        { sender: IDS.student1, name: 'E2E Student 1', type: 'student', content: 'Setuju, kita juga bisa analisis kualitas diskusi dari transkrip', isHOT: true },
        { sender: IDS.student2, name: 'E2E Student 2', type: 'student', content: 'ok mantap', isHOT: false },
        { sender: IDS.student1, name: 'E2E Student 1', type: 'student', content: 'iya betul', isHOT: false },
        { sender: IDS.student2, name: 'E2E Student 2', type: 'student', content: 'Evaluasi juga perlu mempertimbangkan aspek kolaborasi dan kontribusi individu', isHOT: true },
        { sender: 'bot', name: 'CoRegula Bot', type: 'bot', content: 'Diskusi kalian sudah bagus! Coba perdalam lagi analisisnya.', isIntervention: true },
        { sender: IDS.student1, name: 'E2E Student 1', type: 'student', content: 'Dampak lainnya adalah meningkatkan kemampuan berpikir kritis melalui argumentasi', isHOT: true },
    ];

    const chatLogCollection = mongoose.connection.db.collection('chatlogs');
    for (let i = 0; i < chatMessages.length; i++) {
        const msg = chatMessages[i];
        await chatLogCollection.insertOne({
            courseId: IDS.course,
            groupId: IDS.group,
            chatSpaceId: IDS.chatSpace,
            senderId: msg.sender,
            senderName: msg.name,
            senderType: msg.type,
            content: msg.content,
            isIntervention: msg.isIntervention || false,
            isDeleted: false,
            engagement: {
                engagementType: msg.isHOT ? 'cognitive' : 'emotional',
                isHigherOrder: msg.isHOT || false,
                lexicalVariety: 60 + Math.random() * 30,
                hotIndicators: msg.isHOT ? ['mengapa', 'analisis'] : [],
                confidence: 0.8,
            },
            attachments: [],
            mentions: [],
            createdAt: new Date(Date.now() - (chatMessages.length - i) * 60000),
        });
    }

    console.log(`  ✅ Seeded: 3 users, 1 course, 1 group, 1 chat space, 1 goal, ${chatMessages.length} messages`);
}

async function cleanup() {
    console.log('\n🧹 Cleaning up...');
    try {
        if (mongoose.connection.readyState === 1) {
            const chatLogCollection = mongoose.connection.db.collection('chatlogs');
            await chatLogCollection.deleteMany({ groupId: IDS.group });
        }

        await prisma.learningGoal.deleteMany({ where: { chatSpaceId: IDS.chatSpace } });
        await prisma.chatSpace.deleteMany({ where: { id: IDS.chatSpace } });
        await prisma.groupMember.deleteMany({ where: { groupId: IDS.group } });
        await prisma.group.deleteMany({ where: { id: IDS.group } });
        await prisma.courseStudent.deleteMany({ where: { courseId: IDS.course } });
        await prisma.course.deleteMany({ where: { id: IDS.course } });
        await prisma.user.deleteMany({ where: { id: { in: [IDS.lecturer, IDS.student1, IDS.student2] } } });

        if (mongoose.connection.readyState === 1) await mongoose.disconnect();
        await prisma.$disconnect();
        console.log('  ✅ Cleanup complete');
    } catch (err: any) {
        console.log(`  ⚠️ Cleanup partial: ${err.message}`);
    }
}

async function testCoreAPIGroupAnalytics() {
    console.log('\n📊 Core API: Group Analytics (Lecturer Dashboard)');

    await test('Get group analytics with real chat data', async () => {
        const { status, body } = await fetchJSON(`${CORE_API}/api/analytics/group/${IDS.group}`, {
            headers: lecturerHeaders(),
        });
        assert(status === 200, `Expected 200, got ${status}: ${JSON.stringify(body).substring(0, 200)}`);
        assert(body.success === true, 'Analytics failed');
        assert(body.analytics?.local_message_count >= 8, `Expected >= 8 student messages, got ${body.analytics?.local_message_count}`);
        assert(body.analytics?.qualityScore !== undefined, 'Missing quality score');
        assert(body.analytics?.hotPercentage !== undefined, 'Missing HOT percentage');
        assert(body.members?.length === 2, `Expected 2 members, got ${body.members?.length}`);

        console.log(`    → Quality Score: ${body.analytics.qualityScore}`);
        console.log(`    → HOT%: ${body.analytics.hotPercentage}`);
        console.log(`    → Messages: ${body.analytics.local_message_count}`);
        console.log(`    → Participants: ${body.analytics.participantCount}`);
        console.log(`    → Recommendation: ${body.analytics.recommendation?.substring(0, 60)}`);
        console.log(`    → Engagement: cognitive=${body.analytics.qualityBreakdown?.cognitive_ratio}%, lexical=${body.analytics.qualityBreakdown?.lexical_score}`);
    });

    await test('Get course analytics overview', async () => {
        const { status, body } = await fetchJSON(`${CORE_API}/api/analytics/course/${IDS.course}`, {
            headers: lecturerHeaders(),
        });
        assert(status === 200, `Expected 200, got ${status}`);
        assert(body.success === true, 'Course analytics failed');
        assert(body.summary?.totalGroups === 1, `Expected 1 group, got ${body.summary?.totalGroups}`);
        assert(body.summary?.totalMessages > 0, 'Expected messages > 0');

        console.log(`    → Total groups: ${body.summary.totalGroups}`);
        console.log(`    → Total messages: ${body.summary.totalMessages}`);
        console.log(`    → Avg quality: ${body.summary.averageQualityScore}`);
        console.log(`    → Groups needing attention: ${body.summary.groupsNeedingAttention}`);
    });

    await test('Get chat space analytics', async () => {
        const { status, body } = await fetchJSON(`${CORE_API}/api/analytics/chat-space/${IDS.chatSpace}`, {
            headers: lecturerHeaders(),
        });
        assert(status === 200, `Expected 200, got ${status}`);
        assert(body.success === true, 'Chat space analytics failed');
        assert(body.metrics?.totalMessages >= 10, `Expected >= 10 messages, got ${body.metrics?.totalMessages}`);
        assert(body.metrics?.interventions >= 1, `Expected >= 1 intervention, got ${body.metrics?.interventions}`);
        assert(body.metrics?.goalsCount === 1, `Expected 1 goal, got ${body.metrics?.goalsCount}`);

        console.log(`    → Total messages: ${body.metrics.totalMessages}`);
        console.log(`    → Student messages: ${body.metrics.studentMessages}`);
        console.log(`    → AI mentions: ${body.metrics.aiMentions}`);
        console.log(`    → Interventions: ${body.metrics.interventions}`);
        console.log(`    → Goals: ${body.metrics.goalsCount}`);
        console.log(`    → Participants: ${JSON.stringify(body.participantStats)}`);
    });

    await test('Get group quality status (live monitoring)', async () => {
        const { status, body } = await fetchJSON(`${CORE_API}/api/analytics/group/${IDS.group}/status`, {
            headers: lecturerHeaders(),
        });
        assert(status === 200, `Expected 200, got ${status}`);
        assert(body.success === true, 'Quality status failed');
        assert(['good', 'moderate', 'needs_attention'].includes(body.status), `Unexpected status: ${body.status}`);

        console.log(`    → Status: ${body.status}`);
        console.log(`    → Quality score: ${body.qualityScore}`);
        console.log(`    → Recent messages (1h): ${body.recentMessageCount}`);
        console.log(`    → Recommendation: ${body.recommendation?.substring(0, 60)}`);
    });
}

async function testAIEngineDashboards() {
    console.log('\n📈 AI Engine: Dashboard Analytics');

    await test('Group dashboard (collaboration metrics)', async () => {
        const res = await fetch(`${AI_ENGINE}/api/analytics/dashboard/group/${IDS.group}`, {
            headers: aiHeaders(),
        });
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        const body = await res.json();
        assert(body.group_id === IDS.group, 'Wrong group ID');

        console.log(`    → Status color: ${body.status_color}`);
        console.log(`    → Quality score: ${body.metrics?.quality_score}`);
        console.log(`    → HOT%: ${body.metrics?.hot_percentage}`);
        console.log(`    → Lexical variety: ${body.metrics?.lexical_variety}`);
        console.log(`    → Radar: ${JSON.stringify(body.radar_chart_data)}`);
        if (body.alignment) console.log(`    → Alignment score: ${body.alignment.score}`);
    });

    await test('Individual dashboard (student metrics)', async () => {
        const res = await fetch(`${AI_ENGINE}/api/analytics/dashboard/individual/${IDS.student1}`, {
            headers: aiHeaders(),
        });
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        const body = await res.json();
        assert(body.user_id === IDS.student1, 'Wrong user ID');

        console.log(`    → Status color: ${body.status_color}`);
        console.log(`    → Total messages: ${body.total_messages}`);
        console.log(`    → Avg quality: ${body.personal_metrics?.avg_quality_score}`);
        console.log(`    → HOT count: ${body.personal_metrics?.hot_count}`);
        console.log(`    → Radar: ${JSON.stringify(body.radar_chart_data)}`);
        console.log(`    → Advice: ${body.personal_advice?.[0]?.substring(0, 60)}`);
    });

    await test('Group analytics alias (Core API format)', async () => {
        const res = await fetch(`${AI_ENGINE}/api/analytics/group/${IDS.group}`, {
            headers: aiHeaders(),
        });
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        const body = await res.json();
        assert(body.success === true, 'Analytics failed');
        assert(body.group_id === IDS.group, 'Wrong group ID');

        console.log(`    → Quality score: ${body.quality_score}`);
        console.log(`    → Message count: ${body.message_count}`);
        console.log(`    → HOT%: ${body.hot_percentage}`);
        console.log(`    → Engagement: ${JSON.stringify(body.engagement_distribution)}`);
    });
}

async function testEngagementPipeline() {
    console.log('\n🧠 AI Engine: Engagement Analysis Pipeline');

    const testTexts = [
        { text: 'Mengapa collaborative learning lebih efektif dibanding individual learning? Bagaimana mekanismenya?', expected: 'cognitive', label: 'HOT cognitive question' },
        { text: 'Saya sudah submit tugas kelompok, tinggal menunggu feedback dari dosen', expected: 'behavioral', label: 'Behavioral task update' },
        { text: 'Terima kasih teman-teman, diskusi hari ini sangat menyenangkan dan bermanfaat', expected: 'emotional', label: 'Emotional appreciation' },
    ];

    for (const { text, expected, label } of testTexts) {
        await test(`Engagement: ${label}`, async () => {
            const res = await fetch(`${AI_ENGINE}/api/analytics/engagement`, {
                method: 'POST', headers: aiHeaders(),
                body: JSON.stringify({ text }),
            });
            const body = await res.json();
            assert(body.success === true, 'Analysis failed');
            console.log(`    → Type: ${body.engagement_type}, HOT: ${body.is_higher_order}, Lexical: ${body.lexical_variety}, Words: ${body.word_count}`);
        });
    }
}

async function testInterventionPipeline() {
    console.log('\n🔔 AI Engine: Intervention Pipeline');

    await test('Analyze discussion quality for intervention', async () => {
        const res = await fetch(`${AI_ENGINE}/api/intervention/analyze`, {
            method: 'POST', headers: aiHeaders(),
            body: JSON.stringify({
                messages: [
                    { sender: 'Student A', content: 'ok' },
                    { sender: 'Student B', content: 'iya setuju' },
                    { sender: 'Student A', content: 'sama' },
                    { sender: 'Student B', content: 'betul' },
                    { sender: 'Student A', content: 'yap' },
                ],
                topic: 'Collaborative Learning',
                chat_room_id: IDS.chatSpace,
            }),
        });
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        const body = await res.json();
        assert(body.success === true, 'Intervention analysis failed');
        console.log(`    → Should intervene: ${body.should_intervene}`);
        console.log(`    → Type: ${body.intervention_type}`);
        console.log(`    → Confidence: ${body.confidence}`);
        if (body.message) console.log(`    → Message: "${body.message.substring(0, 80)}..."`);
    });

    await test('Generate discussion summary', async () => {
        const messages = Array.from({ length: 12 }, (_, i) => ({
            sender: i % 2 === 0 ? 'Student A' : 'Student B',
            content: [
                'Mengapa collaborative learning efektif?',
                'Karena ada proses diskusi mendalam',
                'Bagaimana mengukur efektivitasnya?',
                'Bisa pakai pre-test dan post-test',
                'Setuju, juga bisa analisis transkrip',
                'Evaluasi perlu pertimbangkan kolaborasi',
                'Dampaknya meningkatkan berpikir kritis',
                'Melalui argumentasi dan debat',
                'Juga meningkatkan motivasi belajar',
                'Karena ada dukungan sosial',
                'Kesimpulannya collaborative learning sangat bermanfaat',
                'Setuju, mari kita terapkan',
            ][i],
        }));

        const res = await fetch(`${AI_ENGINE}/api/intervention/summary`, {
            method: 'POST', headers: aiHeaders(),
            body: JSON.stringify({
                messages,
                chat_room_id: IDS.chatSpace,
                include_action_items: true,
            }),
        });
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        const body = await res.json();
        assert(body.success === true, `Summary failed: ${JSON.stringify(body)}`);
        assert(body.summary?.length > 20, 'Summary too short');
        console.log(`    → Summary: "${body.summary.substring(0, 120)}..."`);
        console.log(`    → Message count: ${body.message_count}`);
    });

    await test('Generate Socratic discussion prompt', async () => {
        const res = await fetch(`${AI_ENGINE}/api/intervention/prompt`, {
            method: 'POST', headers: aiHeaders(),
            body: JSON.stringify({
                topic: 'Self-Regulated Learning',
                context: 'Mahasiswa sedang berdiskusi tentang strategi metakognitif',
                difficulty: 'hard',
            }),
        });
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        const body = await res.json();
        assert(body.success === true, 'Prompt generation failed');
        assert(body.prompt?.length > 20, 'Prompt too short');
        console.log(`    → Prompt: "${body.prompt.substring(0, 120)}..."`);
    });
}

async function testGoalValidationPipeline() {
    console.log('\n🎯 Goal Validation + Bloom Taxonomy');

    await test('Validate Bloom C4 goal (Menganalisis)', async () => {
        const res = await fetch(`${AI_ENGINE}/api/goals/validate`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${AI_SECRET}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                goal_text: 'Menganalisis dampak collaborative learning terhadap pemahaman konsep mahasiswa',
                user_id: IDS.student1,
                chat_space_id: IDS.chatSpace,
            }),
        });
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        const body = await res.json();
        assert(body.success === true, 'Validation failed');
        console.log(`    → Valid: ${body.is_valid}, Score: ${body.score}`);
        console.log(`    → Feedback: ${body.feedback?.substring(0, 80)}`);
        if (body.socratic_hint) console.log(`    → Socratic hint: ${body.socratic_hint.substring(0, 80)}`);
    });

    await test('Refine weak goal with Socratic guidance', async () => {
        const res = await fetch(`${AI_ENGINE}/api/goals/refine`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${AI_SECRET}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                current_goal: 'Belajar tentang collaborative learning',
                missing_criteria: '["higher_order_verb", "measurable_outcome"]',
            }),
        });
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        const body = await res.json();
        assert(body.success === true, `Refinement failed: ${JSON.stringify(body)}`);
        console.log(`    → Refined: "${body.refined_goal?.substring(0, 100)}"`);
        console.log(`    → Explanation: ${body.explanation?.substring(0, 80)}`);
    });
}

async function main() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  Kolabri E2E Analytics Pipeline Test                        ║');
    console.log('║  Real data → Real analytics → Real AI responses             ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');

    try {
        await seedData();
        await testCoreAPIGroupAnalytics();
        await testAIEngineDashboards();
        await testEngagementPipeline();
        await testInterventionPipeline();
        await testGoalValidationPipeline();
    } finally {
        await cleanup();
    }

    console.log('\n══════════════════════════════════════════════════════════════');
    console.log(`  Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
    console.log('══════════════════════════════════════════════════════════════');

    if (failed > 0) {
        console.log('\n  Failed tests:');
        results.filter(r => !r.ok).forEach(r => console.log(`    ❌ ${r.name}: ${r.detail}`));
    }

    process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
    console.error('Fatal error:', err);
    await cleanup().catch(() => {});
    process.exit(1);
});
