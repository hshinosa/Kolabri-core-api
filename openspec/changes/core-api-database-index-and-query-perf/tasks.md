## 1. Pre-flight

- [ ] 1.1 Run baseline: `npm test`
- [ ] 1.2 Read `prisma/schema.prisma` model definitions
- [ ] 1.3 Identify hot-path queries via `grep -rn "findMany\|findFirst" src/services/`

## 2. Add indexes to schema

- [ ] 2.1 `LearningGoal` — chatSpaceId, userId, (chatSpaceId, deletedAt)
- [ ] 2.2 `Reflection` — (chatSpaceId, userId), goalId, (userId, createdAt)
- [ ] 2.3 `AiChatMessage` — (chatId, createdAt)
- [ ] 2.4 `ChatSpace` — (groupId, deletedAt)
- [ ] 2.5 Audit other models for hot-path missing indexes

## 3. Generate Prisma migration

- [ ] 3.1 `npx prisma migrate dev --name add-perf-indexes`
- [ ] 3.2 Review generated SQL
- [ ] 3.3 Manual review: any concurrent index creation needed for production?

## 4. Audit getUserChats

- [ ] 4.1 Enable Prisma query logging in dev
- [ ] 4.2 Call `getUserChats` and inspect SQL output
- [ ] 4.3 If N+1: refactor to single `findMany` with `distinct`
- [ ] 4.4 Add pagination params

## 5. Other query audits

- [ ] 5.1 `getChatSpaceGoals` — pagination?
- [ ] 5.2 `getRecentReflections` — pagination?
- [ ] 5.3 Mongo ChatLog history — already capped to 100 ✓

## 6. Performance tests

- [ ] 6.1 Seed dev DB with realistic data (100 users, 1000 messages each)
- [ ] 6.2 Benchmark before/after queries with `EXPLAIN ANALYZE`
- [ ] 6.3 Document improvements

## 7. Verify

- [ ] 7.1 `npm test` passing
- [ ] 7.2 Migration runs cleanly
- [ ] 7.3 No N+1 queries detected in `getUserChats`
- [ ] 7.4 `openspec validate core-api-database-index-and-query-perf --strict`
