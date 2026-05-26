type Role = 'admin' | 'lecturer' | 'student';
type DiscussionProfile = 'high' | 'moderate' | 'low';
type SenderType = 'student' | 'lecturer' | 'ai' | 'bot' | 'system';
export interface DemoUser {
    key: string;
    name: string;
    email: string;
    role: Role;
    avatarUrl?: string;
    themePreference?: 'light' | 'dark' | 'system';
    languagePreference?: 'id' | 'en';
}
export interface DemoCourse {
    key: string;
    code: string;
    name: string;
    description: string;
    joinCode: string;
    semester: string;
    academicYear: string;
    ownerKey: string;
    studentKeys: string[];
    status: 'active' | 'medium' | 'light';
}
export interface DemoGroup {
    key: string;
    courseKey: string;
    name: string;
    joinCode: string;
    createdByKey: string;
    memberKeys: string[];
}
export interface DemoChatSpace {
    key: string;
    groupKey: string;
    name: string;
    description: string;
    type: 'Akademik' | 'Proyek' | 'Umum';
    isDefault?: boolean;
    summary?: string;
}
export interface DemoGoal {
    key: string;
    chatSpaceKey: string;
    userKey: string;
    content: string;
    isValidated?: boolean;
}
export interface DemoReflection {
    key: string;
    userKey: string;
    chatSpaceKey: string;
    goalKey?: string;
    type: 'session' | 'weekly';
    content: string;
}
export interface DemoKnowledgeBase {
    key: string;
    courseKey: string;
    uploadedByKey: string;
    fileName: string;
    filePath: string;
    fileSize: number;
    mimeType: string;
    vectorStatus: 'pending' | 'processing' | 'ready' | 'failed' | 'skipped';
}
export interface DemoAiChat {
    key: string;
    userKey: string;
    title: string;
    messages: Array<{
        role: 'user' | 'assistant';
        content: string;
    }>;
}
export interface DemoNotification {
    userKey: string;
    type: 'info' | 'success' | 'warning' | 'error';
    title: string;
    message: string;
    isRead?: boolean;
}
export interface DemoAiProvider {
    key: string;
    name: string;
    displayName: string;
    apiKey: string;
    baseUrl?: string;
    isActive: boolean;
    fallbackOrder: number;
    config: Record<string, unknown>;
}
export interface DemoAiUsage {
    userKey: string;
    courseKey?: string;
    providerKey: string;
    provider: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    estimatedCost: number;
    latencyMs: number;
}
export interface DemoAuditLog {
    userKey: string;
    action: string;
    entityType: string;
    entityKey: string;
    changes?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
}
export interface DemoActivityLog {
    courseKey: string;
    groupKey?: string;
    userKey: string;
    activityType: 'goal_set' | 'reflection_written' | 'message_sent' | 'file_uploaded' | 'course_joined' | 'group_joined';
    metadata?: Record<string, unknown>;
}
export interface DemoSilenceEvent {
    courseKey: string;
    groupKey: string;
    chatSpaceKey: string;
    silenceDuration: number;
    interventionSent: boolean;
}
export interface DemoDiscussionMessage {
    senderKey: string;
    senderType: SenderType;
    content: string;
    isIntervention?: boolean;
    replyToIndex?: number;
    mentions?: string[];
    engagement?: {
        engagementType: 'cognitive' | 'behavioral' | 'emotional';
        isHigherOrder: boolean;
        lexicalVariety: number;
        hotIndicators: string[];
        confidence: number;
    };
}
export interface DemoDiscussion {
    key: string;
    courseKey: string;
    groupKey: string;
    chatSpaceKey: string;
    profile: DiscussionProfile;
    messages: DemoDiscussionMessage[];
}
export interface DemoCourseTemplate {
    key: string;
    name: string;
    description: string;
    namePattern: string;
    descriptionTemplate: string;
    defaultGroups: Array<{
        name: string;
        description: string;
    }>;
    createdByKey: string;
}
export interface DemoBlueprint {
    password: string;
    users: {
        admins: DemoUser[];
        lecturers: DemoUser[];
        students: DemoUser[];
    };
    courses: DemoCourse[];
    courseTemplates: DemoCourseTemplate[];
    groups: DemoGroup[];
    chatSpaces: DemoChatSpace[];
    learningGoals: DemoGoal[];
    reflections: DemoReflection[];
    knowledgeBases: DemoKnowledgeBase[];
    aiChats: DemoAiChat[];
    notifications: DemoNotification[];
    aiProviders: DemoAiProvider[];
    aiUsages: DemoAiUsage[];
    auditLogs: DemoAuditLog[];
    activityLogs: DemoActivityLog[];
    silenceEvents: DemoSilenceEvent[];
    discussions: DemoDiscussion[];
}
export declare function createDemoBlueprint(): DemoBlueprint;
export {};
//# sourceMappingURL=seed-blueprint.d.ts.map