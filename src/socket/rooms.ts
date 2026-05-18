export const roomNames = {
    chatSpace(chatSpaceId: string): string {
        return chatSpaceId;
    },
    user(userId: string): string {
        return `user_${userId}`;
    },
} as const;
