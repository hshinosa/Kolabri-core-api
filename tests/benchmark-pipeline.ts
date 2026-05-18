/**
 * Benchmark Pipeline Test
 *
 * Measures: RAG latency, RPS, embedding throughput, LM latency, analytics speed.
 * Requires: AI Engine (:8001) + Qdrant (:6333) running with test data.
 *
 * Run: ./node_modules/.bin/tsx tests/benchmark-pipeline.ts
 */

const AI_ENGINE = 'http://localhost:8001';
const AI_SECRET = 'shared-secret-key';

function aiHeaders() { return { Authorization: `Bearer ${AI_SECRET}`, 'Content-Type': 'application/json' }; }

interface BenchmarkResult {
    name: string;
    samples: number;
    avgMs: number;
    minMs: number;
    maxMs: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    rps: number;
    errors: number;
}

function percentile(sorted: number[], p: number): number {
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
}

function formatResult(r: BenchmarkResult): string {
    return [
        `  ${r.name}`,
        `    Samples: ${r.samples} (${r.errors} errors)`,
        `    Avg: ${r.avgMs.toFixed(0)}ms | Min: ${r.minMs.toFixed(0)}ms | Max: ${r.maxMs.toFixed(0)}ms`,
        `    P50: ${r.p50Ms.toFixed(0)}ms | P95: ${r.p95Ms.toFixed(0)}ms | P99: ${r.p99Ms.toFixed(0)}ms`,
        `    RPS: ${r.rps.toFixed(2)}`,
    ].join('\n');
}

async function benchmark(
    name: string,
    fn: () => Promise<boolean>,
    opts: { iterations?: number; concurrency?: number; warmup?: number } = {},
): Promise<BenchmarkResult> {
    const { iterations = 10, concurrency = 1, warmup = 1 } = opts;

    for (let i = 0; i < warmup; i++) await fn().catch(() => false);

    const latencies: number[] = [];
    let errors = 0;
    const startAll = performance.now();

    if (concurrency <= 1) {
        for (let i = 0; i < iterations; i++) {
            const start = performance.now();
            const ok = await fn().catch(() => false);
            latencies.push(performance.now() - start);
            if (!ok) errors++;
        }
    } else {
        const batches = Math.ceil(iterations / concurrency);
        for (let b = 0; b < batches; b++) {
            const batchSize = Math.min(concurrency, iterations - b * concurrency);
            const promises = Array.from({ length: batchSize }, async () => {
                const start = performance.now();
                const ok = await fn().catch(() => false);
                latencies.push(performance.now() - start);
                if (!ok) errors++;
            });
            await Promise.all(promises);
        }
    }

    const totalMs = performance.now() - startAll;
    const sorted = [...latencies].sort((a, b) => a - b);
    const avg = sorted.reduce((s, v) => s + v, 0) / sorted.length;

    return {
        name,
        samples: iterations,
        avgMs: avg,
        minMs: sorted[0],
        maxMs: sorted[sorted.length - 1],
        p50Ms: percentile(sorted, 50),
        p95Ms: percentile(sorted, 95),
        p99Ms: percentile(sorted, 99),
        rps: (iterations / totalMs) * 1000,
        errors,
    };
}

async function ensureTestData() {
    const res = await fetch(`${AI_ENGINE}/api/health`, { headers: { Authorization: `Bearer ${AI_SECRET}` } });
    const body = await res.json();
    if (!body.services?.vector_store) throw new Error('Qdrant not available');
    if (!body.services?.llm) throw new Error('LLM not available');

    const collections = await fetch('http://localhost:6333/collections').then(r => r.json());
    const hasTestData = collections.result.collections.some((c: any) => c.name === 'course_e2e-rag-test');
    if (!hasTestData) {
        console.log('  ⚠️ No test data in Qdrant. Upload a document first via /api/ingest');
        console.log('  Continuing with non-RAG benchmarks...');
    }
    return hasTestData;
}

const INDONESIAN_QUERIES = [
    'Apa itu collaborative learning dan apa dasar teorinya?',
    'Sebutkan manfaat collaborative learning dalam pendidikan tinggi',
    'Jelaskan fase-fase self-regulated learning dalam konteks kolaboratif',
    'Bagaimana taksonomi Bloom digunakan untuk menilai kualitas diskusi?',
    'Apa peran AI dalam meningkatkan kualitas diskusi kolaboratif?',
];

