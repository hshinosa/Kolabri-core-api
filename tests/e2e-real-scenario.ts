/**
 * E2E Real Scenario Test — hits live services
 *
 * Prerequisites: Core API (:3000), AI Engine (:8001), PostgreSQL, MongoDB, Redis all running.
 *
 * Run: npx tsx tests/e2e-real-scenario.ts
 */

import jwt from 'jsonwebtoken';

const CORE_API = 'http://localhost:3000';
const AI_ENGINE = 'http://localhost:8001';
const JWT_SECRET = 'your-super-secret-jwt-key-change-this-in-production';
const AI_ENGINE_SECRET = 'shared-secret-key';

function makeToken(role: 'student' | 'lecturer', userId: string, email: string) {
    return jwt.sign({ userId, email, role }, JWT_SECRET, { expiresIn: '1h' });
}

const STUDENT_TOKEN = makeToken('student', '53cfcada-34c2-4d6d-8b1c-2cb8db83f474', 'hashfih12@gmail.com');
const LECTURER_TOKEN = makeToken('lecturer', 'test-lecturer-001', 'lecturer@kolabri.test');

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

function authHeaders(token: string) {
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FLOW 0: Service Health
// ═══════════════════════════════════════════════════════════════════════════════

async function testServiceHealth() {
    console.log('\n🏥 Flow 0: Service Health');

    await test('Core API is healthy', async () => {
        const { status, body } = await fetchJSON(`${CORE_API}/health`);
        assert(status === 200, `Expected 200, got ${status}`);
        assert(body.status === 'ok', `Expected ok, got ${body.status}`);
        assert(body.services.postgres === 'up', 'PostgreSQL not up');
        assert(body.services.mongodb === 'up', 'MongoDB not up');
    });

    await test('AI Engine is healthy', async () => {
        const res = await fetch(`${AI_ENGINE}/api/health`, {
            headers: { Authorization: `Bearer ${AI_ENGINE_SECRET}` },
        });
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        const body = await res.json();
        assert(body.services.llm === true, 'LLM service not available');
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// FLOW 1: Student AI Chat
// ═══════════════════════════════════════════════════════════════════════════════

async function testStudentAIChat() {
    console.log('\n💬 Flow 1: Student AI Chat');

    let chatId: string;

    await test('Create new AI chat', async () => {
        const { status, body } = await fetchJSON(`${CORE_API}/api/ai-chats`, {
            method: 'POST',
            headers: authHeaders(STUDENT_TOKEN),
            body: JSON.stringify({ title: 'E2E Test Chat' }),
        });
        assert(status === 201, `Expected 201, got ${status}: ${JSON.stringify(body)}`);
        assert(body.data?.id, 'No chat ID returned');
        chatId = body.data.id;
    });

    await test('List user chats includes new chat', async () => {
        const { status, body } = await fetchJSON(`${CORE_API}/api/ai-chats`, {
            headers: authHeaders(STUDENT_TOKEN),
        });
        assert(status === 200, `Expected 200, got ${status}`);
        assert(Array.isArray(body.data), 'Expected array');
        const found = body.data.find((c: any) => c.id === chatId);
        assert(!!found, `Chat ${chatId} not found in list`);
    });

    await test('Send message and get AI response', async () => {
        const { status, body } = await fetchJSON(`${CORE_API}/api/ai-chats/${chatId}/messages`, {
            method: 'POST',
            headers: authHeaders(STUDENT_TOKEN),
            body: JSON.stringify({ content: 'Apa itu collaborative learning?' }),
        });
        assert(status === 200, `Expected 200, got ${status}: ${JSON.stringify(body)}`);
        assert(body.data?.userMessage?.content, 'No user message');
        assert(body.data?.assistantMessage?.content, 'No assistant response');
        console.log(`    → AI replied: "${body.data.assistantMessage.content.substring(0, 80)}..."`);
    });

    await test('Get chat messages', async () => {
        const { status, body } = await fetchJSON(`${CORE_API}/api/ai-chats/${chatId}/messages`, {
            headers: authHeaders(STUDENT_TOKEN),
        });
        assert(status === 200, `Expected 200, got ${status}`);
        assert(body.data?.length >= 2, `Expected >= 2 messages, got ${body.data?.length}`);
    });

    await test('Delete chat', async () => {
        const { status, body } = await fetchJSON(`${CORE_API}/api/ai-chats/${chatId}`, {
            method: 'DELETE',
            headers: authHeaders(STUDENT_TOKEN),
        });
        assert(status === 200, `Expected 200, got ${status}`);
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// FLOW 6: SRL Analysis & Engagement (AI Engine direct)
// ═══════════════════════════════════════════════════════════════════════════════

async function testSRLAnalysis() {
    console.log('\n📊 Flow 6: SRL Analysis & Engagement');

    await test('Analyze cognitive engagement (Indonesian)', async () => {
        const res = await fetch(`${AI_ENGINE}/api/analytics/engagement`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${AI_ENGINE_SECRET}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: 'Mengapa konsep ini penting? Bagaimana penerapannya dalam konteks pendidikan?' }),
        });
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        const body = await res.json();
        assert(body.success === true, 'Analysis failed');
        assert(body.engagement_type === 'cognitive', `Expected cognitive, got ${body.engagement_type}`);
        assert(body.is_higher_order === true, 'Expected higher order thinking');
        assert(body.hot_indicators.length > 0, 'Expected HOT indicators');
        console.log(`    → Type: ${body.engagement_type}, HOT: ${body.is_higher_order}, Indicators: ${body.hot_indicators.join(', ')}`);
    });

    await test('Analyze behavioral engagement', async () => {
        const res = await fetch(`${AI_ENGINE}/api/analytics/engagement`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${AI_ENGINE_SECRET}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: 'Saya akan submit tugas ini sebelum deadline, sudah selesai progress saya' }),
        });
        const body = await res.json();
        assert(body.success === true, 'Analysis failed');
        assert(['behavioral', 'cognitive'].includes(body.engagement_type), `Expected behavioral or cognitive, got ${body.engagement_type}`);
        console.log(`    → Type: ${body.engagement_type}, Lexical: ${body.lexical_variety}`);
    });

    await test('Analyze emotional engagement', async () => {
        const res = await fetch(`${AI_ENGINE}/api/analytics/engagement`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${AI_ENGINE_SECRET}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: 'Bagus sekali terima kasih mantap senang bisa paham' }),
        });
        const body = await res.json();
        assert(body.success === true, 'Analysis failed');
        assert(body.engagement_type === 'emotional', `Expected emotional, got ${body.engagement_type}`);
        console.log(`    → Type: ${body.engagement_type}, Lexical: ${body.lexical_variety}`);
    });

    await test('Lexical variety calculation', async () => {
        const res = await fetch(`${AI_ENGINE}/api/analytics/engagement`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${AI_ENGINE_SECRET}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: 'kata kata kata sama sama sama berulang berulang berulang' }),
        });
        const body = await res.json();
        assert(body.success === true, 'Analysis failed');
        assert(body.lexical_variety < 0.8, `Expected low lexical variety, got ${body.lexical_variety}`);
        console.log(`    → Lexical variety: ${body.lexical_variety} (low = repetitive text)`);
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// FLOW 3: Goal Validation with Bloom Taxonomy (AI Engine direct)
// ═══════════════════════════════════════════════════════════════════════════════

