## 1. Pre-flight

- [ ] 1.1 Run baseline: `npm test`
- [ ] 1.2 Audit `process.env` usages: `grep -rn 'process.env' src/`
- [ ] 1.3 List all required env vars (from `.env.example` + grep)

## 2. Create env validator

- [ ] 2.1 Add zod dependency if not present
- [ ] 2.2 Create `src/config/env.ts` with schema for all required vars
- [ ] 2.3 Export validated `env` constant + `loadEnv()` function
- [ ] 2.4 Use Zod refinement for secrets (min length, format)

## 3. Wire startup validation

- [ ] 3.1 Import `env` at top of `src/server.ts` (triggers validation)
- [ ] 3.2 Replace `process.env.PORT` etc. in server.ts with `env.PORT`
- [ ] 3.3 Log selected non-secret values at startup for operational visibility

## 4. Tests

- [ ] 4.1 Unit test: valid env passes
- [ ] 4.2 Unit test: missing CORE_API_SECRET fails with clear message
- [ ] 4.3 Unit test: short JWT_SECRET (< 32 chars) fails
- [ ] 4.4 Integration test: boot with missing var exits 1

## 5. Update .env.example

- [ ] 5.1 Document all required vars with comments
- [ ] 5.2 Note minimum requirements (e.g., "JWT_SECRET ≥32 chars")

## 6. Verify

- [ ] 6.1 `npm test` passing
- [ ] 6.2 `npm start` with missing var → exits with clear error
- [ ] 6.3 `openspec validate core-api-startup-config-validation --strict`
