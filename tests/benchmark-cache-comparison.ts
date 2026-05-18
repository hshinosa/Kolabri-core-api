/**
 * Benchmark: Cold vs Cached comparison
 *
 * Clears cache → runs cold → runs cached → shows comparison table.
 *
 * Run: ./node_modules/.bin/tsx tests/benchmark-cache-comparison.ts
 */

const AI_ENGINE = 'http://localhost:8001';
const AI_SECRET = 'shared-secret-key';

function aiHeaders() { return { Authorization: `Bearer ${AI_SECRET}`, 'Content-Type': 'application/json' }; }
function formHeaders() { return { Authorization: `Bearer ${AI_SECRET}`, 'Content-Type': 'application/x-www-form-urlencoded' }; }

interface Stats { avg: number; min: number; max: number; p50: number; p95: number; samples: number; errors: number; }

function calcStats(latencies: number[], errors: number): Stats {
    const sorted = [...latencies].sort((a, b) => a - b);
    const avg = sorted.reduce((s, v) => s + v, 0) / sorted.length;
    const p50idx = Math.ceil(0.5 * sorted.length) - 1;
    const p95idx = Math.ceil(0.95 * sorted.length) - 1;
    return {
        avg, min: sorted[0], max: sorted[sorted.length - 1],
        p50: sorted[Math.max(0, p50idx)], p95: sorted[Math.max(0, p95idx)],
        samples: sorted.length, errors,
    };
}

async function clearCache() {
    await fetch(`${AI_ENGINE}/api/efficiency/cache/clear`, { headers: { Authorization: `Bearer ${AI_SECRET}` } });
}

async function measureEndpoint(
    name: string,
    fn: () => Promise<boolean>,
    iterations: number,
): Promise<Stats> {
    const latencies: number[] = [];
    let errors = 0;
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        const ok = await fn().catch(() => false);
        latencies.push(performance.now() - start);
        if (!ok) errors++;
    }
    return calcStats(latencies, errors);
}

interface EndpointDef {
    name: string;
    fn: () => Promise<boolean>;
    coldIterations: number;
    cachedIterations: number;
}

