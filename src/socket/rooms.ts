export const roomNames = {
    sessionDiscussion(sessionDiscussionId: string): string {
        return sessionDiscussionId;
    },
    user(userId: string): string {
        return `user_${userId}`;
    },
} as const;
