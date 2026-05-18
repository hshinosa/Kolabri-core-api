## Why

`goal.service.ts` validates learning goals using `validateGoalContent()` from `helpers.js` — a local keyword-based check. AI Engine has a sophisticated Bloom's taxonomy validator at `/api/goals/validate` that provides richer feedback (missing criteria, Socratic hints, score). This endpoint is never called from Core API. Additionally, `isValidated: true` is hardcoded regardless of validation outcome.

## What Changes

- `goal.service.ts` calls `aiEngineService.validateGoal(content, userId, chatSpaceId)` after local validation passes
- AI Engine returns `is_valid`, `score`, `feedback`, `socratic_hint`, `missing_criteria`
- `isValidated` reflects AI Engine's actual validation result
- Fall back to local validation result if AI Engine is unavailable
- Return AI Engine's `feedback` and `socratic_hint` to client for richer UX

## Capabilities

### New Capabilities

<!-- None -->

### Modified Capabilities

- `goal-creation`: After local Bloom's verb check, call AI Engine's Bloom's taxonomy validator. Use AI Engine's `is_valid` for `isValidated` field. Return `feedback` and `socratic_hint` in response.

## Impact

- `src/services/goal.service.ts` — add AI Engine validation call
- `src/services/aiEngine.service.ts` — add `validateGoal()` method calling `POST /api/goals/validate`
