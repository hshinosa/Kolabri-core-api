# Design

## Audit Approach

```bash
grep -rn "findUnique\|findFirst" src/services/ | grep -v "deletedAt"
```

For each result, classify:
- A) **Soft-deletable target** (User, Course, Group, ChatSpace, etc.) → MUST add `deletedAt: null`
- B) **Hard-delete target** (sessions, tokens, audit logs) → no change needed

## Pattern (Before)

```typescript
const chatSpace = await prisma.chatSpace.findUnique({ where: { id } });
if (!chatSpace) throw new NotFoundError();
```

## Pattern (After)

```typescript
const chatSpace = await prisma.chatSpace.findFirst({
    where: { id, deletedAt: null }
});
if (!chatSpace) throw new NotFoundError();
```

## Optional: Repository Helper

```typescript
// src/repositories/chatSpace.repo.ts
export async function findActiveChatSpace(id: string) {
    return prisma.chatSpace.findFirst({ where: { id, deletedAt: null } });
}
```

## Trade-off

`findUnique` is faster (uses primary key index directly) but `findFirst` with composite WHERE is still fast on indexed columns. Acceptable cost for correctness.
