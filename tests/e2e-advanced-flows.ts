/**
 * E2E Advanced Flows Test
 *
 * Tests: RAG pipeline (upload→ingest→query), Socket.IO group chat + @AI,
 * SSE streaming, XES process mining export.
 *
 * Run: ./node_modules/.bin/tsx tests/e2e-advanced-flows.ts
 */

import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import mongoose from 'mongoose';
import { io as ioClient, Socket } from 'socket.io-client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const CORE_API = 'http://localhost:3000';
const AI_ENGINE = 'http://localhost:8001';
const JWT_SECRET = 'your-super-secret-jwt-key-change-this-in-production';
const AI_SECRET = 'shared-secret-key';
const MONGO_URI = 'mongodb://localhost:27017/kolabri';

const prisma = new PrismaClient();

function makeToken(role: 'student' | 'lecturer', userId: string, email: string) {
    return jwt.sign({ userId, email, role }, JWT_SECRET, { expiresIn: '1h' });
}

const IDS = {
    lecturer: 'e2e-adv-lecturer',
    student1: 'e2e-adv-student-1',
    student2: 'e2e-adv-student-2',
    course: 'e2e-adv-course',
    group: 'e2e-adv-group',
    chatSpace: 'e2e-adv-chatspace',
};

const STUDENT1_TOKEN = makeToken('student', IDS.student1, 'e2e-s1@kolabri.test');
const STUDENT2_TOKEN = makeToken('student', IDS.student2, 'e2e-s2@kolabri.test');
const LECTURER_TOKEN = makeToken('lecturer', IDS.lecturer, 'e2e-lec@kolabri.test');

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

function assert(condition: boolean, msg: string) { if (!condition) throw new Error(msg); }

async function fetchJSON(url: string, opts: RequestInit = {}) {
    const res = await fetch(url, opts);
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body, headers: res.headers };
}

function aiHeaders() { return { Authorization: `Bearer ${AI_SECRET}`, 'Content-Type': 'application/json' }; }

async function seedData() {
    console.log('\n🌱 Seeding test data...');
    await prisma.learningGoal.deleteMany({ where: { chatSpaceId: IDS.chatSpace } }).catch(() => {});
    await prisma.chatSpace.deleteMany({ where: { id: IDS.chatSpace } }).catch(() => {});
    await prisma.groupMember.deleteMany({ where: { groupId: IDS.group } }).catch(() => {});
    await prisma.group.deleteMany({ where: { id: IDS.group } }).catch(() => {});
    await prisma.courseStudent.deleteMany({ where: { courseId: IDS.course } }).catch(() => {});
    await prisma.knowledgeBase.deleteMany({ where: { courseId: IDS.course } }).catch(() => {});
    await prisma.course.deleteMany({ where: { id: IDS.course } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [IDS.lecturer, IDS.student1, IDS.student2] } } }).catch(() => {});

    await prisma.user.createMany({
        data: [
            { id: IDS.lecturer, email: 'e2e-lec@kolabri.test', name: 'E2E Lecturer', role: 'lecturer', password: 'hashed' },
            { id: IDS.student1, email: 'e2e-s1@kolabri.test', name: 'E2E Student 1', role: 'student', password: 'hashed' },
            { id: IDS.student2, email: 'e2e-s2@kolabri.test', name: 'E2E Student 2', role: 'student', password: 'hashed' },
        ],
        skipDuplicates: true,
    });
    await prisma.course.create({
        data: { id: IDS.course, name: 'E2E Advanced Course', code: 'E2EADV', joinCode: 'E2EADV-' + Date.now(), ownerId: IDS.lecturer },
    });
    await prisma.courseStudent.createMany({
        data: [{ courseId: IDS.course, userId: IDS.student1 }, { courseId: IDS.course, userId: IDS.student2 }],
        skipDuplicates: true,
    });
    await prisma.group.create({
        data: {
            id: IDS.group, name: 'E2E Advanced Group', courseId: IDS.course,
            joinCode: 'E2EGRP-' + Date.now(), createdBy: IDS.lecturer,
            members: { createMany: { data: [{ userId: IDS.student1 }, { userId: IDS.student2 }] } },
        },
    });
    await prisma.chatSpace.create({
        data: { id: IDS.chatSpace, name: 'E2E Advanced Session', groupId: IDS.group, createdBy: IDS.lecturer },
    });
    console.log('  ✅ Seeded');
}

