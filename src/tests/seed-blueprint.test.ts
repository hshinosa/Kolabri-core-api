import { describe, expect, it } from 'vitest';

import { createDemoBlueprint } from '../../prisma/seed-blueprint.js';

describe('createDemoBlueprint', () => {
    it('builds a dense 3-role demo dataset', () => {
        const blueprint = createDemoBlueprint();

        expect(blueprint.users.admins).toHaveLength(1);
        expect(blueprint.users.lecturers).toHaveLength(3);
        expect(blueprint.users.students).toHaveLength(9);
        expect(blueprint.courses).toHaveLength(4);
        expect(blueprint.groups.length).toBeGreaterThanOrEqual(6);
        expect(blueprint.sessionDiscussions.length).toBeGreaterThanOrEqual(8);
        expect(blueprint.learningGoals.length).toBeGreaterThanOrEqual(6);
        expect(blueprint.reflections.length).toBeGreaterThanOrEqual(12);
        expect(blueprint.aiChats.length).toBeGreaterThanOrEqual(4);
        expect(blueprint.notifications.length).toBeGreaterThanOrEqual(12);
    });

    it('includes analytics-supporting conversations and ai configuration', () => {
        const blueprint = createDemoBlueprint();

        expect(blueprint.discussions.length).toBeGreaterThanOrEqual(6);
        expect(blueprint.discussions.some((discussion) => discussion.profile === 'high')).toBe(true);
        expect(blueprint.discussions.some((discussion) => discussion.profile === 'moderate')).toBe(true);
        expect(blueprint.discussions.some((discussion) => discussion.profile === 'low')).toBe(true);
        expect(blueprint.aiProviders).toHaveLength(3);
        expect(blueprint.aiUsages.length).toBeGreaterThanOrEqual(8);
        expect(blueprint.auditLogs.length).toBeGreaterThanOrEqual(10);
        expect(blueprint.activityLogs.length).toBeGreaterThanOrEqual(18);
        expect(blueprint.silenceEvents.length).toBeGreaterThanOrEqual(2);
    });
});
