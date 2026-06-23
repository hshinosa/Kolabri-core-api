import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { PrismaClient, UserRole, VectorStatus, NotificationType } from '@prisma/client';

import { ActivityLog } from '../src/models/ActivityLog.js';
import { ChatLog } from '../src/models/ChatLog.js';
import { SilenceEvent } from '../src/models/SilenceEvent.js';
import { createDemoBlueprint, DemoDiscussionMessage } from './seed-blueprint.js';

const prisma = new PrismaClient();
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/kolabri';

type KeyMap = Map<string, string>;

function isoDaysAgo(daysAgo: number, hour = 9) {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    date.setHours(hour, 0, 0, 0);
    return date;
}

async function connectMongo() {
    if (mongoose.connection.readyState === 0) {
        await mongoose.connect(MONGO_URI);
    }
}

async function clearMongo() {
    await connectMongo();
    await Promise.all([
        ChatLog.deleteMany({}),
        ActivityLog.deleteMany({}),
        SilenceEvent.deleteMany({}),
    ]);
}

async function clearPostgres() {
    await prisma.aiAbTestResult.deleteMany();
    await prisma.aiAbTest.deleteMany();
    await prisma.aiModelComparisonResult.deleteMany();
    await prisma.aiModelComparison.deleteMany();
    await prisma.aiUsage.deleteMany();
    await prisma.aiChatMessage.deleteMany();
    await prisma.aiChat.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.reflection.deleteMany();
    await prisma.learningGoal.deleteMany();
    await prisma.chatMessage.deleteMany();
    await prisma.chatSpace.deleteMany();
    await prisma.groupMember.deleteMany();
    await prisma.group.deleteMany();
    await prisma.courseStudent.deleteMany();
    await prisma.knowledgeBase.deleteMany();
    await prisma.courseTemplate.deleteMany();
    await prisma.course.deleteMany();
    await prisma.aiProvider.deleteMany();
    await prisma.passwordResetToken.deleteMany();
    await prisma.emailVerificationToken.deleteMany();
    await prisma.user.deleteMany();
}

