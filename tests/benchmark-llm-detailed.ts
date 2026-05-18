/**
 * Benchmark: LM Response Quality + Performance per Hit
 *
 * Shows per-request: latency, tokens, TPS, response length, content preview.
 * Compares across endpoints and runs to show LM variability.
 *
 * Run: ./node_modules/.bin/tsx tests/benchmark-llm-detailed.ts
 */

const AI_ENGINE = 'http://localhost:8001';
const AI_SECRET = 'shared-secret-key';

function aiHeaders() { return { Authorization: `Bearer ${AI_SECRET}`, 'Content-Type': 'application/json' }; }
function formHeaders() { return { Authorization: `Bearer ${AI_SECRET}`, 'Content-Type': 'application/x-www-form-urlencoded' }; }

interface HitResult {
    latencyMs: number;
    tokensUsed: number;
    tps: number;
    responseLength: number;
    preview: string;
    success: boolean;
}

interface EndpointReport {
    name: string;
    hits: HitResult[];
    avgLatency: number;
    avgTokens: number;
    avgTps: number;
    avgResponseLen: number;
    minLatency: number;
    maxLatency: number;
    minTps: number;
    maxTps: number;
}

function calcReport(name: string, hits: HitResult[]): EndpointReport {
    const valid = hits.filter(h => h.success);
    const avg = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
    return {
        name, hits,
        avgLatency: avg(valid.map(h => h.latencyMs)),
        avgTokens: avg(valid.map(h => h.tokensUsed)),
        avgTps: avg(valid.map(h => h.tps)),
        avgResponseLen: avg(valid.map(h => h.responseLength)),
        minLatency: Math.min(...valid.map(h => h.latencyMs)),
        maxLatency: Math.max(...valid.map(h => h.latencyMs)),
        minTps: Math.min(...valid.map(h => h.tps)),
        maxTps: Math.max(...valid.map(h => h.tps)),
    };
}

async function clearCache() {
    await fetch(`${AI_ENGINE}/api/efficiency/cache/clear`, { headers: { Authorization: `Bearer ${AI_SECRET}` } });
}

