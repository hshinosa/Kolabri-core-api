/**
 * Seed Script: Data Retention Policies (NFR-DATA-01)
 * 
 * Seeds default retention policies for all data types.
 * Safe to run multiple times - uses upsert to avoid duplicates.
 * 
 * Usage:
 *   npx tsx prisma/seed-retention.ts
 */

import { PrismaClient, DataType } from '@prisma/client';

const prisma = new PrismaClient();

async function seedRetentionPolicies() {
    console.log('[Seed] Starting retention policies seed...');
    
    const policies = [
        {
            dataType: DataType.USER,
            retentionDays: 365,
            archiveAfterDays: 180,
            autoPurge: false,
        },
        {
            dataType: DataType.COURSE,
            retentionDays: 365,
            archiveAfterDays: 180,
            autoPurge: false,
        },
        {
            dataType: DataType.GROUP,
            retentionDays: 365,
            archiveAfterDays: 180,
            autoPurge: false,
        },
        {
            dataType: DataType.CHAT_SPACE,
            retentionDays: 365,
            archiveAfterDays: 180,
            autoPurge: false,
        },
        {
            dataType: DataType.KNOWLEDGE_BASE,
            retentionDays: 365,
            archiveAfterDays: 180,
            autoPurge: false,
        },
        {
            dataType: DataType.CHAT_LOG,
            retentionDays: 365,
            archiveAfterDays: 180,
            autoPurge: false,
        },
    ];
    
    let created = 0;
    let updated = 0;
    
    for (const policy of policies) {
        const result = await prisma.dataRetentionPolicy.upsert({
            where: { dataType: policy.dataType },
            update: {}, // Don't update existing policies
            create: policy,
        });
        
        // Check if it was newly created by checking if createdAt === updatedAt
        const wasCreated = result.createdAt.getTime() === result.updatedAt.getTime();
        
        if (wasCreated) {
            created++;
            console.log(`[Seed] ✓ Created policy for ${policy.dataType}`);
        } else {
            updated++;
            console.log(`[Seed] → Policy for ${policy.dataType} already exists (skipped)`);
        }
    }
    
    console.log(`\n[Seed] Retention policies seed complete:`);
    console.log(`  - Created: ${created}`);
    console.log(`  - Existing: ${updated}`);
    console.log(`  - Total: ${policies.length}`);
}

async function main() {
    try {
        await seedRetentionPolicies();
        await prisma.$disconnect();
        console.log('\n[Seed] Database connection closed');
        process.exit(0);
    } catch (error) {
        console.error('\n[Seed] Error:', error);
        await prisma.$disconnect();
        process.exit(1);
    }
}

main();
