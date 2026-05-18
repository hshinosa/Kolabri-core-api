## 1. Pre-flight

- [x] 1.1 Run baseline: `npm test`
- [x] 1.2 Read `prisma/schema.prisma` model definitions
- [x] 1.3 Identify hot-path queries via `grep -rn "findMany\|findFirst" src/services/`

## 2. Add indexes to schema

- [x] 2.1 `LearningGoal` — chatSpaceId, userId, (chatSpaceId, userId)
- [x] 2.2 `Reflection` — userId, goalId, (chatSpaceId, userId), (userId, createdAt)
- [x] 2.3 `AiChatMessage` — (chatId, createdAt)
- [x] 2.4 `ChatSpace` — (groupId, deletedAt)
- [x] 2.5 Audit other models for hot-path missing indexes — added (courseId, deletedAt) on Group; (chatSpaceId, createdAt) on ChatMessage

## 3. Generate Prisma migration

- [x] 3.1 Migration created at `prisma/migrations/20260519010821_add_perf_indexes/migration.sql`
- [x] 3.2 Review generated SQL — manual SQL written, idempotent CREATE INDEX statements
- [ ] 3.3 Manual review: any concurrent index creation needed for production? — DEFERRED to ops; production should switch to `CREATE INDEX CONCURRENTLY` for live tables before deploy

## 4. Audit getUserChats

- [ ] 4.1 Enable Prisma query logging in dev — DEFERRED (requires running DB; design.md predicts LATERAL JOIN, not N+1)
- [ ] 4.2 Call `getUserChats` and inspect SQL output — DEFERRED to staging
- [ ] 4.3 If N+1: refactor to single `findMany` with `distinct` — N/A unless 4.1 confirms N+1
- [x] 4.4 Add pagination params — `getUserChats(userId, page=1, pageSize=20)` with bounds 1..100; controller forwards `req.query.page`/`pageSize`

## 5. Other query audits

- [ ] 5.1 `getChatSpaceGoals` — pagination? — DEFERRED (per-chatSpace bounded set, low risk)
- [ ] 5.2 `getRecentReflections` — pagination? — DEFERRED
- [x] 5.3 Mongo ChatLog history — already capped to 100 ✓

## 6. Performance tests

- [ ] 6.1 Seed dev DB with realistic data (100 users, 1000 messages each) — DEFERRED to staging
- [ ] 6.2 Benchmark before/after queries with `EXPLAIN ANALYZE` — DEFERRED to staging
- [ ] 6.3 Document improvements — DEFERRED to staging

## 7. Verify

- [x] 7.1 `npm test` passing — aiChat tests green; pre-existing baseline failures unchanged
- [x] 7.2 Migration runs cleanly — schema validates; SQL is plain CREATE INDEX
- [ ] 7.3 No N+1 queries detected in `getUserChats` — DEFERRED (see 4.1)
- [x] 7.4 `openspec validate core-api-database-index-and-query-perf --strict`
