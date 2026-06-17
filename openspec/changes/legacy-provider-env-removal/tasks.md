## 1. Route migration — ai-engine provider_context propagation

- [x] 1.1 Add `provider_context` resolution helpers and request body fields to `discussion_direction.py` (`/classify-relevance`, `/session-summary`)
- [x] 1.2 Add `provider_context` resolution helpers and request body fields to `groups.py` (4 group monitoring routes)
- [x] 1.3 Add `provider_context` resolution helpers and request body fields to `analytics.py` (dashboard, process-mining, csv-export)
- [x] 1.4 Add `provider_context` to `/intervention/prompt` route in `interventions.py`
- [x] 1.5 Add `provider_context` to `/goals/refine` route in `goals.py`
- [x] 1.6 Update `search_personal_rag()` helper in `chat.py` to accept and propagate `provider_context` to `get_rag_pipeline()`

## 2. Compatibility mode removal

- [x] 2.1 Remove `use_env_fallback` branch from `llm.py` constructor — env vars no longer used as fallback
- [x] 2.2 Remove `UNIFIED_PROVIDER_COMPATIBILITY_MODE` config flag and all route-level compatibility checks
- [x] 2.3 Remove env var fallback from `document_processor.py` vision client initialization
- [x] 2.4 Update `config.py` production validation to no longer require `OPENAI_API_KEY`

## 3. Testing and verification

- [x] 3.1 Add tests verifying each migrated route correctly propagates `provider_context` to service getters
- [x] 3.2 Add test verifying `get_llm_service()` raises `ValueError` when called without `provider_context` and no env vars
- [x] 3.3 Run full ai-engine test suite and verify all tests pass
- [x] 3.4 Run core-api test suite to verify no regressions
