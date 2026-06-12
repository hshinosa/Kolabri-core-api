/**
 * MongoDB Migration Script: ChatLog isDeleted → deletedAt
 * 
 * Migrates ChatLog documents from boolean isDeleted field to timestamp deletedAt field.
 * 
 * Usage:
 *   npm run tsx scripts/migrate-chatlog-deleted.ts           # Apply migration
 *   npm run tsx scripts/migrate-chatlog-deleted.ts --dry-run # Preview changes
 */

import mongoose from 'mongoose';
import { config } from 'dotenv';

// Load environment variables
config();

async function migrate(dryRun = false) {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/kolabri';
    
    console.log(`[Migration] Connecting to MongoDB: ${mongoUri}`);
    
    try {
        await mongoose.connect(mongoUri);
        console.log('[Migration] Connected to MongoDB');
        
        const db = mongoose.connection.db;
        if (!db) {
            throw new Error('Database connection not established');
        }
        
        const collection = db.collection('chatlogs');
        
        // Find documents with isDeleted=true and no deletedAt field
        const filter = { 
            isDeleted: true, 
            deletedAt: { $exists: false } 
        };
        
        const count = await collection.countDocuments(filter);
        console.log(`[Migration] Found ${count} ChatLog documents with isDeleted=true`);
        
        if (count === 0) {
            console.log('[Migration] No documents to migrate');
            await mongoose.disconnect();
            return;
        }
        
        if (dryRun) {
            console.log(`[Dry Run] Would update ${count} documents:`);
            console.log(`  - Set deletedAt: new Date()`);
            console.log(`  - Unset isDeleted field`);
            
            // Show sample of documents that would be updated
            const samples = await collection.find(filter).limit(5).toArray();
            console.log(`\n[Dry Run] Sample documents (first 5):`);
            samples.forEach((doc, idx) => {
                console.log(`  ${idx + 1}. _id: ${doc._id}, chatSpaceId: ${doc.chatSpaceId}, isDeleted: ${doc.isDeleted}`);
            });
        } else {
            console.log(`[Migration] Updating ${count} documents...`);
            
            const updateResult = await collection.updateMany(
                filter,
                {
                    $set: { deletedAt: new Date() },
                    $unset: { isDeleted: '' }
                }
            );
            
            console.log(`[Migration] Update complete:`);
            console.log(`  - Matched: ${updateResult.matchedCount}`);
            console.log(`  - Modified: ${updateResult.modifiedCount}`);
            
            if (updateResult.modifiedCount !== count) {
                console.warn(`[Warning] Modified count (${updateResult.modifiedCount}) differs from expected count (${count})`);
            }
        }
        
        await mongoose.disconnect();
        console.log('[Migration] Disconnected from MongoDB');
        
    } catch (error) {
        console.error('[Migration] Error:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
}

// Parse command line arguments
const dryRun = process.argv.includes('--dry-run');

if (dryRun) {
    console.log('[Dry Run Mode] No changes will be applied\n');
} else {
    console.log('[Live Mode] Changes will be applied to database\n');
}

// Run migration
migrate(dryRun).catch((error) => {
    console.error('[Migration] Fatal error:', error);
    process.exit(1);
});
