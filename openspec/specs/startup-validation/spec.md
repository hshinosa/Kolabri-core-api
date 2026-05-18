# startup-validation Specification

## Purpose
TBD - created by archiving change core-api-startup-config-validation. Update Purpose after archive.
## Requirements
### Requirement: Service MUST validate environment at startup

The Core API SHALL validate all required environment variables at startup. If any required variable is missing or malformed, the process MUST exit with non-zero status before accepting any traffic.

#### Scenario: Missing CORE_API_SECRET on boot

- Given the environment does not define `CORE_API_SECRET`
- When the service starts
- Then the process MUST log an error indicating which variable is missing
- And the process MUST exit with code 1
- And `app.listen` MUST NOT be called

#### Scenario: Malformed AI_ENGINE_URL

- Given `AI_ENGINE_URL` is set to a non-URL string
- When the service starts
- Then the process MUST exit with a clear error message
- And the error MUST identify the variable name

### Requirement: Required environment variables are documented

The repository SHALL include `.env.example` listing every required variable with format/constraint comments. The Zod schema in `src/config/env.ts` SHALL be the source of truth.

#### Scenario: New env var added

- Given a developer adds a new required env var to the schema
- When they commit the change
- Then `.env.example` MUST be updated to include the variable
- And the variable MUST be documented with its constraint

