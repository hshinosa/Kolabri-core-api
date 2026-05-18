## 1. Pre-flight

- [ ] 1.1 Run baseline: `npm test`
- [ ] 1.2 Audit: `grep -rn "findUnique\|findFirst" src/services/ | grep -v deletedAt`
- [ ] 1.3 List soft-deletable entities: User, Course, Group, ChatSpace, LearningGoal, Reflection

## 2. Fix GoalService

- [ ] 2.1 `src/services/goal.service.ts:18-25` — add `deletedAt: null` for chatSpace
- [ ] 2.2 `src/services/goal.service.ts:134-145` — same
- [ ] 2.3 Audit other goal queries for User/ChatSpace lookup

## 3. Fix ChatSpaceService

- [ ] 3.1 `src/services/chatSpace.service.ts:25-37` — closeSession
- [ ] 3.2 `src/services/chatSpace.service.ts:124-133` — reopenSession
- [ ] 3.3 Audit all queries; remove `as any`/`as Record` casts where possible

## 4. Fix CourseService and GroupService

- [ ] 4.1 `src/services/course.service.ts:64-66` — joinCourse
- [ ] 4.2 `src/services/group.service.ts:50-52` — createGroup parent course lookup
- [ ] 4.3 Audit other queries

## 5. Tests

- [ ] 5.1 Test: deleted chatSpace cannot be reopened
- [ ] 5.2 Test: cannot create goal in deleted chatSpace
- [ ] 5.3 Test: cannot join deleted course
- [ ] 5.4 Test: cannot create group in deleted course

## 6. Verify

- [ ] 6.1 `npm test` passing
- [ ] 6.2 `grep -rn "findUnique\|findFirst" src/services/ | grep -v deletedAt` returns only hard-delete-acceptable cases (documented)
- [ ] 6.3 `openspec validate core-api-soft-delete-query-consistency --strict`
