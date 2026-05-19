## 1. Pre-flight

- [x] 1.1 Run `npx vitest run src/socket` and capture green baseline
- [x] 1.2 Read existing `triggerIntervention` and `checkAndIntervenForQuality` in `src/socket/index.ts` to confirm AI-fallback pattern shape
- [x] 1.3 Confirm `aiEngineService.analyzeIntervention` and `aiEngineService.generatePrompt` signatures still match what quality path uses (note: `generatePrompt` difficulty enum is `'easy' | 'medium' | 'hard'`, not `'low' | 'medium' | 'high'`)

## 2. Section B — Data extraction (do first; mechanical)

- [x] 2.1 Created `src/socket/data/interventionMessages.data.ts` containing `INTERVENTION_MESSAGES` and `QUALITY_INTERVENTIONS` (verbatim)
- [x] 2.2 Refactored `src/socket/interventionMessages.ts` to re-export from data file and keep `pickRandom`
- [x] 2.3 `npx tsc --noEmit` clean
- [x] 2.4 `npx vitest run src/socket` green (62 pass)

## 3. Section A — AI path in `triggerIntervention`

- [x] 3.1 Extracted intervention pipeline into new `src/socket/interventions.ts` with `runSilenceIntervention(ctx, deps)` taking explicit `emit` + `onSent` callbacks (testable shape)
- [x] 3.2 AI primary calls `analyzeIntervention({ intervention_type: 'silence', force: true, ... })` with `recentMessages.reverse()` (chronological order, limit 10)
- [x] 3.3 AI secondary calls `generatePrompt('Diskusi sepi', '...', 'easy')` when primary returns unsuccessful
- [x] 3.4 Final fallback: `pickRandom(INTERVENTION_MESSAGES)` on success=false from both, OR on any thrown error
- [x] 3.5 Silence lock check still runs first (preserves distributed correctness)
- [x] 3.6 `triggerIntervention` in `src/socket/index.ts` now delegates to `runSilenceIntervention(...)` with thin emit/onSent wiring
- [x] 3.7 `lsp_diagnostics` clean on both files

## 4. Tests

- [x] 4.1 Created `src/socket/interventions.test.ts` with vi-hoisted mocks for `aiEngineService`, `ChatLog`, `SilenceEvent`, `interventionGate.tryAcquireSilenceLock`, `logger`
- [x] 4.2 AI primary success → ChatLog content matches AI message (`'AI nudge contextual'`)
- [x] 4.3 AI primary fail, secondary success → ChatLog content matches `generatePrompt` result
- [x] 4.4 Both AI fail → ChatLog content is in `INTERVENTION_MESSAGES`
- [x] 4.5 AI throws → catch falls back to hardcoded
- [x] 4.6 Silence lock not acquired → no AI call, no ChatLog save
- [x] 4.7 Bonus: `SilenceEvent` persisted before AI call (verifies ordering)
- [x] 4.8 Bonus: ChatLog.save() failure doesn't throw and emit is not called

## 5. Verify

- [x] 5.1 `npx tsc --noEmit` returns 0 errors
- [x] 5.2 `npx vitest run` shows 461 pass / 1 skipped / 0 failed (was 454 → 461, +7 new tests)
- [x] 5.3 `npm run build` exits 0
- [x] 5.4 `openspec validate core-api-silence-ai-and-message-extraction --strict` valid
