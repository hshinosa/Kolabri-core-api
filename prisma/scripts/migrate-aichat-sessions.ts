import mongoose from 'mongoose';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const AiChatSessionSchema = new mongoose.Schema({
    userId: String,
    title: { type: String, default: 'Chat Baru' },
    messages: [
        {
            role: { type: String, enum: ['user', 'assistant'] },
            content: String,
            createdAt: { type: Date, default: Date.now },
        },
    ],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

const AiChatSessionModel = mongoose.model('AiChatSession', AiChatSessionSchema);

async function main() {
    const dryRun = process.argv.includes('--dry-run');

    const mongoUrl = process.env.MONGODB_URI;
    if (!mongoUrl) {
        console.error('MONGODB_URI not set');
        process.exit(1);
    }

    await mongoose.connect(mongoUrl);
    console.log('Connected to MongoDB');

    const sessions = await AiChatSessionModel.find({}).lean();
    console.log(`Found ${sessions.length} sessions in MongoDB`);

    if (dryRun) {
        console.log('DRY RUN — no data written');
        console.log('Sample mapping:');
        for (const s of sessions.slice(0, 3)) {
            console.log({
                mongoId: s._id,
                userId: s.userId,
                title: s.title,
                messageCount: (s.messages as unknown[]).length,
            });
        }
        await mongoose.disconnect();
        await prisma.$disconnect();
        return;
    }

    let migrated = 0;
    let skipped = 0;

    for (const session of sessions) {
        const userId = session.userId as string;
        if (!userId) { skipped++; continue; }

        const existing = await prisma.aiChat.findFirst({ where: { id: session._id.toString() } });
        if (existing) { skipped++; continue; }

        const chat = await prisma.aiChat.create({
            data: {
                id: session._id.toString(),
                title: (session.title as string) || 'Chat Baru',
                userId,
                createdAt: session.createdAt as Date,
                updatedAt: session.updatedAt as Date,
            },
        });

        const messages = (session.messages as Array<{ role: string; content: string; createdAt: Date }>) || [];
        for (const msg of messages) {
            await prisma.aiChatMessage.create({
                data: {
                    chatId: chat.id,
                    role: msg.role,
                    content: msg.content,
                    createdAt: msg.createdAt || new Date(),
                },
            });
        }

        migrated++;
    }

    const pgCount = await prisma.aiChat.count();
    console.log(`Migration complete: ${migrated} migrated, ${skipped} skipped`);
    console.log(`PostgreSQL AiChat count: ${pgCount}`);

    await mongoose.disconnect();
    await prisma.$disconnect();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
