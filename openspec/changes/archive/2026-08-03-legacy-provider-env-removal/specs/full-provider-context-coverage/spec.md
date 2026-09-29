## ADDED Requirements

### Requirement: All ai-engine routes accept provider_context
Every ai-engine HTTP route handler SHALL accept an optional `provider_context` field in its request body and propagate it to the underlying service getter (`get_llm_service`, `get_orchestrator`, `get_intervention_service`, `get_rag_pipeline`, `get_document_processor`).

#### Scenario: Route receives provider_context
- **WHEN** a client sends a request with `provider_context` in the body
- **THEN** the route SHALL pass the resolved provider context dict to the service getter, creating a request-scoped LLM client

#### Scenario: Route receives no provider_context
- **WHEN** a client sends a request without `provider_context`
- **THEN** the route SHALL call the service getter with `provider_context=None`, using the singleton fallback path

### Requirement: Discussion direction routes use provider_context
The `/classify-relevance` and `/session-summary` endpoints in `discussion_direction.py` SHALL accept `provider_context` and pass it to `get_llm_service()`.

#### Scenario: classify-relevance with provider_context
- **WHEN** `/classify-relevance` receives a request with `provider_context`
- **THEN** the LLM call SHALL use the credentials and model from `provider_context`

#### Scenario: session-summary with provider_context
- **WHEN** `/session-summary` receives a request with `provider_context`
- **THEN** the LLM call SHALL use the credentials and model from `provider_context`

### Requirement: Group monitoring routes use provider_context
All 4 group monitoring endpoints in `groups.py` SHALL accept `provider_context` and pass it to `get_orchestrator()`.

#### Scenario: Group route with provider_context
- **WHEN** any `/groups/*` endpoint receives a request with `provider_context`
- **THEN** the orchestrator and all its child services (RAG, intervention, LLM) SHALL use the resolved provider context

### Requirement: Analytics routes use provider_context
All analytics endpoints (`/dashboard`, `/process-mining`, `/csv-export`) in `analytics.py` SHALL accept `provider_context` and pass it to `get_orchestrator()`.

#### Scenario: Analytics route with provider_context
- **WHEN** any analytics endpoint receives a request with `provider_context`
- **THEN** the orchestrator SHALL use the resolved provider context for all AI calls

### Requirement: Intervention prompt route uses provider_context
The `/intervention/prompt` endpoint in `interventions.py` SHALL accept `provider_context` and pass it to `get_intervention_service()`.

#### Scenario: Intervention prompt with provider_context
- **WHEN** `/intervention/prompt` receives a request with `provider_context`
- **THEN** the intervention service SHALL use the resolved provider context for AI prompt generation

### Requirement: Goal refine route uses provider_context
The `/goals/refine` endpoint in `goals.py` SHALL accept `provider_context` and pass it to `get_orchestrator()`.

#### Scenario: Goal refine with provider_context
- **WHEN** `/goals/refine` receives a request with `provider_context`
- **THEN** the orchestrator SHALL use the resolved provider context for goal refinement AI calls

### Requirement: search_personal_rag helper propagates provider_context
The `search_personal_rag()` helper in `chat.py` SHALL accept an optional `provider_context` parameter and pass it to `get_rag_pipeline()`.

#### Scenario: Personal chat search with provider_context
- **WHEN** `/chat/personal` calls `search_personal_rag()` with `provider_context`
- **THEN** the RAG pipeline SHALL use the resolved provider context for search and LLM calls

### Requirement: Compatibility mode removal
After all routes are migrated, `UNIFIED_PROVIDER_COMPATIBILITY_MODE` SHALL be removed from config and all route resolution helpers. The `llm.py` constructor SHALL NOT fall back to `settings.OPENAI_API_KEY` or `settings.OPENAI_BASE_URL`. The `get_llm_service()` singleton path SHALL raise `ValueError` when called without `provider_context`.

#### Scenario: No provider_context and no env vars
- **WHEN** `get_llm_service()` is called without `provider_context` and `OPENAI_API_KEY` is empty
- **THEN** a `ValueError` SHALL be raised with a clear message indicating `provider_context` is required

#### Scenario: Config validation does not require OPENAI_API_KEY
- **WHEN** the ai-engine starts in production with `OPENAI_API_KEY` unset
- **THEN** startup SHALL succeed without validation errors (provider credentials come from core-api)
