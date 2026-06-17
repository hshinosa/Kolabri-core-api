## Context

The `unify-ai-provider-source-of-truth` change established core-api as the authoritative provider source. All migrated core-api callers use `executeWithFallback` with `providerResolutionService`, and all ai-engine services accept `provider_context`. A `UNIFIED_PROVIDER_COMPATIBILITY_MODE` flag (default `True`) was kept as a safety net, allowing env var fallback when routes haven't been migrated yet.

An audit found 9 ai-engine route handlers (across 5 files) that still call service getters without `provider_context`, silently falling back to `OPENAI_API_KEY`/`OPENAI_BASE_URL` via the singleton pattern. These routes block disabling compatibility mode and keep a dual-source-of-truth risk.

The core-api side is fully migrated — no changes needed there.

## Goals / Non-Goals

**Goals:**
- Migrate all 9 remaining ai-engine routes to accept and propagate `provider_context`
- Disable `UNIFIED_PROVIDER_COMPATIBILITY_MODE` as default
- Remove env var fallback code from `llm.py` constructor and `document_processor.py`
- Remove `OPENAI_API_KEY` from mandatory production env vars
- Enable clean deployment where ai-engine has zero env var provider dependence

**Non-Goals:**
- Changing the `ProviderContextV1` schema (already stable from previous change)
- Adding new feature flags per route (all routes migrate together in this change)
- Removing the singleton pattern from `get_llm_service()` (still useful for health checks and non-AI paths)
- Modifying core-api (already complete)

## Decisions

### 1. All routes migrate in a single batch (no per-route feature flags)

**Rationale**: The previous change already has per-feature flags (`UNIFIED_PROVIDER_PERSONAL_CHAT`, `UNIFIED_PROVIDER_ORCHESTRATION`, etc.). Adding 9 more flags for the remaining routes would create combinatorial complexity. These routes are lower-traffic internal endpoints (group monitoring, analytics, discussion direction). Migrating them all at once is simpler and lower-risk.

**Alternative considered**: Per-route flags for gradual rollout — rejected because the routes are simple and well-tested.

### 2. Reuse existing `resolve_provider_context()` pattern

Each route file that already has the helper (`chat.py`, `orchestration.py`, `interventions.py`, `goals.py`) keeps it. New route files (`discussion_direction.py`, `groups.py`, `analytics.py`) get their own `resolve_provider_context()` and `dump_provider_context()` helpers following the same pattern.

**Rationale**: Consistent with existing codebase patterns. No need to extract into a shared module — each route file is self-contained.

### 3. Remove compatibility mode code entirely (not just flip default)

After all routes are migrated, remove:
- The `use_env_fallback` branch in `llm.py` constructor
- The `UNIFIED_PROVIDER_COMPATIBILITY_MODE` check in `get_llm_service()`
- The env var fallback in `document_processor.py` vision client
- The config flag itself

**Rationale**: Dead code is worse than no code. Keeping the compatibility path after migration creates confusion and maintenance burden. The `unify-ai-provider-source-of-truth` runbook already documents rollback via code revert, not flag toggle.

### 4. Keep `OPENAI_API_KEY` as optional env var (not deleted from config)

The config field stays with empty default, but production validation no longer requires it. This allows operators who haven't migrated to still set it, without forcing it on everyone.

## Risks / Trade-offs

- **[Risk] Routes called without provider_context will crash** → Mitigation: All 9 routes get provider_context support before compatibility mode removal. Tests verify each route works with and without provider_context in request body.
- **[Risk] External callers (curl, scripts) may not send provider_context** → Mitigation: Routes gracefully handle missing provider_context by falling back to singleton (which will fail with clear error if no env vars set). Add clear error message.
- **[Trade-off] Removing compatibility mode is a one-way door** → Accepted: Rollback strategy is code revert (documented in runbook). No data migration involved.
