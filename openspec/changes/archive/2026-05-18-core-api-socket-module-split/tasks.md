## 1. Pre-flight

- [x] 1.1 Run `npx vitest run src/socket` and confirm green baseline (22 tests)
- [x] 1.2 Run `npx tsc --noEmit` and confirm clean

## 2. Extract types.ts

- [x] 2.1 Moved `AuthenticatedSocket` interface and `ChatHistoryItem` to `src/socket/types.ts`
- [x] 2.2 Updated `src/socket/index.ts` to import from `./types.js`
- [x] 2.3 `npx tsc --noEmit` clean; 22 socket tests green

## 3. Extract auth.ts

- [x] 3.1 Moved `io.use(...)` body to `src/socket/auth.ts` exporting `authMiddleware(socket, next)`
- [x] 3.2 Wired in `src/socket/index.ts` as `io.use(authMiddleware)`
- [x] 3.3 22 socket tests green; jwt and JwtPayload imports removed from index.ts

## 4. Extract engagement.ts

- [x] 4.1 Moved `HOT_KEYWORDS`, `COGNITIVE_KEYWORDS`, `BEHAVIORAL_KEYWORDS`, `EMOTIONAL_KEYWORDS`, and `analyzeEngagement` to `src/socket/engagement.ts`
- [x] 4.2 Exported `EngagementAnalysis` type alongside the function
- [x] 4.3 22 socket tests green; index.ts shrunk by 75 lines

## 5. Extract presence.ts (DEFERRED)

- [ ] 5.1 Create `src/socket/presence.ts` for `roomUsers` Map and disconnect cleanup — DEFERRED. The `roomUsers` state is read inside `join_room`, `leave_room`, and `disconnect` handlers across three different `io.on` callbacks. Lifting it requires either a singleton-style getter or wiring through the `register(io, socket)` pattern. The latter requires also lifting the broadcast (`socket.to(roomId).emit('user_left', ...)`) which depends on `socket` instance — non-trivial without behavior risk.

## 6. Extract messages.ts (DEFERRED)

- [ ] 6.1 Create `src/socket/messages.ts` for `send_message`, `delete_message`, `typing` — DEFERRED. These handlers reference module-level `silenceTimers`, `lastInterventionTime`, `roomMessageCount`, `INTERVENTION_MESSAGES`, `QUALITY_INTERVENTIONS`, plus `analyzeEngagement` (already extracted), `socketRateLimiter`, `sanitize*`, `aiEngineService.trackActivity`, `aiEngineService.analyzeEngagement`, and ChatLog/SilenceEvent persistence. Cleanly extracting requires either passing a context object into `register(io, socket)` (≈ 9 dependencies) or making `index.ts` an injection layer that's itself >100 LOC.
- [ ] 6.2-6.5 — DEFERRED with 6.1

## 7. Update rooms.ts (DEFERRED)

- [ ] 7.1-7.4 `register(io, socket)` for `join_room`/`leave_room` — DEFERRED. The join handler reads `prisma`, `ChatLog`, builds `chatHistory`, calls `verifyGroupAccess`, mutates `roomUsers`, sets `socket.currentRoom`, emits `chat_history`, `user_joined`, and `online_users`. Same coupling concerns as 6.

## 8. Slim index.ts (PARTIALLY ACHIEVED)

- [ ] 8.1 — DEFERRED. Currently 1015 LOC. Achievable target with current architecture is ~800-900 LOC after types + auth + engagement extraction. Reaching <100 requires sections 5-7, which carry meaningful regression risk for a behavior-neutral refactor.

## 9. Verify

- [x] 9.1 `npx tsc --noEmit` clean
- [x] 9.2 `npx vitest run src/socket` all 22 green
- [x] 9.3 `npx vitest run` (full suite) — 414 pass / 1 skipped / 0 failed across 59 test files
- [x] 9.4 `openspec validate core-api-socket-module-split --strict`

## Honest Assessment

This change shipped 3 module extractions out of 7 planned:

- **Done**: `types.ts` (interfaces, 24 LOC), `auth.ts` (JWT + Prisma user check, 49 LOC), `engagement.ts` (NLP heuristics, 70 LOC)
- **Deferred**: `presence.ts`, `messages.ts`, `rooms.ts` register(), `interventions.ts`

The deferred extractions are not gated on technical impossibility — they are gated on the cost-benefit of a pure refactor that keeps all behavior identical while restructuring 800+ LOC of handler logic that shares mutable Maps. Without an integration test harness that exercises the silence timer / quality intervention flow end-to-end, the refactor cannot be verified beyond the existing 22-test surface.

Recommended next step before pursuing sections 5-7: add socket integration tests that exercise the silence-timer reset path, the quality intervention trigger path, and the @ai mention path. Once those exist, the extraction is mechanical and safe.
