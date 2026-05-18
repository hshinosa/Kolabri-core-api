## 1. Pre-flight

- [ ] 1.1 Run baseline: `npm test`
- [ ] 1.2 Read `src/server.ts`, `src/config/mongodb.ts`, Mongo usage in `src/socket/index.ts`
- [ ] 1.3 Decide: Mongo required or optional? (Recommend required for chat service)

## 2. Implement graceful shutdown

- [ ] 2.1 `src/server.ts` — add `gracefulShutdown` function
- [ ] 2.2 Close in order: HTTP → Socket.IO → Prisma → Mongo
- [ ] 2.3 Force-exit timeout (30s)
- [ ] 2.4 Log each step
- [ ] 2.5 Wire SIGTERM and SIGINT

## 3. Mongo resilience (Option B — required)

- [ ] 3.1 `src/config/mongodb.ts` — make `connectMongo()` throw on failure
- [ ] 3.2 `src/server.ts` — call `connectMongo()` in async `bootstrap()` before listen
- [ ] 3.3 If bootstrap fails, exit 1

## 4. Tests

- [ ] 4.1 Integration: spawn process, SIGTERM, verify clean exit
- [ ] 4.2 Bootstrap fails when MONGO_URL invalid

## 5. Verify

- [ ] 5.1 `npm test` passing
- [ ] 5.2 Manual: kubectl/docker SIGTERM, verify clean shutdown logs
- [ ] 5.3 `openspec validate core-api-graceful-shutdown-and-mongo-resilience --strict`