async function testGoalBloom() {
    console.log('\n🎯 Flow 3: Goal Validation + Bloom Taxonomy');

    await test('Validate goal with Bloom verb (C4: Menganalisis)', async () => {
        const res = await fetch(`${AI_ENGINE}/api/goals/validate`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${AI_ENGINE_SECRET}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                goal_text: 'Menganalisis dampak perubahan iklim terhadap ekosistem laut Indonesia',
                user_id: 'e2e-student-1',
                chat_space_id: 'e2e-cs-1',
            }),
        });
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        const body = await res.json();
        assert(body.success === true, `Validation failed: ${JSON.stringify(body)}`);
        console.log(`    → Valid: ${body.is_valid}, Score: ${body.score}, Feedback: ${body.feedback?.substring(0, 60)}...`);
    });

    await test('Validate goal without Bloom verb', async () => {
        const res = await fetch(`${AI_ENGINE}/api/goals/validate`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${AI_ENGINE_SECRET}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                goal_text: 'Belajar tentang iklim',
                user_id: 'e2e-student-1',
                chat_space_id: 'e2e-cs-1',
            }),
        });
        const body = await res.json();
        assert(body.success === true, 'Request should succeed');
        console.log(`    → Valid: ${body.is_valid}, Hint: ${body.socratic_hint?.substring(0, 60) || 'none'}...`);
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// FLOW AI: Personal Chat (AI Engine direct)
// ═══════════════════════════════════════════════════════════════════════════════

