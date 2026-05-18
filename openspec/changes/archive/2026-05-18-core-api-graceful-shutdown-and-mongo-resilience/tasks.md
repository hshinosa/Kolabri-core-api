## 1. Pre-flight

- [x] 1.1 Run baseline: `npm test`
- [x] 1.2 Read `src/server.ts`, `src/config/mongodb.ts`, Mongo usage in `src/socket/index.ts`
- [x] 1.3 Decided: Mongo required (Option B — chat is critical for the service)

## 2. Implement graceful shutdown

- [x] 2.1 `src/server.ts` — added `shutdown(signal)` function with re-entry guard
- [x] 2.2 Close in order: HTTP → Socket.IO → Prisma → Mongo
- [x] 2.3 Force-exit timeout (30 s) via `setTimeout(...).unref()`
- [x] 2.4 Logged each step (info on success, warn on individual close errors)
- [x] 2.5 Wired SIGTERM and SIGINT

## 3. Mongo resilience (Option B — required)

- [x] 3.1 `src/config/mongodb.ts` — `connectMongo()` now throws on failure (no silent continue)
- [x] 3.2 `src/server.ts` — `bootstrap()` already awaits `connectMongoDB()` before listen
- [x] 3.3 If bootstrap fails, exits 1 (existing catch path)

## 4. Tests

- [ ] 4.1 Integration: spawn process, SIGTERM, verify clean exit (deferred — env scaffolding heavy)
- [ ] 4.2 Bootstrap fails when MONGO_URL invalid (deferred — covered manually)

## 5. Verify

- [x] 5.1 `npm test` for affected suites passes
- [ ] 5.2 Manual: kubectl/docker SIGTERM, verify clean shutdown logs (deferred to staging)
- [x] 5.3 `openspec validate core-api-graceful-shutdown-and-mongo-resilience --strict`