async function main() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  Kolabri Benchmark: Cold vs Cached Comparison               ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');

    const endpoints: EndpointDef[] = [
        {
            name: 'RAG Query',
            fn: async () => {
                const queries = [
                    'Apa itu collaborative learning dan apa dasar teorinya?',
                    'Sebutkan manfaat collaborative learning',
                    'Jelaskan fase-fase self-regulated learning',
                    'Bagaimana taksonomi Bloom menilai diskusi?',
                    'Apa peran AI dalam diskusi kolaboratif?',
                ];
                const q = queries[Math.floor(Math.random() * queries.length)];
                const res = await fetch(`${AI_ENGINE}/api/ask`, {
                    method: 'POST', headers: aiHeaders(),
                    body: JSON.stringify({ query: q, course_id: 'e2e-rag-test' }),
                });
                return (await res.json()).success === true;
            },
            coldIterations: 5,
            cachedIterations: 10,
        },
        {
            name: 'Personal Chat (LM)',
            fn: async () => {
                const res = await fetch(`${AI_ENGINE}/api/chat/personal`, {
                    method: 'POST', headers: aiHeaders(),
                    body: JSON.stringify({
                        message: 'Jelaskan self-regulated learning dalam 1 kalimat',
                        history: [], user_name: 'Bench',
                    }),
                });
                return (await res.json()).success === true;
            },
            coldIterations: 3,
            cachedIterations: 5,
        },
        {
            name: 'Intervention Analyze',
            fn: async () => {
                const res = await fetch(`${AI_ENGINE}/api/intervention/analyze`, {
                    method: 'POST', headers: aiHeaders(),
                    body: JSON.stringify({
                        messages: [
                            { sender: 'A', content: 'Mengapa collaborative learning efektif?' },
                            { sender: 'B', content: 'Karena ada diskusi mendalam dan saling menjelaskan' },
                            { sender: 'A', content: 'Bagaimana kita bisa mengukur efektivitasnya?' },
                            { sender: 'B', content: 'Bisa pakai pre-test dan post-test' },
                            { sender: 'A', content: 'Setuju, juga bisa analisis transkrip diskusi' },
                        ],
                        topic: 'Collaborative Learning', chat_room_id: 'bench-room',
                    }),
                });
                return (await res.json()).success === true;
            },
            coldIterations: 3,
            cachedIterations: 5,
        },
        {
            name: 'Goal Validation (Bloom)',
            fn: async () => {
                const res = await fetch(`${AI_ENGINE}/api/goals/validate`, {
                    method: 'POST', headers: formHeaders(),
                    body: new URLSearchParams({
                        goal_text: 'Menganalisis dampak collaborative learning terhadap pemahaman konsep mahasiswa',
                        user_id: 'bench-user', chat_space_id: 'bench-cs',
                    }),
                });
                return (await res.json()).success === true;
            },
            coldIterations: 3,
            cachedIterations: 5,
        },
        {
            name: 'Goal Refinement (LM)',
            fn: async () => {
                const res = await fetch(`${AI_ENGINE}/api/goals/refine`, {
                    method: 'POST', headers: formHeaders(),
                    body: new URLSearchParams({
                        current_goal: 'Belajar tentang collaborative learning',
                        missing_criteria: '["higher_order_verb", "measurable_outcome"]',
                    }),
                });
                return (await res.json()).success === true;
            },
            coldIterations: 3,
            cachedIterations: 5,
        },
        {
            name: 'Discussion Summary (LM)',
            fn: async () => {
                const res = await fetch(`${AI_ENGINE}/api/intervention/summary`, {
                    method: 'POST', headers: aiHeaders(),
                    body: JSON.stringify({
                        messages: Array.from({ length: 12 }, (_, i) => ({
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
                                'Kesimpulannya collaborative learning bermanfaat',
                                'Setuju, mari kita terapkan',
                            ][i],
                        })),
                        chat_room_id: 'bench-room', include_action_items: true,
                    }),
                });
                return (await res.json()).success === true;
            },
            coldIterations: 3,
            cachedIterations: 5,
        },
        {
            name: 'Engagement Analysis (NLP)',
            fn: async () => {
                const texts = [
                    'Mengapa konsep ini penting? Bagaimana penerapannya?',
                    'Saya sudah submit tugas kelompok',
                    'Terima kasih diskusi hari ini menyenangkan',
                    'Analisis ini menunjukkan hubungan kausal yang kuat',
                    'Bagaimana kalau kita bandingkan pendekatan kualitatif dan kuantitatif?',
                ];
                const res = await fetch(`${AI_ENGINE}/api/analytics/engagement`, {
                    method: 'POST', headers: aiHeaders(),
                    body: JSON.stringify({ text: texts[Math.floor(Math.random() * texts.length)] }),
                });
                return (await res.json()).success === true;
            },
            coldIterations: 10,
            cachedIterations: 10,
        },
        {
            name: 'Socratic Prompt (LM)',
            fn: async () => {
                const res = await fetch(`${AI_ENGINE}/api/intervention/prompt`, {
                    method: 'POST', headers: aiHeaders(),
                    body: JSON.stringify({
                        topic: 'Self-Regulated Learning',
                        context: 'Mahasiswa berdiskusi tentang strategi metakognitif',
                        difficulty: 'medium',
                    }),
                });
                return (await res.json()).success === true;
            },
            coldIterations: 3,
            cachedIterations: 5,
        },
    ];

    const results: { name: string; cold: Stats; cached: Stats; speedup: number }[] = [];

    for (const ep of endpoints) {
        console.log(`\n⏱️  ${ep.name}`);

        await clearCache();
        console.log(`    Cold (${ep.coldIterations}x)...`);
        const cold = await measureEndpoint(ep.name, ep.fn, ep.coldIterations);
        console.log(`      → Avg: ${cold.avg.toFixed(0)}ms | P95: ${cold.p95.toFixed(0)}ms | Errors: ${cold.errors}`);

        console.log(`    Cached (${ep.cachedIterations}x)...`);
        const cached = await measureEndpoint(ep.name, ep.fn, ep.cachedIterations);
        console.log(`      → Avg: ${cached.avg.toFixed(0)}ms | P95: ${cached.p95.toFixed(0)}ms | Errors: ${cached.errors}`);

        const speedup = cold.avg / Math.max(cached.avg, 0.1);
        console.log(`    Speedup: ${speedup.toFixed(1)}x`);

        results.push({ name: ep.name, cold, cached, speedup });
    }

    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════════════════════════════╗');
    console.log('║  COLD vs CACHED COMPARISON                                                         ║');
    console.log('╠══════════════════════════════════════════════════════════════════════════════════════╣');
    console.log('║  Endpoint                  │ Cold Avg │ Cold P95 │ Cache Avg │ Cache P95 │ Speedup  ║');
    console.log('╠══════════════════════════════════════════════════════════════════════════════════════╣');
    for (const r of results) {
        const name = r.name.padEnd(26);
        const coldAvg = (r.cold.avg.toFixed(0) + 'ms').padStart(8);
        const coldP95 = (r.cold.p95.toFixed(0) + 'ms').padStart(8);
        const cacheAvg = (r.cached.avg.toFixed(0) + 'ms').padStart(9);
        const cacheP95 = (r.cached.p95.toFixed(0) + 'ms').padStart(9);
        const speedup = (r.speedup.toFixed(1) + 'x').padStart(8);
        console.log(`║  ${name} │ ${coldAvg} │ ${coldP95} │ ${cacheAvg} │ ${cacheP95} │ ${speedup} ║`);
    }
    console.log('╚══════════════════════════════════════════════════════════════════════════════════════╝');

    const totalColdAvg = results.reduce((s, r) => s + r.cold.avg, 0);
    const totalCachedAvg = results.reduce((s, r) => s + r.cached.avg, 0);
    console.log(`\n  Total cold avg: ${totalColdAvg.toFixed(0)}ms → cached avg: ${totalCachedAvg.toFixed(0)}ms`);
    console.log(`  Overall speedup: ${(totalColdAvg / Math.max(totalCachedAvg, 0.1)).toFixed(1)}x`);

    process.exit(0);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