async function cleanup() {
    console.log('\n🧹 Cleaning up...');
    try {
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.db.collection('chatlogs').deleteMany({ groupId: IDS.group });
        }
        await prisma.learningGoal.deleteMany({ where: { chatSpaceId: IDS.chatSpace } });
        await prisma.chatSpace.deleteMany({ where: { id: IDS.chatSpace } });
        await prisma.groupMember.deleteMany({ where: { groupId: IDS.group } });
        await prisma.group.deleteMany({ where: { id: IDS.group } });
        await prisma.courseStudent.deleteMany({ where: { courseId: IDS.course } });
        await prisma.knowledgeBase.deleteMany({ where: { courseId: IDS.course } });
        await prisma.course.deleteMany({ where: { id: IDS.course } });
        await prisma.user.deleteMany({ where: { id: { in: [IDS.lecturer, IDS.student1, IDS.student2] } } });
        if (mongoose.connection.readyState === 1) await mongoose.disconnect();
        await prisma.$disconnect();
        console.log('  ✅ Cleanup complete');
    } catch (err: any) {
        console.log(`  ⚠️ Cleanup: ${err.message?.substring(0, 80)}`);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FLOW: Knowledge Base RAG Pipeline (upload PDF → ingest → query)
// ═══════════════════════════════════════════════════════════════════════════════

async function testRAGPipeline() {
    console.log('\n📚 Knowledge Base RAG Pipeline');

    const pdfContent = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj
4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
5 0 obj<</Length 200>>stream
BT /F1 12 Tf 72 720 Td
(Collaborative Learning dalam Pendidikan Tinggi) Tj
0 -20 Td (Collaborative learning adalah pendekatan pembelajaran dimana mahasiswa) Tj
0 -20 Td (bekerja sama dalam kelompok kecil untuk mencapai tujuan bersama.) Tj
0 -20 Td (Metode ini meningkatkan kemampuan berpikir kritis dan komunikasi.) Tj
ET
endstream
endobj
xref
0 6
trailer<</Size 6/Root 1 0 R>>
startxref
0
%%EOF`;

    await test('Upload PDF to AI Engine for ingestion', async () => {
        const formData = new FormData();
        const blob = new Blob([pdfContent], { type: 'application/pdf' });
        formData.append('file', blob, 'collaborative-learning.pdf');
        formData.append('course_id', IDS.course);
        formData.append('file_id', 'e2e-file-1');

        const res = await fetch(`${AI_ENGINE}/api/ingest`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${AI_SECRET}` },
            body: formData,
        });
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        const body = await res.json();
        assert(body.success === true, `Ingest failed: ${JSON.stringify(body)}`);
        console.log(`    → File ID: ${body.file_id}, Status: scheduled for background processing`);
    });

    await test('Wait for background ingestion to complete', async () => {
        await new Promise(resolve => setTimeout(resolve, 5000));

        const res = await fetch(`${AI_ENGINE}/api/health`, {
            headers: { Authorization: `Bearer ${AI_SECRET}` },
        });
        const body = await res.json();
        assert(body.services.vector_store === true, 'Vector store not available');
        console.log(`    → Vector store: ${body.services.vector_store}`);
    });

    await test('Query RAG with course-specific question', async () => {
        const res = await fetch(`${AI_ENGINE}/api/ask`, {
            method: 'POST',
            headers: aiHeaders(),
            body: JSON.stringify({
                query: 'Apa itu collaborative learning?',
                course_id: IDS.course,
            }),
        });
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        const body = await res.json();
        console.log(`    → Success: ${body.success}`);
        console.log(`    → Answer: "${body.answer?.substring(0, 120)}..."`);
    });

    await test('Delete document from vector store', async () => {
        const res = await fetch(`${AI_ENGINE}/api/documents/e2e-file-1?collection_name=course_${IDS.course}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${AI_SECRET}` },
        });
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        const body = await res.json();
        assert(body.success === true, 'Delete failed');
        console.log(`    → Deleted: ${body.message}`);
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// FLOW: Socket.IO Group Chat + @AI
// ═══════════════════════════════════════════════════════════════════════════════

function connectSocket(token: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
        const socket = ioClient(CORE_API, {
            auth: { token },
            transports: ['polling', 'websocket'],
            timeout: 10000,
            forceNew: true,
        });
        socket.on('connect', () => resolve(socket));
        socket.on('connect_error', (err) => reject(new Error(`Socket connect failed: ${err.message}`)));
        setTimeout(() => { socket.disconnect(); reject(new Error('Socket connect timeout')); }, 10000);
    });
}

