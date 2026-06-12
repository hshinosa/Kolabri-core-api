import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/**
 * Standalone seed for AI provider (local LLM setup).
 * Run independently: npx tsx prisma/seed-ai-provider.ts
 *
 * This is separate from the full demo blueprint seed so the local
 * OpenAI-compatible provider can be configured without reseeding
 * all demo data.
 *
 * User-specified config (for AI chat to work with local server):
 * - base: localhost:20128 (OpenAI-compatible)
 * - apiKey: dummy (sk-local, no real key)
 * - model: opencode/deepseek-v4-flash-free (via config.defaultModel)
 *
 * The provider uses name: 'openai' to route through OpenAIAdapter
 * (which supports custom baseUrl).
 */
async function main() {
    console.log('🌱 Seeding local AI provider + test student for dev (separate seed)...');

    // Seed a test student user so login works and JWT can be obtained for AI chat.
    // Password: password123 (same as demo). Role student so requireStudent passes.
    const hashed = await bcrypt.hash('password123', 10);
    const testStudent = await prisma.user.upsert({
        where: { email: 'test-student@kolabri.id' },
        update: {
            name: 'Test Student',
            role: 'student',
            isActive: true,
            deletedAt: null,
        },
        create: {
            email: 'test-student@kolabri.id',
            password: hashed,
            name: 'Test Student',
            role: 'student',
            isActive: true,
        },
    });
    console.log('✅ Test student ready for login:', testStudent.email);

    // Upsert by name (unique in DB) so it can be run anytime
    // without depending on full demo clear/create.
    const provider = await prisma.aiProvider.upsert({
        where: { name: 'openai' },
        update: {
            displayName: 'Local DeepSeek (20128)',
            apiKey: 'sk-local',
            baseUrl: 'http://localhost:20128/v1',
            isActive: true,
            fallbackOrder: 1,
            config: {
                defaultModel: 'opencode/deepseek-v4-flash-free',
                temperature: 0.7,
                maxTokens: 2048,
            },
        },
        create: {
            name: 'openai',
            displayName: 'Local DeepSeek (20128)',
            apiKey: 'sk-local',
            baseUrl: 'http://localhost:20128/v1',
            isActive: true,
            fallbackOrder: 1,
            config: {
                defaultModel: 'opencode/deepseek-v4-flash-free',
                temperature: 0.7,
                maxTokens: 2048,
            },
        },
    });

    console.log('✅ Local AI provider ready:', provider.name, provider.baseUrl, 'active:', provider.isActive);
    console.log('→ Login with test-student@kolabri.id / password123 to get valid JWT for AI chat.');
}

main()
    .catch((e) => {
        console.error('❌ AI provider seeding failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