async function main() {
    console.log('🌱 Seeding full Kolabri demo dataset (fresh-only)...');

    const blueprint = createDemoBlueprint();
    const hashedPassword = await bcrypt.hash(blueprint.password, 10);

    await clearMongo();
    await clearPostgres();

    const userIds: KeyMap = new Map();
    const courseIds: KeyMap = new Map();
    const groupIds: KeyMap = new Map();
    const chatSpaceIds: KeyMap = new Map();
    const goalIds: KeyMap = new Map();
    const providerIds: KeyMap = new Map();
    const aiChatIds: KeyMap = new Map();

    const allUsers = [...blueprint.users.admins, ...blueprint.users.lecturers, ...blueprint.users.students];
    for (const [index, user] of allUsers.entries()) {
        const created = await prisma.user.create({
            data: {
                email: user.email,
                password: hashedPassword,
                name: user.name,
                role: user.role as UserRole,
                avatarUrl: user.avatarUrl,
                themePreference: user.themePreference ?? 'light',
                languagePreference: user.languagePreference ?? 'id',
                emailVerifiedAt: isoDaysAgo(30 - index, 8),
                createdAt: isoDaysAgo(45 - index, 8),
            },
        });
        userIds.set(user.key, created.id);
    }

    for (const [index, template] of blueprint.courseTemplates.entries()) {
        await prisma.courseTemplate.create({
            data: {
                name: template.name,
                description: template.description,
                namePattern: template.namePattern,
                descriptionTemplate: template.descriptionTemplate,
                defaultGroups: template.defaultGroups,
                createdById: userIds.get(template.createdByKey)!,
                createdAt: isoDaysAgo(28 - index, 9),
            },
        });
    }

    for (const [index, course] of blueprint.courses.entries()) {
        const created = await prisma.course.create({
            data: {
                code: course.code,
                name: course.name,
                description: course.description,
                joinCode: course.joinCode,
                semester: course.semester,
                academicYear: course.academicYear,
                isActive: course.status !== 'light',
                ownerId: userIds.get(course.ownerKey)!,
                createdAt: isoDaysAgo(35 - index * 3, 10),
            },
        });
        courseIds.set(course.key, created.id);

        for (const studentKey of course.studentKeys) {
            await prisma.courseStudent.create({
                data: {
                    courseId: created.id,
                    userId: userIds.get(studentKey)!,
                    enrolledAt: isoDaysAgo(30 - index * 2, 11),
                },
            });
        }
    }

    for (const [index, group] of blueprint.groups.entries()) {
        const created = await prisma.group.create({
            data: {
                name: group.name,
                joinCode: group.joinCode,
                courseId: courseIds.get(group.courseKey)!,
                createdBy: userIds.get(group.createdByKey)!,
                createdAt: isoDaysAgo(26 - index, 12),
            },
        });
        groupIds.set(group.key, created.id);

        for (const memberKey of group.memberKeys) {
            await prisma.groupMember.create({
                data: {
                    groupId: created.id,
                    userId: userIds.get(memberKey)!,
                    joinedAt: isoDaysAgo(25 - index, 13),
                },
            });
        }
    }

    for (const [index, chatSpace] of blueprint.chatSpaces.entries()) {
        const group = blueprint.groups.find((item) => item.key === chatSpace.groupKey)!;
        const created = await prisma.chatSpace.create({
            data: {
                name: chatSpace.name,
                description: chatSpace.description,
                type: chatSpace.type,
                isDefault: chatSpace.isDefault ?? false,
                summary: chatSpace.summary,
                summaryGeneratedAt: chatSpace.summary ? isoDaysAgo(6 - (index % 3), 16) : null,
                groupId: groupIds.get(chatSpace.groupKey)!,
                createdBy: userIds.get(group.createdByKey)!,
                createdAt: isoDaysAgo(24 - index, 14),
            },
        });
        chatSpaceIds.set(chatSpace.key, created.id);
    }

    for (const [index, goal] of blueprint.learningGoals.entries()) {
        const created = await prisma.learningGoal.create({
            data: {
                content: goal.content,
                isValidated: goal.isValidated ?? false,
                chatSpaceId: chatSpaceIds.get(goal.chatSpaceKey)!,
                userId: userIds.get(goal.userKey)!,
                createdAt: isoDaysAgo(18 - index, 15),
            },
        });
        goalIds.set(goal.key, created.id);
    }

    for (const [index, reflection] of blueprint.reflections.entries()) {
        await prisma.reflection.create({
            data: {
                content: reflection.content,
                type: reflection.type,
                goalId: reflection.goalKey ? goalIds.get(reflection.goalKey)! : null,
                userId: userIds.get(reflection.userKey)!,
                chatSpaceId: chatSpaceIds.get(reflection.chatSpaceKey)!,
                createdAt: isoDaysAgo(16 - (index % 8), 18),
            },
        });
    }

    for (const [index, kb] of blueprint.knowledgeBases.entries()) {
        await prisma.knowledgeBase.create({
            data: {
                fileName: kb.fileName,
                filePath: kb.filePath,
                fileSize: kb.fileSize,
                mimeType: kb.mimeType,
                vectorStatus: kb.vectorStatus as VectorStatus,
                courseId: courseIds.get(kb.courseKey)!,
                uploadedBy: userIds.get(kb.uploadedByKey)!,
                uploadedAt: isoDaysAgo(12 - index, 9),
                processedAt: kb.vectorStatus === 'ready' ? isoDaysAgo(11 - index, 10) : null,
            },
        });
    }

    for (const [index, provider] of blueprint.aiProviders.entries()) {
        const created = await prisma.aiProvider.create({
            data: {
                name: provider.name,
                displayName: provider.displayName,
                apiKey: provider.apiKey,
                baseUrl: provider.baseUrl,
                isActive: provider.isActive,
                fallbackOrder: provider.fallbackOrder,
                config: provider.config as any,
                createdAt: isoDaysAgo(20 - index, 8),
            },
        });
        providerIds.set(provider.key, created.id);
    }

    // Local AI provider for dev (user-specified: localhost:20128, dummy key, model opencode/deepseek-v4-flash-free).
    // Upsert ensures the 'openai' name (used by OpenAIAdapter + custom baseUrl) points to local LLM.
    // This makes AI chat (create + stream) succeed without real keys or broken fallback.
    // Run standalone via `npx tsx prisma/seed-ai-provider.ts` for quick fix without full demo reseed.
    // (Separate from blueprint demo providers which are inactive.)
    await prisma.aiProvider.upsert({
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

    for (const [index, chat] of blueprint.aiChats.entries()) {
        const createdChat = await prisma.aiChat.create({
            data: {
                title: chat.title,
                userId: userIds.get(chat.userKey)!,
                createdAt: isoDaysAgo(10 - index, 10),
            },
        });
        aiChatIds.set(chat.key, createdChat.id);
        for (const [messageIndex, message] of chat.messages.entries()) {
            await prisma.aiChatMessage.create({
                data: {
                    chatId: createdChat.id,
                    role: message.role,
                    content: message.content,
                    createdAt: new Date(isoDaysAgo(10 - index, 10).getTime() + messageIndex * 1000 * 60 * 3),
                },
            });
        }
    }

    for (const [index, usage] of blueprint.aiUsages.entries()) {
        await prisma.aiUsage.create({
            data: {
                userId: userIds.get(usage.userKey)!,
                courseId: usage.courseKey ? courseIds.get(usage.courseKey)! : null,
                provider: usage.provider,
                providerId: providerIds.get(usage.providerKey)!,
                model: usage.model,
                promptTokens: usage.promptTokens,
                completionTokens: usage.completionTokens,
                totalTokens: usage.promptTokens + usage.completionTokens,
                estimatedCost: usage.estimatedCost,
                latencyMs: usage.latencyMs,
                createdAt: isoDaysAgo(9 - (index % 7), 11),
            },
        });
    }

    for (const [index, notification] of blueprint.notifications.entries()) {
        await prisma.notification.create({
            data: {
                userId: userIds.get(notification.userKey)!,
                type: notification.type as NotificationType,
                title: notification.title,
                message: notification.message,
                isRead: notification.isRead ?? false,
                readAt: notification.isRead ? isoDaysAgo(2 + (index % 3), 8) : null,
                createdAt: isoDaysAgo(4 + (index % 5), 9),
            },
        });
    }

    for (const [index, auditLog] of blueprint.auditLogs.entries()) {
        await prisma.auditLog.create({
            data: {
                userId: userIds.get(auditLog.userKey)!,
                action: auditLog.action,
                entityType: auditLog.entityType,
                entityId:
                    courseIds.get(auditLog.entityKey) ||
                    groupIds.get(auditLog.entityKey) ||
                    providerIds.get(auditLog.entityKey) ||
                    aiChatIds.get(auditLog.entityKey) ||
                    auditLog.entityKey,
                changes: auditLog.changes as any,
                metadata: auditLog.metadata as any,
                createdAt: isoDaysAgo(8 - (index % 5), 13),
            },
        });
    }

    for (const [index, discussion] of blueprint.discussions.entries()) {
        const replyMap: string[] = [];
        for (const [messageIndex, message] of discussion.messages.entries()) {
            const created = await prisma.chatMessage.create({
                data: {
                    chatSpaceId: chatSpaceIds.get(discussion.chatSpaceKey)!,
                    senderId: userIds.get(message.senderKey)!,
                    senderType: normalizeChatMessageSenderType(message),
                    content: message.content,
                    isIntervention: message.isIntervention ?? false,
                    replyToId: typeof message.replyToIndex === 'number' ? replyMap[message.replyToIndex] : null,
                    createdAt: new Date(isoDaysAgo(7 - index, 14).getTime() + messageIndex * 1000 * 60 * 7),
                },
            });
            replyMap.push(created.id);

            await ChatLog.create({
                courseId: courseIds.get(discussion.courseKey)!,
                groupId: groupIds.get(discussion.groupKey)!,
                chatSpaceId: chatSpaceIds.get(discussion.chatSpaceKey)!,
                senderId: userIds.get(message.senderKey)!,
                senderName: allUsers.find((user) => user.key === message.senderKey)?.name ?? message.senderKey,
                senderType: message.senderType,
                content: message.content,
                isIntervention: message.isIntervention ?? false,
                isDeleted: false,
                mentions: message.mentions ?? [],
                replyTo: typeof message.replyToIndex === 'number'
                    ? (() => {
                        const repliedMsg = discussion.messages[message.replyToIndex];
                        return {
                            messageId: replyMap[message.replyToIndex],
                            senderId: userIds.get(repliedMsg.senderKey)!,
                            senderName: allUsers.find((user) => user.key === repliedMsg.senderKey)?.name ?? '',
                            content: repliedMsg.content,
                        };
                    })()
                    : undefined,
                engagement: message.engagement,
                attachments: [],
                createdAt: new Date(isoDaysAgo(7 - index, 14).getTime() + messageIndex * 1000 * 60 * 7),
            });
        }
    }

    for (const [index, log] of blueprint.activityLogs.entries()) {
        const user = allUsers.find((item) => item.key === log.userKey)!;
        await ActivityLog.create({
            courseId: courseIds.get(log.courseKey)!,
            groupId: log.groupKey ? groupIds.get(log.groupKey)! : undefined,
            userId: userIds.get(log.userKey)!,
            userName: user.name,
            activityType: log.activityType,
            metadata: log.metadata,
            createdAt: new Date(isoDaysAgo(6 - (index % 6), 10).getTime() + index * 1000 * 60 * 5),
        });
    }

    for (const [index, silence] of blueprint.silenceEvents.entries()) {
        await SilenceEvent.create({
            courseId: courseIds.get(silence.courseKey)!,
            groupId: groupIds.get(silence.groupKey)!,
            chatSpaceId: chatSpaceIds.get(silence.chatSpaceKey)!,
            silenceDuration: silence.silenceDuration,
            interventionSent: silence.interventionSent,
            createdAt: isoDaysAgo(3 - index, 7),
        });
    }

    console.log('✅ Full seed complete');
    console.log(`   Admins: ${blueprint.users.admins.length}`);
    console.log(`   Lecturers: ${blueprint.users.lecturers.length}`);
    console.log(`   Students: ${blueprint.users.students.length}`);
    console.log(`   Courses: ${blueprint.courses.length}`);
    console.log(`   Groups: ${blueprint.groups.length}`);
    console.log(`   Sesi diskusi: ${blueprint.chatSpaces.length}`);
    console.log(`   Learning goals: ${blueprint.learningGoals.length}`);
    console.log(`   Reflections: ${blueprint.reflections.length}`);
    console.log(`   AI chats: ${blueprint.aiChats.length}`);
    console.log(`   Notifications: ${blueprint.notifications.length}`);
    console.log('');
    console.log('Demo Credentials:');
    console.log('  Admin: admin@kolabri.id / password123');
    console.log('  Lecturer 1: lecturer@kolabri.edu / password123');
    console.log('  Lecturer 2: sari@kolabri.edu / password123');
    console.log('  Lecturer 3: bima@kolabri.edu / password123');
    console.log('  Student 1: student1@kolabri.edu / password123');
    console.log('  Student 9: student9@kolabri.edu / password123');
    console.log('  Join Codes: HCI2024, SESTUDIO25, DATAMINING25, PROJMAN25');
    console.log('  Group Codes: GROUP-ALPHA, GROUP-BETA, SPRINT-GAMMA, SPRINT-DELTA, INSIGHT-DM, LAB-MINERS, STARTER-PM');
}

function normalizeChatMessageSenderType(message: DemoDiscussionMessage) {
    if (message.senderType === 'student' || message.senderType === 'lecturer') return 'user';
    return message.senderType;
}

main()
    .catch((error) => {
        console.error('❌ Full seed failed:', error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
    });
