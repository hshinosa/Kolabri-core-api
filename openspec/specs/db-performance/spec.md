# db-performance Specification

## Purpose
TBD - created by archiving change core-api-database-index-and-query-perf. Update Purpose after archive.
## Requirements
### Requirement: Hot-path columns MUST have indexes

The Prisma schema SHALL define indexes on every column or column-pair used in `WHERE` clauses for queries executed on every user request.

#### Scenario: Per-chatSpace goal listing

- Given the schema declares `LearningGoal.chatSpaceId`
- When a query filters `WHERE chatSpaceId = ?`
- Then `LearningGoal` MUST have `@@index([chatSpaceId])` (or composite covering it)
- And the SQL execution plan MUST use the index, not a full scan

#### Scenario: Active resources per parent

- Given the schema declares soft-delete via `deletedAt`
- When a query filters `WHERE groupId = ? AND deletedAt IS NULL`
- Then a composite index `@@index([groupId, deletedAt])` MUST exist

### Requirement: List queries MUST paginate

Service methods returning lists of user-facing resources SHALL accept `page` and `pageSize` parameters and MUST limit returned rows.

#### Scenario: Get user chats

- Given a user with 1000 AI chats
- When `getUserChats(userId)` is called without pagination
- Then the response MUST cap at the default page size (e.g., 20)
- And the response MUST include `total` count or pagination metadata

### Requirement: List queries MUST avoid N+1

Service methods that fetch a list with related entities SHALL use Prisma `include` with `take` + `orderBy`, OR perform a single follow-up query with `IN` clause.

#### Scenario: Get user chats with last message

- Given a query for 20 user chats with last message each
- When the SQL is generated
- Then total query count MUST be ≤ 2 (chats query + last-messages query)
- And MUST NOT issue 1 query per chat