async function main() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  Kolabri LM Benchmark: Per-Hit Response Analysis            ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');

    await clearCache();

    const allReports: EndpointReport[] = [];

    // ── 1. Personal Chat ─────────────────────────────────────────────────
    console.log('\n🤖 Personal Chat (LM)');
    console.log('  #  │ Latency │ Tokens │   TPS   │ Chars │ Preview');
    console.log('  ───┼─────────┼────────┼─────────┼───────┼──────────────────────────────────────');

    const chatQuestions = [
        'Jelaskan apa itu self-regulated learning dalam 2 kalimat',
        'Apa perbedaan collaborative learning dan cooperative learning?',
        'Bagaimana cara meningkatkan motivasi belajar mahasiswa?',
        'Sebutkan 3 strategi metakognitif dalam belajar',
        'Apa hubungan antara scaffolding dan zone of proximal development?',
    ];

    const chatHits: HitResult[] = [];
    for (let i = 0; i < chatQuestions.length; i++) {
        const start = performance.now();
        const res = await fetch(`${AI_ENGINE}/api/chat/personal`, {
            method: 'POST', headers: aiHeaders(),
            body: JSON.stringify({ message: chatQuestions[i], history: [], user_name: 'Bench' }),
        });
        const latency = performance.now() - start;
        const body = await res.json();
        const tokens = body.tokens_used || 0;
        const reply = body.reply || '';
        const tps = tokens > 0 ? (tokens / (latency / 1000)) : 0;

        const hit: HitResult = {
            latencyMs: latency, tokensUsed: tokens, tps,
            responseLength: reply.length, preview: reply.substring(0, 60).replace(/\n/g, ' '),
            success: body.success === true,
        };
        chatHits.push(hit);

        const num = String(i + 1).padStart(2);
        const lat = (latency.toFixed(0) + 'ms').padStart(7);
        const tok = String(tokens).padStart(6);
        const tpsStr = tps.toFixed(1).padStart(7);
        const chars = String(reply.length).padStart(5);
        console.log(`  ${num} │ ${lat} │ ${tok} │ ${tpsStr} │ ${chars} │ ${hit.preview}...`);
    }
    allReports.push(calcReport('Personal Chat', chatHits));

    // ── 2. RAG Query ─────────────────────────────────────────────────────
    console.log('\n📚 RAG Query (embed + search + LM)');
    console.log('  #  │ Latency │ Tokens │   TPS   │ Chars │ Preview');
    console.log('  ───┼─────────┼────────┼─────────┼───────┼──────────────────────────────────────');

    await clearCache();
    const ragQueries = [
        'Apa itu collaborative learning dan apa dasar teorinya?',
        'Sebutkan manfaat collaborative learning dalam pendidikan',
        'Jelaskan fase-fase self-regulated learning',
        'Bagaimana taksonomi Bloom menilai kualitas diskusi?',
        'Apa peran AI dalam meningkatkan diskusi kolaboratif?',
    ];

    const ragHits: HitResult[] = [];
    for (let i = 0; i < ragQueries.length; i++) {
        const start = performance.now();
        const res = await fetch(`${AI_ENGINE}/api/ask`, {
            method: 'POST', headers: aiHeaders(),
            body: JSON.stringify({ query: ragQueries[i], course_id: 'e2e-rag-test' }),
        });
        const latency = performance.now() - start;
        const body = await res.json();
        const answer = body.answer || '';
        const tokens = body.tokens_used || Math.round(answer.length / 4);
        const tps = tokens > 0 ? (tokens / (latency / 1000)) : 0;

        const hit: HitResult = {
            latencyMs: latency, tokensUsed: tokens, tps,
            responseLength: answer.length, preview: answer.substring(0, 60).replace(/\n/g, ' '),
            success: body.success === true,
        };
        ragHits.push(hit);

        const num = String(i + 1).padStart(2);
        const lat = (latency.toFixed(0) + 'ms').padStart(7);
        const tok = String(tokens).padStart(6);
        const tpsStr = tps.toFixed(1).padStart(7);
        const chars = String(answer.length).padStart(5);
        console.log(`  ${num} │ ${lat} │ ${tok} │ ${tpsStr} │ ${chars} │ ${hit.preview}...`);
    }
    allReports.push(calcReport('RAG Query', ragHits));

    // ── 3. Goal Refinement ───────────────────────────────────────────────
    console.log('\n🎯 Goal Refinement (LM)');
    console.log('  #  │ Latency │ Tokens │   TPS   │ Chars │ Preview');
    console.log('  ───┼─────────┼────────┼─────────┼───────┼──────────────────────────────────────');

    await clearCache();
    const goalInputs = [
        { goal: 'Belajar tentang collaborative learning', criteria: '["higher_order_verb"]' },
        { goal: 'Memahami konsep SRL', criteria: '["measurable_outcome", "time_bound"]' },
        { goal: 'Mengetahui taksonomi Bloom', criteria: '["higher_order_verb", "specificity"]' },
    ];

    const goalHits: HitResult[] = [];
    for (let i = 0; i < goalInputs.length; i++) {
        const start = performance.now();
        const res = await fetch(`${AI_ENGINE}/api/goals/refine`, {
            method: 'POST', headers: formHeaders(),
            body: new URLSearchParams({
                current_goal: goalInputs[i].goal,
                missing_criteria: goalInputs[i].criteria,
            }),
        });
        const latency = performance.now() - start;
        const body = await res.json();
        const refined = body.refined_goal || '';
        const tokens = body.tokens_used || Math.round(refined.length / 4);
        const tps = tokens > 0 ? (tokens / (latency / 1000)) : 0;

        const hit: HitResult = {
            latencyMs: latency, tokensUsed: tokens, tps,
            responseLength: refined.length, preview: refined.substring(0, 60).replace(/[\n{}"]/g, ' ').trim(),
            success: body.success === true,
        };
        goalHits.push(hit);

        const num = String(i + 1).padStart(2);
        const lat = (latency.toFixed(0) + 'ms').padStart(7);
        const tok = String(tokens).padStart(6);
        const tpsStr = tps.toFixed(1).padStart(7);
        const chars = String(refined.length).padStart(5);
        console.log(`  ${num} │ ${lat} │ ${tok} │ ${tpsStr} │ ${chars} │ ${hit.preview}...`);
    }
    allReports.push(calcReport('Goal Refinement', goalHits));

    // ── 4. Discussion Summary ────────────────────────────────────────────
    console.log('\n📝 Discussion Summary (LM)');
    console.log('  #  │ Latency │ Tokens │   TPS   │ Chars │ Preview');
    console.log('  ───┼─────────┼────────┼─────────┼───────┼──────────────────────────────────────');

    await clearCache();
    const summaryHits: HitResult[] = [];
    for (let i = 0; i < 3; i++) {
        const msgs = Array.from({ length: 12 }, (_, j) => ({
            sender: j % 2 === 0 ? 'Student A' : 'Student B',
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
                'Kesimpulannya collaborative learning bermanfaat',
                'Setuju, mari kita terapkan',
            ][j],
        }));

        const start = performance.now();
        const res = await fetch(`${AI_ENGINE}/api/intervention/summary`, {
            method: 'POST', headers: aiHeaders(),
            body: JSON.stringify({ messages: msgs, chat_room_id: `bench-${i}`, include_action_items: true }),
        });
        const latency = performance.now() - start;
        const body = await res.json();
        const summary = body.summary || '';
        const tokens = body.tokens_used || Math.round(summary.length / 4);
        const tps = tokens > 0 ? (tokens / (latency / 1000)) : 0;

        const hit: HitResult = {
            latencyMs: latency, tokensUsed: tokens, tps,
            responseLength: summary.length, preview: summary.substring(0, 60).replace(/\n/g, ' '),
            success: body.success === true,
        };
        summaryHits.push(hit);

        const num = String(i + 1).padStart(2);
        const lat = (latency.toFixed(0) + 'ms').padStart(7);
        const tok = String(tokens).padStart(6);
        const tpsStr = tps.toFixed(1).padStart(7);
        const chars = String(summary.length).padStart(5);
        console.log(`  ${num} │ ${lat} │ ${tok} │ ${tpsStr} │ ${chars} │ ${hit.preview}...`);
    }
    allReports.push(calcReport('Discussion Summary', summaryHits));

    // ── 5. Socratic Prompt ───────────────────────────────────────────────
    console.log('\n💡 Socratic Prompt (LM)');
    console.log('  #  │ Latency │ Tokens │   TPS   │ Chars │ Preview');
    console.log('  ───┼─────────┼────────┼─────────┼───────┼──────────────────────────────────────');

    await clearCache();
    const promptTopics = [
        { topic: 'Self-Regulated Learning', difficulty: 'easy' },
        { topic: 'Collaborative Learning', difficulty: 'medium' },
        { topic: 'Taksonomi Bloom', difficulty: 'hard' },
    ];

    const promptHits: HitResult[] = [];
    for (let i = 0; i < promptTopics.length; i++) {
        const start = performance.now();
        const res = await fetch(`${AI_ENGINE}/api/intervention/prompt`, {
            method: 'POST', headers: aiHeaders(),
            body: JSON.stringify({
                topic: promptTopics[i].topic,
                context: 'Mahasiswa berdiskusi dalam kelompok kecil',
                difficulty: promptTopics[i].difficulty,
            }),
        });
        const latency = performance.now() - start;
        const body = await res.json();
        const prompt = body.prompt || '';
        const tokens = body.tokens_used || Math.round(prompt.length / 4);
        const tps = tokens > 0 ? (tokens / (latency / 1000)) : 0;

        const hit: HitResult = {
            latencyMs: latency, tokensUsed: tokens, tps,
            responseLength: prompt.length, preview: prompt.substring(0, 60).replace(/\n/g, ' '),
            success: body.success === true,
        };
        promptHits.push(hit);

        const num = String(i + 1).padStart(2);
        const lat = (latency.toFixed(0) + 'ms').padStart(7);
        const tok = String(tokens).padStart(6);
        const tpsStr = tps.toFixed(1).padStart(7);
        const chars = String(prompt.length).padStart(5);
        console.log(`  ${num} │ ${lat} │ ${tok} │ ${tpsStr} │ ${chars} │ ${hit.preview}...`);
    }
    allReports.push(calcReport('Socratic Prompt', promptHits));

    // ── Summary ──────────────────────────────────────────────────────────
    console.log('\n');
    console.log('╔═══════════════════════════════════════════════════════════════════════════════════════════════╗');
    console.log('║  LM PERFORMANCE SUMMARY (per endpoint)                                                      ║');
    console.log('╠═══════════════════════════════════════════════════════════════════════════════════════════════╣');
    console.log('║  Endpoint              │ Avg Lat  │ Min-Max Lat    │ Avg Tok │ Avg TPS │ TPS Range   │ Chars ║');
    console.log('╠═══════════════════════════════════════════════════════════════════════════════════════════════╣');

    for (const r of allReports) {
        const name = r.name.padEnd(22);
        const avgLat = (r.avgLatency.toFixed(0) + 'ms').padStart(8);
        const range = `${r.minLatency.toFixed(0)}-${r.maxLatency.toFixed(0)}ms`.padStart(14);
        const avgTok = r.avgTokens.toFixed(0).padStart(7);
        const avgTps = r.avgTps.toFixed(1).padStart(7);
        const tpsRange = `${r.minTps.toFixed(1)}-${r.maxTps.toFixed(1)}`.padStart(11);
        const chars = r.avgResponseLen.toFixed(0).padStart(5);
        console.log(`║  ${name} │ ${avgLat} │ ${range} │ ${avgTok} │ ${avgTps} │ ${tpsRange} │ ${chars} ║`);
    }

    console.log('╚═══════════════════════════════════════════════════════════════════════════════════════════════╝');

    console.log('\n  TPS = Tokens Per Second (higher = faster LM generation)');
    console.log('  Variability in TPS shows LM server load fluctuation per request');

    process.exit(0);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
