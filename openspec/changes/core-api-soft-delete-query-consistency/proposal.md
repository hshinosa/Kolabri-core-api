# Soft-Delete Query Consistency

## Problem Statement

Soft-deleted entities can be loaded by service queries that use `findUnique` or `findFirst` without a `deletedAt: null` filter:

- `GoalService.createGoal` — chatSpace lookup at `src/services/goal.service.ts:18-25`
- `GoalService.getChatSpaceGoals` at `src/services/goal.service.ts:134-145`
- `ChatSpaceService.closeSession` at `src/services/chatSpace.service.ts:25-37`
- `ChatSpaceService.reopenSession` at `src/services/chatSpace.service.ts:124-133`
- `CourseService.joinCourse` at `src/services/course.service.ts:64-66`
- `GroupService.createGroup` course lookup at `src/services/group.service.ts:50-52`

Effect: deleted resources can be reopened, joined, or used as parent for new entities. Soft-delete promise is broken.

## Proposed Solution

1. Add `deletedAt: null` to all `findUnique`/`findFirst` calls on soft-deletable entities
2. Optionally introduce repository helpers (`findActiveById(id)`) for centralized enforcement
3. Add tests verifying deleted parent entities are rejected by these flows

## Scope

- All `src/services/*.service.ts` queries on User, Course, Group, ChatSpace, LearningGoal, Reflection
- Tests for deleted-parent rejection paths
