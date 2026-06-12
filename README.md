# Kolabri Core API

Express.js backend for Kolabri. Handles auth, data persistence, real-time chat, and proxies AI requests to the AI Engine.

## Architecture

```
Client App (Laravel) → Core API (Express) → AI Engine (FastAPI)
                                          → PostgreSQL (Prisma)
                                          → MongoDB (chat logs, activity)
```

Core API is the central coordination layer. It owns user sessions, course/group data, and real-time communication. AI-related requests are forwarded to the AI Engine service.

## Tech stack

- Node.js 20+, TypeScript
- Express.js 4.x
- Prisma ORM (PostgreSQL)
- Mongoose (MongoDB)
- Socket.IO (real-time chat)
- JWT authentication
- Zod validation
- express-rate-limit

## Setup

```bash
npm install
cp .env.example .env
```

Configure `.env`:
```
PORT=3000
DATABASE_URL=postgresql://postgres:password@localhost:5432/kolabri-db
MONGODB_URL=mongodb://localhost:27017/kolabri
JWT_SECRET=your-secret-key
AI_ENGINE_URL=http://localhost:8001
CORE_API_SECRET=shared-secret-key
```

Database setup:
```bash
npx prisma db push
npx prisma generate
```

## Demo dataset seeding

Use the demo dataset flow for TA demo data and lecturer dashboards. This is the canonical demo seed because it fills both PostgreSQL dashboard data and MongoDB `ChatLog` graph data.

```bash
npm run db:demo-data
npm run db:verify-demo-data
```

What it populates:
- PostgreSQL: users, lecturers, students, courses, groups, group members, chat spaces, chat messages, learning goals, reflections, AI usage, notifications.
- MongoDB: `chatlogs` used by analytics line graphs (`lexicalVariety`, HOT percentage, engagement trend data).

Demo credentials:
```txt
budi.santoso@univ.ac.id / password123
siti.rahayu@univ.ac.id / password123
andi.pratama@student.ac.id / password123
```

For a destructive reset + seed + verify:
```bash
npm run db:reset:demo-data
```

`npm run db:seed` now uses the full demo dataset by default.

If you still need the older blueprint dataset, use:
```bash
npm run db:seed:legacy
```

Run:
```bash
npm run dev
```

## API routes

| Prefix | Description |
|--------|-------------|
| `/api/auth` | Register, login, logout, token refresh |
| `/api/courses` | Course CRUD (student-facing) |
| `/api/groups` | Group membership, chat spaces |
| `/api/ai-chats` | Personal AI chat sessions |
| `/api/admin/dashboard` | Admin stats, activity feed |
| `/api/admin/users` | User management (admin) |
| `/api/admin/courses` | Course admin (clone, archive, bulk) |
| `/api/admin/ai-providers` | AI provider configuration |
| `/api/admin/usage-stats` | AI usage tracking |
| `/api/admin/audit-logs` | Audit trail |
| `/health` | Health check |

All admin routes require JWT + admin role. Rate limiting is applied globally (configurable via `RATE_LIMIT_MAX_REQUESTS`).

## AI Engine integration

The `AIEngineService` (`src/services/aiEngine.service.ts`) proxies requests to the AI Engine:

- `POST /api/chat` — orchestrated group chat with intervention
- `POST /api/ask` — RAG query against course materials
- `POST /api/intervention/*` — analyze, summarize, generate prompts
- `POST /api/ingest` — document ingestion
- `GET /api/analytics/*` — engagement and group analytics

## Real-time

Socket.IO handles group chat. Events:
- `join_room` / `leave_room`
- `send_message` / `new_message`
- `typing` / `stop_typing`

WebSocket server at `/ws` pushes admin notifications.

## Error handling

All API endpoints return consistent error responses. See [API Error Response Format](./docs/API_ERROR_RESPONSES.md) for details.

## Testing

```bash
npm run build    # TypeScript compilation check
npm run lint     # ESLint
```

## Docker

```bash
docker-compose up
```

The `docker-compose.yml` starts PostgreSQL, MongoDB, Redis, AI Engine, Core API, and Client App together.

## Project structure

```
src/
  controllers/    Route handlers
  services/       Business logic
  routes/         Express route definitions
  middleware/     Auth, rate limiting, audit log
  validators/     Zod schemas
  websocket/      WebSocket server
prisma/
  schema.prisma   Database schema
```

## Related services

- [Kolabri Client App](../Kolabri-client-app) — Laravel + React frontend
- [Kolabri AI Engine](../Kolabri-ai-engine) — FastAPI, RAG, NLP
