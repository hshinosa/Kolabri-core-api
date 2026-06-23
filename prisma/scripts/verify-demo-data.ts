import { PrismaClient } from '@prisma/client';
import mongoose from 'mongoose';
import { fileURLToPath } from 'node:url';

const prisma = new PrismaClient();
const MONGO_URI = process.env.DATABASE_URL_MONGODB || process.env.MONGODB_URL || 'mongodb://localhost:27017/kolabri';

const ChatLog = mongoose.models.ChatLog || mongoose.model('ChatLog', new mongoose.Schema({
  groupId: String,
  createdAt: Date,
  isDeleted: Boolean,
  engagement: {
    lexicalVariety: Number,
    isHigherOrder: Boolean,
  },
}, { collection: 'chatlogs' }));

type Check = {
  label: string;
  value: number | boolean;
  minimum?: number;
};

function assertCount({ label, value, minimum = 1 }: Check): boolean {
  const passed = typeof value === 'boolean' ? value : value >= minimum;
  const renderedValue = typeof value === 'boolean' ? (value ? 'yes' : 'no') : value;

  if (passed) {
    console.log(`✅ ${label}: ${renderedValue}`);
    return true;
  }

  console.error(`❌ ${label}: ${renderedValue} (expected >= ${minimum})`);
  return false;
}

export async function verifyDemoData() {
  console.log('🔎 Verifying full demo dataset...\n');
  await mongoose.connect(MONGO_URI);

  const budi = await prisma.user.findUnique({
    where: { email: 'budi.santoso@univ.ac.id' },
    include: {
      ownedCourses: true,
      notifications: true,
    },
  });

  const [
    lecturers,
    students,
    courses,
    groups,
    groupMembers,
    sessionDiscussions,
    chatMessages,
    learningGoals,
    reflections,
    aiUsages,
    notifications,
    coursesWithoutGroups,
    groupsWithoutMembers,
    sessionDiscussionsWithoutMessages,
    courseStudents,
    postgresGroupIds,
  ] = await Promise.all([
    prisma.user.count({ where: { role: 'lecturer' } }),
    prisma.user.count({ where: { role: 'student' } }),
    prisma.course.count(),
    prisma.group.count(),
    prisma.groupMember.count(),
    prisma.sessionDiscussion.count(),
    prisma.chatMessage.count(),
    prisma.learningGoal.count(),
    prisma.reflection.count(),
    prisma.aiUsage.count(),
    prisma.notification.count(),
    prisma.course.count({ where: { groups: { none: {} } } }),
    prisma.group.count({ where: { members: { none: {} } } }),
    prisma.sessionDiscussion.count({ where: { messages: { none: {} } } }),
    prisma.courseStudent.count(),
    prisma.group.findMany({ select: { id: true } }),
  ]);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const postgresGroupIdSet = new Set(postgresGroupIds.map(group => group.id));
  const mongoGroupIds = await ChatLog.distinct('groupId', {
    isDeleted: { $ne: true },
    createdAt: { $gte: thirtyDaysAgo },
  });
  const mongoGroupIdsMatchingPostgres = mongoGroupIds.filter(groupId => postgresGroupIdSet.has(String(groupId))).length;
  const [mongoChatLogs, recentMongoChatLogs, mongoLexicalLogs, mongoHotLogs] = await Promise.all([
    ChatLog.countDocuments({ isDeleted: { $ne: true } }),
    ChatLog.countDocuments({ isDeleted: { $ne: true }, createdAt: { $gte: thirtyDaysAgo } }),
    ChatLog.countDocuments({ isDeleted: { $ne: true }, createdAt: { $gte: thirtyDaysAgo }, 'engagement.lexicalVariety': { $gt: 0 } }),
    ChatLog.countDocuments({ isDeleted: { $ne: true }, createdAt: { $gte: thirtyDaysAgo }, 'engagement.isHigherOrder': true }),
  ]);

  const checks: Check[] = [
    { label: 'primary lecturer account exists', value: Boolean(budi) },
    { label: 'primary lecturer owned courses', value: budi?.ownedCourses.length ?? 0 },
    { label: 'primary lecturer notifications', value: budi?.notifications.length ?? 0 },
    { label: 'lecturers', value: lecturers, minimum: 2 },
    { label: 'students', value: students, minimum: 12 },
    { label: 'courses', value: courses, minimum: 4 },
    { label: 'course students', value: courseStudents, minimum: 32 },
    { label: 'groups', value: groups, minimum: 8 },
    { label: 'group members', value: groupMembers, minimum: 24 },
    { label: 'sesi diskusi', value: sessionDiscussions, minimum: 8 },
    { label: 'chat messages', value: chatMessages, minimum: 120 },
    { label: 'learning goals', value: learningGoals, minimum: 24 },
    { label: 'reflections', value: reflections, minimum: 24 },
    { label: 'AI usage records', value: aiUsages, minimum: 24 },
    { label: 'notifications', value: notifications, minimum: 6 },
    { label: 'Mongo ChatLogs for line graphs', value: mongoChatLogs, minimum: 120 },
    { label: 'recent Mongo ChatLogs within 30 days', value: recentMongoChatLogs, minimum: 120 },
    { label: 'Mongo ChatLogs with lexicalVariety', value: mongoLexicalLogs, minimum: 120 },
    { label: 'Mongo HOT ChatLogs', value: mongoHotLogs, minimum: 24 },
    { label: 'Mongo graph groups matching Postgres groups', value: mongoGroupIdsMatchingPostgres, minimum: 8 },
    { label: 'no courses without groups', value: coursesWithoutGroups === 0 },
    { label: 'no groups without members', value: groupsWithoutMembers === 0 },
    { label: 'no sesi diskusi without messages', value: sessionDiscussionsWithoutMessages === 0 },
  ];

  const passed = checks.map(assertCount).every(Boolean);

  console.log('\nDemo credentials:');
  console.log('  Lecturer 1: budi.santoso@univ.ac.id / password123');
  console.log('  Lecturer 2: siti.rahayu@univ.ac.id / password123');
  console.log('  Student: andi.pratama@student.ac.id / password123');

  if (!passed) {
    throw new Error('Demo dataset verification failed. Run npm run db:demo-data, then verify again.');
  }

  console.log('\n🎉 Demo dataset verification passed. Dashboard data should not be empty.');
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  verifyDemoData()
    .catch(error => {
      console.error(error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
      await mongoose.disconnect();
    });
}
