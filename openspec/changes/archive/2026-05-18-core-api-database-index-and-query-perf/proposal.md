# Database Index and Query Performance

## Problem Statement

Two performance gaps:

### 1. Missing indexes on frequently queried columns

`prisma/schema.prisma` lacks indexes on hot-path columns:

| Table | Missing index | Query pattern |
|---|---|---|
| `LearningGoal` | `chatSpaceId`, `userId` | per-chatSpace + per-user goal lookups |
| `Reflection` | `(chatSpaceId, userId)`, `goalId` | dashboard queries |
| `AiChatMessage` | `(chatId, createdAt)` | history pagination |
| `ChatSpace` | `(groupId, deletedAt)` composite | active chatSpace filtering |

Schema lines: `LearningGoal` at `prisma/schema.prisma:235-249`, `Reflection` at `prisma/schema.prisma:252-267`.

### 2. N+1 risk

`AiChatService.getUserChats` (`src/services/aiChat.service.ts:30-39`) uses nested include for `lastMessage`. Prisma may issue separate queries per chat.

## Proposed Solution

1. Add missing indexes via Prisma migration
2. Add explicit `take: 1` + `orderBy` for last message subquery (or use `select` with raw SQL)
3. Audit `getUserChats` SQL output via `prisma.$on('query')` to confirm

## Scope

- `prisma/schema.prisma` — add 5+ indexes
- `prisma migrate` — generate migration
- `src/services/aiChat.service.ts` — review nested include, add pagination
- Performance tests if benchmark exists

## Out of Scope

- Materialized views
- Database engine change
- Sharding
