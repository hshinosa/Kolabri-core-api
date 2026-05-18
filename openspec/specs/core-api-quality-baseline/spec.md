# core-api-quality-baseline Specification

## Purpose
TBD - created by archiving change core-api-baseline-typecheck-and-test-hygiene. Update Purpose after archive.
## Requirements
### Requirement: Build emits zero TypeScript errors

`npx tsc --noEmit` against `src/` MUST exit with code 0 and no errors reported.

#### Scenario: Clean tsc run

- **WHEN** `npx tsc --noEmit` runs in the project root
- **THEN** stderr/stdout contain no `error TS` lines
- **AND** the process exits 0

### Requirement: Test suite has no timeouts under default 5 s budget

All test files under `src/` MUST complete within vitest's default 5000 ms per-test timeout. The full suite SHALL pass through `npx vitest run` without any test reaching that limit.

#### Scenario: Vitest run completes without timeout failures

- **WHEN** `npx vitest run` executes the full suite
- **THEN** the failure summary reports 0 timeouts

### Requirement: All OpenSpec changes pass strict validation

`openspec validate --all --strict` MUST report zero failures across every change directory under `openspec/changes/`.

#### Scenario: Strict-validate passes

- **WHEN** `openspec validate --all --strict` runs
- **THEN** the totals line shows `0 failed`

