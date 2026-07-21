import { ChatLog } from '../models/ChatLog.js';
import prisma from '../config/database.js';

export class AccountDeletionService {
    static async hardDeleteUserData(userId: string): Promise<{ message: string }> {
        // Delete in dependency order
        await prisma.aiChatMessage.deleteMany({ where: { chat: { userId } } });
        await prisma.aiChat.deleteMany({ where: { userId } });
        await prisma.chatMessage.deleteMany({ where: { senderId: userId } });
        await prisma.reflection.deleteMany({ where: { userId } });
        await prisma.learningGoal.deleteMany({ where: { userId } });
        await prisma.exportJob.deleteMany({ where: { userId } });
        await prisma.notification.deleteMany({ where: { userId } });
        await prisma.groupMember.deleteMany({ where: { userId } });
        await prisma.courseStudent.deleteMany({ where: { userId } });

        // Delete ChatLog entries in MongoDB
        await ChatLog.deleteMany({ senderId: userId });

        // Finally delete the user
        await prisma.user.delete({ where: { id: userId } });

        return { message: 'User data permanently deleted' };
    }
}
