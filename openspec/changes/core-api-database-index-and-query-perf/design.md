# Design

## Index Additions

```prisma
model LearningGoal {
  // existing fields...
  
  @@index([chatSpaceId])
  @@index([userId])
  @@index([chatSpaceId, deletedAt])  // active goals per chatSpace
}

model Reflection {
  // existing fields...
  
  @@index([chatSpaceId, userId])
  @@index([goalId])
  @@index([userId, createdAt])  // user history
}

model AiChatMessage {
  // existing fields...
  
  @@index([chatId, createdAt])  // pagination
}

model ChatSpace {
  // existing fields...
  
  @@index([groupId, deletedAt])  // active chatSpaces per group
}
```

## getUserChats N+1 Fix

```typescript
// src/services/aiChat.service.ts (BEFORE)
return prisma.aiChat.findMany({
    where: { userId },
    include: {
        messages: {
            take: 1,
            orderBy: { createdAt: "desc" },
        },
    },
});
```

This is OK pattern in Prisma — `take + orderBy` inside include is single SQL with LATERAL JOIN. Verify with query log:

```typescript
prisma.$on("query", (e) => console.log(e.query, e.params));
```

If actually N+1, refactor:

```typescript
// Two queries with manual zip
const chats = await prisma.aiChat.findMany({ where: { userId } });
const chatIds = chats.map(c => c.id);

const lastMessages = await prisma.aiChatMessage.findMany({
    where: { chatId: { in: chatIds } },
    orderBy: { createdAt: "desc" },
    distinct: ["chatId"],
});

return chats.map(c => ({ ...c, lastMessage: lastMessages.find(m => m.chatId === c.id) }));
```

## Pagination

```typescript
async getUserChats(userId: string, page = 1, pageSize = 20) {
    return prisma.aiChat.findMany({
        where: { userId, deletedAt: null },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { updatedAt: "desc" },
        include: {
            messages: { take: 1, orderBy: { createdAt: "desc" } },
        },
    });
}
```

## Migration Generation

```bash
npx prisma migrate dev --name add-perf-indexes
```

Migration file should contain `CREATE INDEX` statements; review before apply to production.
