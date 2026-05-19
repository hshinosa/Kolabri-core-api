# Silence Intervention AI Path + Message Data Extraction

## Problem Statement

Two related issues with intervention messages in [src/socket/interventionMessages.ts](../../../src/socket/interventionMessages.ts):

### 1. Inconsistent AI usage between intervention paths

**Quality intervention** (`checkAndIntervenForQuality`) at [src/socket/index.ts:609-630](../../../src/socket/index.ts) tries AI Engine first (`analyzeIntervention` → `generatePrompt`) and falls back to hardcoded `QUALITY_INTERVENTIONS[type]` only when both fail.

**Silence intervention** (`triggerIntervention`) at [src/socket/index.ts:495-496](../../../src/socket/index.ts) skips AI entirely:

```typescript
const message = pickRandom(INTERVENTION_MESSAGES);
```

User-visible result: silence-driven nudges are always one of 5 generic strings ("Sepertinya diskusi sudah agak sepi..."). Quality-driven nudges are usually contextual AI-generated prompts. The handlers logically belong to the same intervention pipeline yet behave differently.

### 2. Message data is colocated with handler logic

`INTERVENTION_MESSAGES` and `QUALITY_INTERVENTIONS` are exported alongside `pickRandom` from `interventionMessages.ts`. Mixing data (Indonesian strings tied to specific bot personality) with helper functions makes future i18n or per-tenant customization expensive: any change to wording requires editing a TypeScript module containing logic.

## Proposed Solution

### Section A — Add AI path to silence intervention

Refactor `triggerIntervention` to follow the same fallback pattern as `checkAndIntervenForQuality`:

1. Try `aiEngineService.analyzeIntervention(...)` with `intervention_type: 'silence'`, providing recent room messages as context
2. If AI fails or returns unsuccessful, try `aiEngineService.generatePrompt('silence', 'low')`
3. If both fail, fall back to `pickRandom(INTERVENTION_MESSAGES)`

Behavior preserved: silence event still logged to MongoDB, bot ChatLog still persisted, broadcast unchanged, distributed silence lock still acquired first.

### Section B — Extract messages to data-only file

Move `INTERVENTION_MESSAGES` and `QUALITY_INTERVENTIONS` arrays to a new pure-data module [src/socket/data/interventionMessages.data.ts](../../../src/socket/data/interventionMessages.data.ts). The current `interventionMessages.ts` keeps `pickRandom` and re-exports the data for callers that already import from there (back-compat shim, no caller changes needed).

This sets up a future where `data/` can hold:
- Per-locale variants (`interventionMessages.id.ts`, `interventionMessages.en.ts`)
- Per-tenant overrides loaded from DB
without touching socket handler code.

## Scope

- Modify `triggerIntervention` in `src/socket/index.ts` to use AI-first/fallback pattern
- Create `src/socket/data/interventionMessages.data.ts` containing the two arrays
- Update `src/socket/interventionMessages.ts` to re-export from data file + own `pickRandom` only
- Add unit test verifying silence intervention falls back to hardcoded when AI fails
- Add unit test verifying silence intervention uses AI response when available

## Out of Scope

- Locale switching (English/Indonesian)
- Per-course customization
- Database-backed message templates
- Tone/persona configuration
