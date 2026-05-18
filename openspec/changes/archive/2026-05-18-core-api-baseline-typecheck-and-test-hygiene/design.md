# Design

## Redis Import Fix

`ioredis` v5 is ESM-flavored CJS; TypeScript with `moduleResolution: NodeNext` sees it as a namespace, not a class. Switch to default import + namespace import for type:

```typescript
import RedisClient, { type Redis } from 'ioredis';

let _redis: Redis | null = null;

export function initRedis(url: string | undefined): Redis | null {
    // ...
    _redis = new RedisClient(url, { ... });
}
```

The `RedisClient` default export is the constructor; `Redis` is the instance type alias from the same module.

## Test Mock Constructor Typing

`socket.integration.test.ts` uses `function ChatLog(data: any) { ... }` with bare `this`. Under `noImplicitThis`, this fails. Convert to typed assignments via `Object.assign` and a typed receiver:

```typescript
function ChatLog(this: Record<string, unknown>, data: Record<string, unknown>) {
    Object.assign(this, data);
    this._id = { toString: () => 'mock-id' };
    this.createdAt = new Date('2026-06-01T00:00:00Z');
}
```

## Missing Import

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
```

## Mongo + AI Engine Mocks for chatSpace.service Tests

`closeSession` does:

```typescript
await prisma.chatSpace.update(...);             // mocked ✓
io.emit(...);                                    // mocked ✓
const recentMessages = await ChatLog.find(...)   // NOT mocked → hangs
    .sort(...).limit(...).lean();
const summaryResult = await aiEngineService     // NOT mocked → hangs
    .generateSummary(...);
```

Both `ChatLog.find` chain and `aiEngineService.generateSummary` need vi.mock entries. Pattern:

```typescript
vi.mock('../models/ChatLog.js', () => ({
    ChatLog: {
        find: vi.fn(() => ({
            sort: vi.fn(() => ({
                limit: vi.fn(() => ({
                    lean: vi.fn(() => Promise.resolve([])),
                })),
            })),
        })),
    },
}));

vi.mock('./aiEngine.service.js', () => ({
    aiEngineService: {
        generateSummary: vi.fn(() => Promise.resolve({ success: false, summary: null })),
    },
}));
```

Same shape for `goal.service.test.ts` (mock `aiEngineService.validateGoalContent`).

## OpenSpec Spec Header Fix

Replace existing `### Requirements` with `## ADDED Requirements` and ensure each `### REQ-*` block carries at least one `#### Scenario:`. Spec content stays the same; only structural markers added.