const ENGAGEMENT_TEXTS = [
    'Mengapa konsep ini penting? Bagaimana penerapannya dalam konteks pendidikan tinggi?',
    'Saya sudah submit tugas kelompok, tinggal menunggu feedback dari dosen',
    'Terima kasih teman-teman, diskusi hari ini sangat menyenangkan',
    'Menurut saya, analisis ini menunjukkan hubungan kausal yang kuat antara variabel',
    'Bagaimana kalau kita bandingkan pendekatan kualitatif dan kuantitatif?',
    'Setuju, kita juga perlu mempertimbangkan aspek etika dalam penelitian',
    'Evaluasi menunjukkan bahwa metode ini lebih efektif dibanding metode konvensional',
    'Coba kita rancang eksperimen untuk menguji hipotesis tersebut',
];

async function main() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  Kolabri Pipeline Benchmark                                 ║');
    console.log('║  RAG, LM, Analytics, Throughput                             ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');

    const hasRAGData = await ensureTestData();
    const allResults: BenchmarkResult[] = [];

    // ── 1. Health Check Latency ──────────────────────────────────────────
    console.log('\n🏥 Health Check Latency');
    const healthResult = await benchmark('Health Check', async () => {
        const res = await fetch(`${AI_ENGINE}/api/health`, { headers: { Authorization: `Bearer ${AI_SECRET}` } });
        return res.status === 200;
    }, { iterations: 20, warmup: 2 });
    allResults.push(healthResult);
    console.log(formatResult(healthResult));

    // ── 2. Engagement Analysis Latency ───────────────────────────────────
    console.log('\n📊 Engagement Analysis Latency (NLP, no LM)');
    let textIdx = 0;
    const engagementResult = await benchmark('Engagement Analysis', async () => {
        const text = ENGAGEMENT_TEXTS[textIdx++ % ENGAGEMENT_TEXTS.length];
        const res = await fetch(`${AI_ENGINE}/api/analytics/engagement`, {
            method: 'POST', headers: aiHeaders(),
            body: JSON.stringify({ text }),
        });
        const body = await res.json();
        return body.success === true;
    }, { iterations: 20, warmup: 2 });
    allResults.push(engagementResult);
    console.log(formatResult(engagementResult));

    // ── 3. Engagement Analysis Concurrent RPS ────────────────────────────
    console.log('\n⚡ Engagement Analysis Concurrent (5 parallel)');
    textIdx = 0;
    const engagementConcResult = await benchmark('Engagement (5 concurrent)', async () => {
        const text = ENGAGEMENT_TEXTS[textIdx++ % ENGAGEMENT_TEXTS.length];
        const res = await fetch(`${AI_ENGINE}/api/analytics/engagement`, {
            method: 'POST', headers: aiHeaders(),
            body: JSON.stringify({ text }),
        });
        const body = await res.json();
        return body.success === true;
    }, { iterations: 25, concurrency: 5, warmup: 2 });
    allResults.push(engagementConcResult);
    console.log(formatResult(engagementConcResult));

    // ── 4. Personal Chat (LM) Latency ────────────────────────────────────
    console.log('\n🤖 Personal Chat (LM) Latency');
    const chatResult = await benchmark('Personal Chat (LM)', async () => {
        const res = await fetch(`${AI_ENGINE}/api/chat/personal`, {
            method: 'POST', headers: aiHeaders(),
            body: JSON.stringify({
                message: 'Jelaskan apa itu self-regulated learning dalam 1 kalimat',
                history: [], user_name: 'Benchmark',
            }),
        });
        const body = await res.json();
        return body.success === true;
    }, { iterations: 5, warmup: 1 });
    allResults.push(chatResult);
    console.log(formatResult(chatResult));

    // ── 5. RAG Query Latency (embed + search + LM) ──────────────────────
    if (hasRAGData) {
        console.log('\n📚 RAG Query Latency (embed + vector search + LM generate)');
        await fetch(`${AI_ENGINE}/api/efficiency/cache/clear`, { headers: { Authorization: `Bearer ${AI_SECRET}` } });

        let queryIdx = 0;
        const ragResult = await benchmark('RAG Query (full pipeline)', async () => {
            const query = INDONESIAN_QUERIES[queryIdx++ % INDONESIAN_QUERIES.length];
            const res = await fetch(`${AI_ENGINE}/api/ask`, {
                method: 'POST', headers: aiHeaders(),
                body: JSON.stringify({ query, course_id: 'e2e-rag-test' }),
            });
            const body = await res.json();
            return body.success === true;
        }, { iterations: 5, warmup: 1 });
        allResults.push(ragResult);
        console.log(formatResult(ragResult));

        // ── 6. RAG with Semantic Cache ───────────────────────────────────
        console.log('\n💾 RAG Query with Semantic Cache (2nd run, same queries)');
        queryIdx = 0;
        const ragCacheResult = await benchmark('RAG Query (cached)', async () => {
            const query = INDONESIAN_QUERIES[queryIdx++ % INDONESIAN_QUERIES.length];
            const res = await fetch(`${AI_ENGINE}/api/ask`, {
                method: 'POST', headers: aiHeaders(),
                body: JSON.stringify({ query, course_id: 'e2e-rag-test' }),
            });
            const body = await res.json();
            return body.success === true;
        }, { iterations: 10, warmup: 0 });
        allResults.push(ragCacheResult);
        console.log(formatResult(ragCacheResult));
    }

    // ── 7. Intervention Analysis (LM) ────────────────────────────────────
    console.log('\n🔔 Intervention Analysis (LM)');
    const interventionResult = await benchmark('Intervention Analysis', async () => {
        const res = await fetch(`${AI_ENGINE}/api/intervention/analyze`, {
            method: 'POST', headers: aiHeaders(),
            body: JSON.stringify({
                messages: [
                    { sender: 'A', content: 'Mengapa collaborative learning efektif?' },
                    { sender: 'B', content: 'Karena ada diskusi mendalam' },
                    { sender: 'A', content: 'Bagaimana mengukurnya?' },
                    { sender: 'B', content: 'Pakai pre-test post-test' },
                    { sender: 'A', content: 'Setuju, juga bisa analisis transkrip' },
                ],
                topic: 'Collaborative Learning', chat_room_id: 'bench-room',
            }),
        });
        const body = await res.json();
        return body.success === true;
    }, { iterations: 3, warmup: 1 });
    allResults.push(interventionResult);
    console.log(formatResult(interventionResult));

    // ── 8. Goal Validation (LM) ──────────────────────────────────────────
    console.log('\n🎯 Goal Validation (LM + Bloom)');
    const goalResult = await benchmark('Goal Validation', async () => {
        const res = await fetch(`${AI_ENGINE}/api/goals/validate`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${AI_SECRET}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                goal_text: 'Menganalisis dampak collaborative learning terhadap pemahaman konsep',
                user_id: 'bench-user', chat_space_id: 'bench-cs',
            }),
        });
        const body = await res.json();
        return body.success === true;
    }, { iterations: 3, warmup: 1 });
    allResults.push(goalResult);
    console.log(formatResult(goalResult));

    // ── Summary Table ────────────────────────────────────────────────────
    console.log('\n══════════════════════════════════════════════════════════════');
    console.log('  BENCHMARK SUMMARY');
    console.log('══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('  Endpoint                      │ Avg (ms) │ P95 (ms) │   RPS   │ Errors');
    console.log('  ─────────────────────────────────────────────────────────────────────');
    for (const r of allResults) {
        const name = r.name.padEnd(30);
        const avg = r.avgMs.toFixed(0).padStart(8);
        const p95 = r.p95Ms.toFixed(0).padStart(8);
        const rps = r.rps.toFixed(2).padStart(7);
        const err = String(r.errors).padStart(6);
        console.log(`  ${name} │ ${avg} │ ${p95} │ ${rps} │ ${err}`);
    }
    console.log('  ─────────────────────────────────────────────────────────────────────');
    console.log('');

    const hasErrors = allResults.some(r => r.errors > 0);
    if (hasErrors) {
        console.log('  ⚠️ Some benchmarks had errors. Check individual results above.');
    }

    process.exit(0);
}

main().catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
});
