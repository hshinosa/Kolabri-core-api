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
 * - base: http://43.228.214.145:8317 (OpenAI-compatible proxy)
 * - apiKey: sk-ama
 * - model: deepseek-v4-flash (via config.defaultModel)
 *
 * The provider uses name: 'cli-proxy-api-plus' to route through OpenAIAdapter
 * (which supports custom baseUrl).
 */
async function main() {
    console.log('🌱 Seeding AI provider (standalone)...');

    // Upsert by name (unique in DB) so it can be run anytime
    // without depending on full demo clear/create.
    const provider = await prisma.aiProvider.upsert({
        where: { name: 'cli-proxy-api-plus' },
        update: {
            displayName: 'CLI Proxy API Plus',
            apiKey: 'sk-ama',
            baseUrl: 'http://43.228.214.145:8317/v1',
            isActive: true,
            fallbackOrder: 0,
            config: {
                defaultModel: 'deepseek-v4-flash',
                temperature: 0.7,
                maxTokens: 8192,
            },
        },
        create: {
            name: 'cli-proxy-api-plus',
            displayName: 'CLI Proxy API Plus',
            apiKey: 'sk-ama',
            baseUrl: 'http://43.228.214.145:8317/v1',
            isActive: true,
            fallbackOrder: 0,
            config: {
                defaultModel: 'deepseek-v4-flash',
                temperature: 0.7,
                maxTokens: 8192,
            },
        },
    });

    console.log('✅ AI provider ready:', provider.name, provider.baseUrl, 'active:', provider.isActive);
    console.log('→ Model:', (provider.config as any)?.defaultModel || 'deepseek-v4-flash');
}


main()
    .catch((e) => {
        console.error('❌ AI provider seeding failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
