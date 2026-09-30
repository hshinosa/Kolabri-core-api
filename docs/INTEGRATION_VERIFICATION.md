# Kolabri Platform - Integration Verification

## Architecture

```
Client App (Laravel+React) → Core API (Express+Prisma) → AI Engine (FastAPI)
     :8000                       :3000                       :8001
```

## Endpoint Mapping (Core API → AI Engine)

| Core API Method | Core API Call | AI Engine Endpoint | Status |
|---|---|---|---|
| `isAvailable()` | `GET /health` | `GET /api/health` | Verified |
| `ask()` | `POST /ask` | `POST /api/ask` | Verified |
| `ingestDocument()` | `POST /ingest` | `POST /api/ingest` | Verified |
| `deleteDocument()` | `DELETE /documents/:id` | `DELETE /api/documents/:id` | Verified |
| `ingestBatch()` | `POST /ingest/batch` | `POST /api/ingest/batch` | Verified |
| `analyzeIntervention()` | `POST /intervention/analyze` | `POST /api/intervention/analyze` | Verified |
| `generateSummary()` | `POST /intervention/summary` | `POST /api/intervention/summary` | Verified |
| `generatePrompt()` | `POST /intervention/prompt` | `POST /api/intervention/prompt` | Verified |
| `personalChatStream()` | `POST /chat/personal/stream` | `POST /api/chat/personal/stream` | Verified |
| `orchestratedChatStream()` | `POST /chat/stream` | `POST /api/chat/stream` | Verified |
| `getGroupAnalytics()` | `GET /analytics/group/:id` | `GET /api/analytics/group/:id` | Verified |
| `analyzeEngagement()` | `POST /analytics/engagement` | `POST /api/analytics/engagement` | Verified |
| `exportProcessMiningData()` | `GET /analytics/export` | `GET /api/analytics/export` | Verified |

## Client App → Core API Proxy

| Laravel Controller | Core API Route | Method |
|---|---|---|
| AuthController | `/api/auth/*` | POST |
| DashboardController | `/api/dashboard/*` | GET |
| CourseController | `/api/courses/*` | GET/POST/PUT/DELETE |
| GroupController | `/api/groups/*` | GET/POST/PUT |
| GoalController | `/api/goals/*` | GET/POST/PUT |
| ReflectionController | `/api/reflections/*` | GET/POST |
| AiChatController | `/api/ai-chat/*` | GET/POST |
| AnalyticsController | `/api/analytics/*` | GET |
| UserManagementController | `/api/admin/users/*` | GET/POST/PUT/DELETE |
| MasterDataController | `/api/admin/master-data/*` | GET/POST/PUT/DELETE |
| AISettingsController | `/api/admin/ai-settings/*` | GET/POST/PUT |
| AuditLogController | `/api/admin/audit-log/*` | GET |

## Test Coverage Summary

| Project | Unit Tests | E2E Tests | Coverage | CI |
|---|---|---|---|---|
| AI Engine | 1719 | - | 98.15% | Green |
| Core API | 22 | - | - | Green |
| Client App | 8 PHPUnit | 51 Playwright | - | Green |

## Running All Services

```bash
docker-compose up -d
```

Or manually:
```bash
# Terminal 1: AI Engine
cd Kolabri-ai-engine && ./venv/bin/uvicorn main:app --port 8001

# Terminal 2: Core API
cd Kolabri-core-api && npm run dev

# Terminal 3: Client App
cd Kolabri-client-app && php artisan serve --port=8000
```

## Running Tests

```bash
# AI Engine
cd Kolabri-ai-engine && ./venv/bin/python -m pytest tests/test_unit/ --override-ini="addopts=" -q

# Core API
cd Kolabri-core-api && npm test -- --run

# Client App
cd Kolabri-client-app && php artisan test && ./node_modules/.bin/playwright test --list
```
