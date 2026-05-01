# Changelog

## [1.1.0] - 2026-05-01

### Added
- Rate limiting middleware with configurable thresholds
- Database indexes for performance optimization
- Course clone endpoint (`POST /api/courses/:id/clone`)
- Bulk operations endpoints (users, courses)
- AI provider adapters (OpenAI, Gemini, Anthropic)
- Usage tracking for AI providers
- WebSocket server for real-time admin events
- Audit log service with full CRUD history
- Unit tests: auth middleware, rate limiter, AI engine service, validators (22 tests)
- GitHub Actions CI workflow (build + vitest)
- DEPLOYMENT.md with Docker Compose guide
- Vitest configuration

### Changed
- Removed deprecated `baseUrl` from tsconfig.json
- Cleaned up unused imports across 6 files
- Fixed ESLint errors (empty catch block, unused vars, explicit any)

### Fixed
- All ESLint errors and warnings resolved (0 issues)
- TypeScript compilation clean (0 errors)
- AI Engine service properly handles all 14 endpoint mappings

### Integration
- All 14 `aiEngineService` methods verified against AI Engine endpoints
- Health check, RAG query, document ingest, orchestrated chat, interventions, analytics all mapped
