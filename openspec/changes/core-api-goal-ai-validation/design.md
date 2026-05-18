## Context

`goal.service.ts` line 69: `const validation = validateGoalContent(data.content)` — local keyword check for Bloom's taxonomy verbs. AI Engine has `POST /api/goals/validate` which calls `orchestrator.validate_goal()` → `goal_validator.py` with full Bloom's taxonomy analysis. The endpoint returns `{ is_valid, score, feedback, socratic_hint, missing_criteria }`.

`aiEngineService` does not currently have a `validateGoal()` method. Need to add it.

The current flow hardcodes `isValidated: true` after local validation passes. With AI Engine validation, `isValidated` should reflect AI Engine's `is_valid`.

## Goals / Non-Goals

**Goals:**
- Call AI Engine's Bloom's taxonomy validator after local validation passes
- Use AI Engine's `is_valid` for `isValidated` field in PostgreSQL
- Return `feedback` and `socratic_hint` to client for richer UX
- Fall back to local validation result if AI Engine unavailable

**Non-Goals:**
- Not replacing local validation — local check runs first as a fast pre-filter
- Not blocking goal creation if AI Engine is down — degrade gracefully

## Decisions

**D1: Local validation first, AI Engine second**
Local `validateGoalContent()` runs first. If it fails, reject immediately (no AI Engine call needed). If it passes, call AI Engine for richer validation.

**D2: AI Engine result determines `isValidated`**
If AI Engine is available and returns `is_valid: false`, set `isValidated: false` and return feedback to user. If AI Engine is unavailable, fall back to `isValidated: true` (local validation passed).

**D3: Return `feedback` and `socratic_hint` in response**
Extend the `createGoal` return type to include `feedback?: string` and `socratic_hint?: string` from AI Engine.

**D4: Add `validateGoal()` to `aiEngineService`**
`POST /api/goals/validate` with `{ goal_text, user_id, chat_space_id }`. Returns `{ is_valid, score, feedback, socratic_hint, missing_criteria }`.

## Risks / Trade-offs

- **[Risk] AI Engine adds latency to goal creation** → Mitigation: AI Engine goal validation is fast (no LLM, rule-based). Acceptable latency.
- **[Risk] AI Engine stricter than local validation** → Expected: AI Engine provides better feedback. Users get more helpful error messages.

## Open Questions

- Should `isValidated: false` prevent the goal from being saved, or save it as unvalidated for later review?
