## ADDED Requirements

### Requirement: Silence intervention MUST attempt AI generation before hardcoded fallback

`triggerIntervention` MUST first call `aiEngineService.analyzeIntervention` with `intervention_type: 'silence'` and recent room messages as context. If that call returns unsuccessful, the function MUST attempt `aiEngineService.generatePrompt('Diskusi sepi', ...)`. Only if both AI calls fail OR throw SHALL the function fall back to `pickRandom(INTERVENTION_MESSAGES)`.

#### Scenario: AI Engine returns a successful intervention message

- **GIVEN** silence timer fires for room R after 10 minutes of inactivity
- **AND** distributed silence lock is acquired
- **AND** `aiEngineService.analyzeIntervention(...)` returns `{ success: true, message: 'Tim, tadi kalian sedang...' }`
- **WHEN** `triggerIntervention` runs
- **THEN** the saved `ChatLog.content` equals the AI-returned message
- **AND** the broadcast `receive_message` payload `content` field equals the AI-returned message
- **AND** no hardcoded fallback string is referenced

#### Scenario: AI primary fails, secondary succeeds

- **GIVEN** silence intervention runs
- **AND** `analyzeIntervention` returns `{ success: false }`
- **AND** `generatePrompt('Diskusi sepi', ...)` returns `{ success: true, prompt: 'Bagaimana progress kalian?' }`
- **WHEN** `triggerIntervention` selects the message
- **THEN** the saved `ChatLog.content` equals the prompt result

#### Scenario: Both AI calls fail and hardcoded fallback is used

- **GIVEN** silence intervention runs
- **AND** both `analyzeIntervention` and `generatePrompt` throw or return `{ success: false }`
- **WHEN** `triggerIntervention` finalizes
- **THEN** `ChatLog.content` MUST be one of the strings in `INTERVENTION_MESSAGES`

#### Scenario: AI exception path still completes intervention

- **GIVEN** silence intervention runs
- **AND** `analyzeIntervention` throws an unexpected error
- **WHEN** the error propagates out of the AI call
- **THEN** the catch block selects `pickRandom(INTERVENTION_MESSAGES)`
- **AND** the silence event, ChatLog persistence, and broadcast still complete

### Requirement: Distributed silence lock MUST gate AI calls

The Redis `tryAcquireSilenceLock(roomId)` check MUST execute before any AI Engine call inside `triggerIntervention`. If the lock is held by another instance, the function SHALL return without making any external request.

#### Scenario: Concurrent silence intervention on multiple instances

- **GIVEN** silence timers on instance A and instance B both fire for the same room R
- **AND** instance A acquires the Redis lock first
- **WHEN** instance B enters `triggerIntervention`
- **THEN** instance B exits early before calling `aiEngineService`
- **AND** no duplicate ChatLog is persisted

### Requirement: Hardcoded message data MUST live in a data-only module

`INTERVENTION_MESSAGES` and `QUALITY_INTERVENTIONS` SHALL be defined in `src/socket/data/interventionMessages.data.ts`. The existing `src/socket/interventionMessages.ts` MUST re-export them and SHALL retain only the `pickRandom` helper.

#### Scenario: Data module is the source of truth

- **GIVEN** a developer wants to update an intervention message
- **WHEN** they look for where the strings live
- **THEN** the canonical location is `src/socket/data/interventionMessages.data.ts`
- **AND** `src/socket/interventionMessages.ts` does not contain the strings literal

#### Scenario: Existing imports continue to work

- **GIVEN** `src/socket/index.ts` and other callers import `{ INTERVENTION_MESSAGES, QUALITY_INTERVENTIONS, pickRandom }` from `./interventionMessages.js`
- **WHEN** the change ships
- **THEN** these imports MUST resolve and resolve to the same values as before
- **AND** no caller-side import path changes are required

### Requirement: Test suite MUST cover both AI-success and fallback paths

The change MUST include unit tests that exercise both the AI-success branch and the all-AI-fail branch of `triggerIntervention`.

#### Scenario: AI success branch covered

- **GIVEN** the silence intervention test suite
- **WHEN** running `npx vitest run` against the new tests
- **THEN** at least one test passes a mocked successful `analyzeIntervention` response and asserts the saved ChatLog content matches the AI message

#### Scenario: Fallback branch covered

- **GIVEN** the silence intervention test suite
- **WHEN** running `npx vitest run` against the new tests
- **THEN** at least one test mocks both AI methods to fail
- **AND** asserts the saved ChatLog content is in `INTERVENTION_MESSAGES`
