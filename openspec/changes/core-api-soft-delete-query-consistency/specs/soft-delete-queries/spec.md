# Soft-Delete Query Consistency

## ADDED Requirements

### Requirement: Service queries on soft-deletable entities MUST filter deletedAt

Service-layer queries on `User`, `Course`, `Group`, `ChatSpace`, `LearningGoal`, `Reflection` SHALL include `deletedAt: null` in the where clause unless the operation explicitly targets soft-deleted entities (e.g., admin restore).

#### Scenario: Reopen deleted chatSpace

- Given a chatSpace was soft-deleted (`deletedAt` set)
- When a user attempts `reopenSession` on that chatSpace
- Then the service MUST query with `where: { id, deletedAt: null }`
- And MUST return a NotFound error
- And MUST NOT mark the deleted chatSpace as reopened

#### Scenario: Create goal in deleted chatSpace

- Given a chatSpace is soft-deleted
- When `GoalService.createGoal` looks up the chatSpace
- Then the lookup MUST exclude soft-deleted records
- And MUST reject goal creation with 404

#### Scenario: Join deleted course

- Given a course is soft-deleted
- When a user attempts to join via `joinCourse`
- Then the service MUST reject with 404

### Requirement: Soft-delete filter MUST be enforced via repository or test guard

The codebase SHALL include either:
- Repository helpers like `findActiveChatSpace(id)` that always apply `deletedAt: null`
- OR a static test that fails if any service-layer `findUnique`/`findFirst` call on soft-deletable entities lacks the filter

#### Scenario: Static enforcement test

- Given the static test runs
- When it scans `src/services/*.service.ts` for `findUnique`/`findFirst` calls
- Then any call on a soft-deletable entity without `deletedAt` filter MUST cause test failure
