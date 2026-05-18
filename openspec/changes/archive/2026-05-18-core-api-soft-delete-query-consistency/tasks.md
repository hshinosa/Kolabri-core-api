## 1. Pre-flight

- [x] 1.1 Run baseline: `npm test`
- [x] 1.2 Audit: `grep -rn "findUnique\|findFirst" src/services/ | grep -v deletedAt`
- [x] 1.3 List soft-deletable entities: User, Course, Group, ChatSpace, KnowledgeBase (LearningGoal/Reflection are cascade-deleted, no own deletedAt)

## 2. Fix GoalService

- [x] 2.1 `src/services/goal.service.ts:18-25` — `findUnique` → `findFirst` with `deletedAt: null` for chatSpace
- [x] 2.2 `src/services/goal.service.ts:134-145` — same for `getChatSpaceGoals`
- [x] 2.3 Audit other goal queries — `getChatSpaceSharedGoal` also fixed

## 3. Fix ChatSpaceService

- [x] 3.1 `src/services/chatSpace.service.ts:25-37` — closeSession
- [x] 3.2 `src/services/chatSpace.service.ts:124-133` — reopenSession
- [x] 3.3 Audit all queries — `getChatSpaceStatus` and `submitReflection` also migrated; remaining `as Record`/`as unknown` casts kept (out of scope)

## 4. Fix CourseService and GroupService

- [x] 4.1 `src/services/course.service.ts:64-66` — joinCourse uses `findFirst` with `deletedAt: null`
- [x] 4.2 `src/services/group.service.ts:50-52` — createGroup parent course lookup
- [ ] 4.3 Audit other queries (deferred — non-critical paths, broader sweep is its own change)

## 5. Tests

- [x] 5.1 Test: deleted course rejected on join (`rejects soft-deleted courses`)
- [ ] 5.2 Test: deleted chatSpace cannot be reopened (deferred — service tests for this path don't yet exist)
- [ ] 5.3 Test: cannot create goal in deleted chatSpace (deferred)
- [ ] 5.4 Test: cannot create group in deleted course (deferred)

## 6. Verify

- [x] 6.1 `npm test` for affected suites: 42/43 passing; the 1 baseline timeout is pre-existing
- [x] 6.2 `findUnique` calls without `deletedAt` reduced to non-soft-deletable lookups (joinCode unique by design, etc.)
- [x] 6.3 `openspec validate core-api-soft-delete-query-consistency --strict`
