# Kolabri Database Architecture

## Overview

Kolabri menggunakan **Shared Database Architecture** dimana 2 aplikasi berbagi PostgreSQL database yang sama:

1. **Kolabri Core API** (Node.js + Prisma) - Backend utama
2. **Kolabri Client App** (Laravel + React) - Frontend dengan backend Laravel

## Database Configuration

| Project | Framework | ORM | Database |
|---------|-----------|-----|----------|
| core-api | Node.js/Express | Prisma | `kolabri-db` (PostgreSQL) |
| client-app | Laravel/PHP | Eloquent | `kolabri-db` (PostgreSQL) |

### Connection Details

**Core API (.env):**
```env
DATABASE_URL="postgresql://postgres:123hshi@localhost:5432/kolabri-db?schema=public"
```

**Client App (.env):**
```env
DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=kolabri-db
DB_SCHEMA=public
DB_USERNAME=postgres
DB_PASSWORD=123hshi
```

## Table Ownership

### Managed by Core API (Prisma)

| Table | Description | Laravel Access |
|-------|-------------|----------------|
| `users` | User accounts with roles (student, lecturer, admin) | Read-only via API |
| `courses` | Course management | Read-only via API |
| `course_students` | Student enrollments | Read-only via API |
| `groups` | Study groups | Read-only via API |
| `group_members` | Group memberships | Read-only via API |
| `chat_spaces` | Chat rooms within groups | Read-only via API |
| `chat_messages` | Messages in chat spaces | Read-only via API |
| `learning_goals` | Goals per chat space | Read-only via API |
| `reflections` | Student reflections | Read-only via API |
| `knowledge_bases` | Course materials | Read-only via API |
| `ai_chats` | Personal AI chat sessions | Read-only via API |
| `ai_chat_messages` | AI chat messages | Read-only via API |

**Laravel migrations for these tables are DISABLED** to avoid conflicts.

### Managed by Client App (Laravel)

| Table | Description |
|-------|-------------|
| `password_reset_tokens` | Laravel password reset functionality |
| `sessions` | Laravel session management |
| `cache` | Laravel caching |
| `cache_locks` | Laravel cache locking |
| `jobs` | Laravel queue jobs |
| `job_batches` | Laravel job batches |
| `failed_jobs` | Laravel failed jobs |

## Schema Differences

### Users Table

**Core API (Prisma) Schema:**
```prisma
model User {
  id            String   @id @default(uuid())     // UUID
  email         String   @unique
  password      String
  name          String
  role          UserRole @default(student)        // Enum: student, lecturer, admin
  googleId      String?  @unique
  avatarUrl     String?
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

**Laravel Default Schema (DISABLED):**
```php
// $table->id();                                // Big serial - NOT USED
// $table->string('name');
// $table->string('email')->unique();
// $table->timestamp('email_verified_at')->nullable();  // NOT IN CORE API
// $table->string('password');
// $table->rememberToken();                      // NOT IN CORE API
// $table->timestamps();
```

## Migration Workflow

### ⚠️ CRITICAL: Migration Order

**Step 1: Core-API migrations FIRST**
```bash
cd Kolabri-core-api
npx prisma migrate deploy
```

**Step 2: Laravel migrations SECOND**
```bash
cd Kolabri-client-app
php artisan migrate
```

**⚠️ DO NOT use `php artisan migrate:fresh`** - it drops ALL tables including Core-API tables!

## Important Notes

### Migration Conflicts

**Problem:** Laravel's default users migration tries to create `users` table that already exists from Core-API.

**Solution:** The migration file `database/migrations/0001_01_01_000000_create_users_table.php` has been modified to:
- Skip creating `users` table
- Add `if (!Schema::hasTable(...))` guards for other tables
- Never drop `users` table in `down()` method

### Laravel User Model

Laravel's default User model expects different fields. If you need to use Eloquent with the shared users table:

```php
// app/Models/User.php
class User extends Model
{
    protected $connection = 'pgsql';
    protected $table = 'users';
    
    // Disable auto-increment since Core API uses UUID
    public $incrementing = false;
    protected $keyType = 'string';
    
    // Map Core API fields to Laravel expectations
    protected $fillable = ['id', 'email', 'password', 'name', 'role', 'is_active'];
    
    // Disable Laravel's remember_token if not in schema
    protected $rememberTokenName = null;
}
```

### Authentication Flow

1. User registers/logs in via **Laravel routes**
2. Laravel calls **Core API** for authentication
3. Core API validates and returns JWT token
4. Laravel stores token in session/cookie
5. All data operations go through Core API

## Troubleshooting

### Error: "relation "users" already exists"

**Cause:** Laravel migration trying to create users table that Core-API already created.

**Fix:** 
- Check migration file is modified (see above)
- If migration already ran, reset it:
  ```bash
  php artisan migrate:rollback
  php artisan migrate
  ```

### Error: "column users.role does not exist"

**Cause:** Database was reset but `_prisma_migrations` table still shows migrations applied.

**Fix:**
1. Run the fix script:
   ```bash
   cd Kolabri-core-api
   npx prisma db execute --file prisma/fix_role_column.sql
   ```

2. Regenerate Prisma Client:
   ```bash
   npx prisma generate
   ```

### Error: "table public.users does not exist"

**Cause:** Laravel `migrate:fresh` deleted Core-API tables.

**Fix:**
```bash
cd Kolabri-core-api

# Apply migrations manually
npx prisma db execute --file prisma/apply_migration_1.sql
npx prisma db execute --file prisma/apply_migration_2.sql

# Regenerate client
npx prisma generate

# Re-run Laravel migrations
cd ../Kolabri-client-app
php artisan migrate
```

## Best Practices

1. **Never modify Core API tables from Laravel** - Use Core API endpoints
2. **Always backup before migrations** - Both projects share database
3. **Use API calls for user data** - Don't query users table directly from Laravel
4. **Test migrations in development** - Before running in production
5. **Document schema changes** - Update this file when modifying tables