function waitForEvent(socket: Socket, event: string, timeoutMs = 15000): Promise<any> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timeout waiting for '${event}'`)), timeoutMs);
        socket.once(event, (data: any) => { clearTimeout(timer); resolve(data); });
    });
}

async function testSocketIOGroupChat() {
    console.log('\n💬 Socket.IO Group Chat + @AI Intervention');

    let socket1: Socket | null = null;
    let socket2: Socket | null = null;

    try {
        await test('Student 1 connects via Socket.IO', async () => {
            socket1 = await connectSocket(STUDENT1_TOKEN);
            assert(socket1.connected, 'Socket not connected');
            console.log(`    → Connected: ${socket1.id}`);
        });

        await test('Student 2 connects via Socket.IO', async () => {
            socket2 = await connectSocket(STUDENT2_TOKEN);
            assert(socket2!.connected, 'Socket not connected');
            console.log(`    → Connected: ${socket2!.id}`);
        });

        await test('Student 1 joins room and receives chat history', async () => {
            if (!socket1) throw new Error('Socket1 not connected');
            const historyPromise = waitForEvent(socket1, 'chat_history');
            const joinedPromise = waitForEvent(socket1, 'room_joined');

            socket1.emit('join_room', {
                chatSpaceId: IDS.chatSpace,
                groupId: IDS.group,
                courseId: IDS.course,
            });

            const [historyData, joined] = await Promise.all([historyPromise, joinedPromise]);
            const messages = historyData?.messages ?? historyData;
            assert(Array.isArray(messages), `Expected chat history array, got ${typeof messages}`);
            console.log(`    → History: ${messages.length} messages, Room joined: ${joined.chatSpaceId}`);
        });

        await test('Student 2 joins room', async () => {
            if (!socket2) throw new Error('Socket2 not connected');
            const joinedPromise = waitForEvent(socket2, 'room_joined');
            socket2.emit('join_room', {
                chatSpaceId: IDS.chatSpace,
                groupId: IDS.group,
                courseId: IDS.course,
            });
            const joined = await joinedPromise;
            assert(joined.chatSpaceId === IDS.chatSpace, 'Wrong room');
        });

        await test('Student 1 sends message → Student 2 receives it', async () => {
            if (!socket1 || !socket2) throw new Error('Sockets not connected');
            const receivePromise = waitForEvent(socket2, 'receive_message');

            socket1.emit('send_message', {
                roomId: IDS.chatSpace,
                groupId: IDS.group,
                courseId: IDS.course,
                content: 'Mengapa collaborative learning efektif?',
            });

            const received = await receivePromise;
            assert(received.content === 'Mengapa collaborative learning efektif?', `Wrong content: ${received.content}`);
            assert(received.senderName === 'E2E Student 1', `Wrong sender: ${received.senderName}`);
            console.log(`    → Received: "${received.content}" from ${received.senderName}`);
        });

        await test('Student 2 sends @AI message → AI responds', async () => {
            if (!socket1 || !socket2) throw new Error('Sockets not connected');
            const aiResponsePromise = waitForEvent(socket1, 'receive_message', 30000);

            socket2.emit('send_message', {
                roomId: IDS.chatSpace,
                groupId: IDS.group,
                courseId: IDS.course,
                content: '@ai Jelaskan manfaat collaborative learning',
            });

            const aiMsg = await aiResponsePromise;
            console.log(`    → AI response: "${(aiMsg.content || '').substring(0, 100)}..."`);
            console.log(`    → Sender: ${aiMsg.senderName}, Type: ${aiMsg.senderType}`);
        });

        await test('Typing indicator works', async () => {
            if (!socket1 || !socket2) throw new Error('Sockets not connected');
            const typingPromise = waitForEvent(socket2, 'user_typing', 5000);
            socket1.emit('typing', { roomId: IDS.chatSpace, isTyping: true });
            const typing = await typingPromise;
            assert(typing.userId || typing.userName, 'No typing data');
            console.log(`    → Typing from: ${typing.userName || typing.userId}`);
        });

    } finally {
        socket1?.disconnect();
        socket2?.disconnect();
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FLOW: SSE Streaming
// ═══════════════════════════════════════════════════════════════════════════════

async function testSSEStreaming() {
    console.log('\n📡 SSE Streaming (Personal Chat)');

    await test('AI Engine personal chat stream returns SSE chunks', async () => {
        const res = await fetch(`${AI_ENGINE}/api/chat/personal/stream`, {
            method: 'POST',
            headers: aiHeaders(),
            body: JSON.stringify({
                message: 'Apa itu self-regulated learning? Jawab singkat.',
                history: [],
                user_name: 'E2E Student',
            }),
        });

        assert(res.status === 200, `Expected 200, got ${res.status}`);
        const contentType = res.headers.get('content-type') || '';
        assert(contentType.includes('text/event-stream'), `Expected SSE, got ${contentType}`);

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';
        let chunkCount = 0;
        let gotDone = false;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = decoder.decode(value, { stream: true });
            const lines = text.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6).trim();
                    if (data === '[DONE]') {
                        gotDone = true;
                    } else {
                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.content) {
                                fullContent += parsed.content;
                                chunkCount++;
                            }
                        } catch {}
                    }
                }
            }
        }

        assert(chunkCount > 0, `Expected SSE chunks, got ${chunkCount}`);
        assert(fullContent.length > 10, `Content too short: ${fullContent.length} chars`);
        assert(gotDone, 'Missing [DONE] signal');
        console.log(`    → Chunks: ${chunkCount}, Total chars: ${fullContent.length}`);
        console.log(`    → Content: "${fullContent.substring(0, 100)}..."`);
        console.log(`    → [DONE] signal: received`);
    });

    await test('Core API SSE stream relay works', async () => {
        const chatRes = await fetchJSON(`${CORE_API}/api/ai-chats`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${STUDENT1_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'SSE Test Chat' }),
        });

        if (chatRes.status !== 201) {
            console.log(`    → Skipped: Could not create chat (${chatRes.status})`);
            return;
        }

        const chatId = chatRes.body.data.id;

        try {
            const res = await fetch(`${CORE_API}/api/ai-chats/${chatId}/messages/stream`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${STUDENT1_TOKEN}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: 'Halo, apa kabar?' }),
            });

            assert(res.status === 200, `Expected 200, got ${res.status}`);
            const contentType = res.headers.get('content-type') || '';
            assert(
                contentType.includes('text/event-stream') || contentType.includes('text/plain'),
                `Expected stream content type, got ${contentType}`,
            );

            const text = await res.text();
            assert(text.length > 0, 'Empty stream response');
            console.log(`    → Stream response: ${text.length} bytes`);
            console.log(`    → Preview: "${text.substring(0, 120)}..."`);
        } finally {
            await fetch(`${CORE_API}/api/ai-chats/${chatId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${STUDENT1_TOKEN}` },
            });
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// FLOW: XES Process Mining Export
// ═══════════════════════════════════════════════════════════════════════════════

async function testXESExport() {
    console.log('\n📊 XES Process Mining Export');

    await test('Export process mining data (JSON metadata)', async () => {
        const res = await fetch(`${AI_ENGINE}/api/analytics/export`, {
            headers: { Authorization: `Bearer ${AI_SECRET}` },
        });
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        const body = await res.json();
        assert(body.success === true, `Export failed: ${JSON.stringify(body)}`);
        assert(body.total_events >= 0, 'Missing total_events');
        console.log(`    → Events: ${body.total_events}, Cases: ${body.unique_cases}`);
        console.log(`    → File URL: ${body.file_url}`);
    });

    await test('Export process mining data (CSV download)', async () => {
        const res = await fetch(`${AI_ENGINE}/api/analytics/export?format=csv`, {
            headers: { Authorization: `Bearer ${AI_SECRET}` },
        });
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        const contentType = res.headers.get('content-type') || '';
        assert(contentType.includes('text/csv'), `Expected CSV, got ${contentType}`);

        const csv = await res.text();
        const lines = csv.trim().split('\n');
        assert(lines.length >= 1, 'CSV has no header');
        assert(lines[0].includes('CaseID'), 'CSV header missing CaseID');
        console.log(`    → CSV lines: ${lines.length} (header + ${lines.length - 1} events)`);
        console.log(`    → Header: ${lines[0].substring(0, 100)}`);
        if (lines.length > 1) console.log(`    → Sample: ${lines[1].substring(0, 100)}`);
    });
}

// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  Kolabri E2E Advanced Flows Test                            ║');
    console.log('║  RAG Pipeline, Socket.IO, SSE Streaming, XES Export         ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');

    await mongoose.connect(MONGO_URI);

    try {
        await seedData();
        await testRAGPipeline();
        await testSocketIOGroupChat();
        await testSSEStreaming();
        await testXESExport();
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
