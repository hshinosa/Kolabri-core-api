# Startup Configuration Validation

## Problem Statement

Critical environment variables (e.g., `CORE_API_SECRET`, `JWT_SECRET`, `DATABASE_URL`, `AI_ENGINE_URL`) are not validated at startup. Misconfiguration only surfaces at runtime when the variable is first used:

- `src/routes/webhook.routes.ts:10-12` — webhook handler rejects request when `CORE_API_SECRET` missing, but service started normally
- AI Engine integration silently fails on first call if `AI_ENGINE_URL` undefined
- Database connection errors only show on first query

This causes deployments to "succeed" while critical features are silently broken until first user traffic exercises them.

## Proposed Solution

Add a startup validation step in `src/server.ts` (before `app.listen`) that:
1. Loads required env vars via Zod schema
2. Fails fast with clear error message if any required var is missing or malformed
3. Logs configured (non-secret) values for operational visibility

## Scope

- Create `src/config/env.ts` with Zod schema for all env vars
- Validate at server boot in `src/server.ts`
- Optional: replace ad-hoc `process.env.X` reads with typed `env.X` imports
- Add startup test verifying boot fails when required var missing

## Out of Scope

- Hot config reload
- Secret rotation
- External secret manager integration