async function testAIEnginePersonalChat() {
    console.log('\n🤖 AI Engine: Personal Chat');

    await test('Personal chat returns AI response', async () => {
        const res = await fetch(`${AI_ENGINE}/api/chat/personal`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${AI_ENGINE_SECRET}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: 'Jelaskan apa itu self-regulated learning dalam 2 kalimat',
                history: [],
                user_name: 'E2E Student',
            }),
        });
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        const body = await res.json();
        assert(body.success === true, `Chat failed: ${body.error}`);
        assert(body.reply?.length > 10, 'Reply too short');
        console.log(`    → Reply: "${body.reply.substring(0, 100)}..."`);
        console.log(`    → Tokens used: ${body.tokens_used}`);
    });

    await test('Personal chat with history context', async () => {
        const res = await fetch(`${AI_ENGINE}/api/chat/personal`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${AI_ENGINE_SECRET}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: 'Berikan contoh penerapannya',
                history: [
                    { role: 'user', content: 'Apa itu collaborative learning?' },
                    { role: 'assistant', content: 'Collaborative learning adalah pendekatan pembelajaran di mana siswa bekerja sama dalam kelompok.' },
                ],
                user_name: 'E2E Student',
            }),
        });
        const body = await res.json();
        assert(body.success === true, `Chat failed: ${body.error}`);
        assert(body.reply?.length > 10, 'Reply too short');
        console.log(`    → Reply: "${body.reply.substring(0, 100)}..."`);
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// FLOW: Intervention Analysis (AI Engine direct)
// ═══════════════════════════════════════════════════════════════════════════════

async function testInterventionAnalysis() {
    console.log('\n🔔 AI Engine: Intervention Analysis');

    await test('Analyze low-quality discussion for intervention', async () => {
        const res = await fetch(`${AI_ENGINE}/api/intervention/analyze`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${AI_ENGINE_SECRET}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [
                    { sender: 'Student A', content: 'ok' },
                    { sender: 'Student B', content: 'iya' },
                    { sender: 'Student A', content: 'setuju' },
                    { sender: 'Student B', content: 'sama' },
                    { sender: 'Student A', content: 'betul' },
                ],
                topic: 'Collaborative Learning',
                chat_room_id: 'e2e-room-1',
            }),
        });
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        const body = await res.json();
        assert(body.success === true, `Analysis failed: ${JSON.stringify(body)}`);
        console.log(`    → Should intervene: ${body.should_intervene}, Type: ${body.intervention_type}, Confidence: ${body.confidence}`);
        if (body.message) console.log(`    → Message: "${body.message.substring(0, 80)}..."`);
    });

    await test('Generate discussion prompt', async () => {
        const res = await fetch(`${AI_ENGINE}/api/intervention/prompt`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${AI_ENGINE_SECRET}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                topic: 'Self-Regulated Learning',
                context: 'Mahasiswa sedang berdiskusi tentang strategi belajar',
                difficulty: 'medium',
            }),
        });
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        const body = await res.json();
        assert(body.success === true, `Prompt generation failed`);
        assert(body.prompt?.length > 10, 'Prompt too short');
        console.log(`    → Prompt: "${body.prompt.substring(0, 100)}..."`);
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  Kolabri E2E Real Scenario Test                             ║');
    console.log('║  Testing live services with real AI responses               ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');

    await testServiceHealth();
    await testStudentAIChat();
    await testSRLAnalysis();
    await testGoalBloom();
    await testAIEnginePersonalChat();
    await testInterventionAnalysis();

    console.log('\n══════════════════════════════════════════════════════════════');
    console.log(`  Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
    console.log('══════════════════════════════════════════════════════════════');

    if (failed > 0) {
        console.log('\n  Failed tests:');
        results.filter(r => !r.ok).forEach(r => console.log(`    ❌ ${r.name}: ${r.detail}`));
    }

    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
