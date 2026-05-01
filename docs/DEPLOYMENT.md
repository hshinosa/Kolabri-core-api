# Deployment Guide

## Prerequisites

- Docker & Docker Compose
- Or: Node.js 20+, Python 3.11+, PostgreSQL 16+, MongoDB 7+, Redis 7+

## Quick Start (Docker)

```bash
# From the Kolabri-core-api directory
docker-compose up -d
```

This starts all services:
- PostgreSQL (port 5432)
- MongoDB (port 27017)
- Redis (port 6379)
- AI Engine (port 8001)
- Core API (port 3000)
- Client App (port 8000)

Wait ~30 seconds for all health checks to pass, then open http://localhost:8000.

## Manual Setup (Development)

### 1. Infrastructure

Start PostgreSQL, MongoDB, and Redis locally. Or use Docker for just infrastructure:

```bash
docker-compose up -d postgres mongodb redis
```

### 2. AI Engine

```bash
cd Kolabri-ai-engine
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env: set GEMINI_API_KEY, MONGODB_URL, REDIS_URL, CORE_API_SECRET

uvicorn main:app --host 0.0.0.0 --port 8001
```

### 3. Core API

```bash
cd Kolabri-core-api
npm install
cp .env.example .env
# Edit .env: set DATABASE_URL, MONGODB_URL, JWT_SECRET, AI_ENGINE_URL

npx prisma db push
npx prisma generate
npm run dev
```

### 4. Client App

```bash
cd Kolabri-client-app
composer install
npm install
cp .env.example .env
# Edit .env: set API_BASE_URL=http://localhost:3000, DB_DATABASE

php artisan key:generate
php artisan serve --port=8000 &
npm run dev
```

## Environment Variables

### AI Engine (.env)
| Variable | Required | Default |
|----------|----------|---------|
| GEMINI_API_KEY | Yes | - |
| OPENAI_API_KEY | Yes | (same as GEMINI via OpenAI-compatible endpoint) |
| OPENAI_BASE_URL | Yes | https://generativelanguage.googleapis.com/v1beta/openai/ |
| MONGODB_URL | Yes | mongodb://localhost:27017 |
| REDIS_URL | No | redis://localhost:6379 |
| CORE_API_SECRET | Yes | shared-secret-key |

### Core API (.env)
| Variable | Required | Default |
|----------|----------|---------|
| PORT | No | 3000 |
| DATABASE_URL | Yes | postgresql://postgres:password@localhost:5432/kolabri-db |
| MONGODB_URL | Yes | mongodb://localhost:27017/kolabri |
| JWT_SECRET | Yes | - |
| AI_ENGINE_URL | Yes | http://localhost:8001 |
| CORE_API_SECRET | Yes | shared-secret-key |
| RATE_LIMIT_MAX_REQUESTS | No | 100 |

### Client App (.env)
| Variable | Required | Default |
|----------|----------|---------|
| APP_URL | Yes | http://localhost:8000 |
| API_BASE_URL | Yes | http://localhost:3000 |
| DB_CONNECTION | Yes | pgsql |
| DB_DATABASE | Yes | kolabri-db |
| SESSION_DRIVER | No | file |

## Database Setup

Core API manages the PostgreSQL schema via Prisma:

```bash
cd Kolabri-core-api
npx prisma db push        # Sync schema to DB
npx prisma generate       # Generate client
```

The `sessions` table for Laravel must be created separately:

```sql
CREATE TABLE sessions (
    id VARCHAR(255) PRIMARY KEY,
    user_id BIGINT NULL,
    ip_address VARCHAR(45) NULL,
    user_agent TEXT NULL,
    payload TEXT NOT NULL,
    last_activity INTEGER NOT NULL
);
```

## Health Checks

| Service | Endpoint | Expected |
|---------|----------|----------|
| Core API | GET http://localhost:3000/health | `{"status":"ok"}` |
| AI Engine | GET http://localhost:8001/api/health (with auth header) | `{"status":"healthy"}` |
| Client App | GET http://localhost:8000/login | HTTP 200 |

## Production Notes

- Set `SESSION_DRIVER=database` and create the sessions table
- Set strong `JWT_SECRET` and `CORE_API_SECRET`
- Configure CORS in Core API for your domain
- Use a reverse proxy (nginx) in front of all services
- Set `APP_DEBUG=false` in Client App
- Configure proper rate limits for production traffic
