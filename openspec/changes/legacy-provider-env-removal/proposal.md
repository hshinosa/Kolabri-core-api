## Why

After completing `unify-ai-provider-source-of-truth`, core-api is the authoritative provider source and all migrated flows pass `provider_context` to ai-engine. However, 9 ai-engine route handlers still call service getters without `provider_context`, silently falling back to `OPENAI_API_KEY`/`OPENAI_BASE_URL` env vars via the singleton pattern. This prevents disabling `UNIFIED_PROVIDER_COMPATIBILITY_MODE`, which blocks full removal of ai-engine's env var dependence and keeps a dual-source-of-truth risk alive.

## What Changes

- Migrate 9 remaining ai-engine route handlers to accept and propagate `provider_context` from request bodies to service getters
- Add `provider_context` resolution helpers to routes that lack them (`discussion_direction.py`, `groups.py`, `analytics.py`)
- Thread `provider_context` through `search_personal_rag()` helper in `chat.py`
- **BREAKING**: Set `UNIFIED_PROVIDER_COMPATIBILITY_MODE=False` as default after all routes are migrated
- Remove env var fallback guards from `llm.py` constructor and `document_processor.py` once compatibility mode is disabled
- Update production config validation to no longer require `OPENAI_API_KEY` as mandatory env var

## Capabilities

### New Capabilities
- `full-provider-context-coverage`: All ai-engine route handlers accept and propagate `provider_context`, eliminating the last env var fallback paths

### Modified Capabilities

## Impact

- **ai-engine routes**: `discussion_direction.py` (2 routes), `groups.py` (4 routes), `analytics.py` (3 routes), `interventions.py` (1 route), `goals.py` (1 route), `chat.py` (1 helper)
- **ai-engine services**: `llm.py` constructor fallback removal, `document_processor.py` vision client fallback removal
- **ai-engine config**: `UNIFIED_PROVIDER_COMPATIBILITY_MODE` default flip, `OPENAI_API_KEY` production validation relaxation
- **core-api**: No changes needed (already fully migrated)
- **Deployments**: `OPENAI_API_KEY` and `OPENAI_BASE_URL` can be removed from ai-engine environment after rollout
