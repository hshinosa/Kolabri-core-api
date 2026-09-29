# Design

## Schema Change

```prisma
model ChatSpace {
  id          String    @id @default(uuid())
  // ... existing fields
  closedAt    DateTime? @map("closed_at")
  closedBy    String?   @map("closed_by")
  summary     String?   @db.Text @map("summary")
  summaryGeneratedAt DateTime? @map("summary_generated_at")
  // ...
}
```

## Service Layer

```typescript
// closeSession — append summary persistence
async closeSession(chatSpaceId, userId, userRole) {
    // ... existing logic
    let summary: string | null = null;
    let summaryGeneratedAt: Date | null = null;
    try {
        const recentMessages = await ChatLog.find(...).sort(...).limit(30).lean();
        if (recentMessages.length > 0) {
            const summaryResult = await aiEngineService.generateSummary(...);
            if (summaryResult.success) {
                summary = summaryResult.summary;
                summaryGeneratedAt = new Date();
                await prisma.chatSpace.update({
                    where: { id: chatSpaceId },
                    data: { summary, summaryGeneratedAt },
                });
            }
        }
    } catch { logger.debug('summary_generation_failed'); }
    
    return { id, name, closedAt, closedBy, summary, summaryGeneratedAt };
}

// New: getSummary
async getSummary(chatSpaceId, userId, userRole) {
    const chatSpace = await prisma.chatSpace.findFirst({
        where: { id: chatSpaceId, deletedAt: null },
        select: {
            id: true, summary: true, summaryGeneratedAt: true,
            group: { select: { courseId: true, course: { select: { ownerId: true }}, members: { select: { userId: true }}}}
        }
    });
    if (!chatSpace) throw ApiError.notFound('Chat space not found');
    
    // Authorization
    if (userRole === 'student') {
        const isMember = chatSpace.group.members.some(m => m.userId === userId);
        if (!isMember) throw ApiError.forbidden('Not a member of this group');
    } else if (userRole === 'lecturer') {
        if (chatSpace.group.course.ownerId !== userId) throw ApiError.forbidden('Not the course owner');
    }
    // admin: allowed
    
    return { summary: chatSpace.summary, generatedAt: chatSpace.summaryGeneratedAt };
}
```

## Controller + Route

```typescript
// chatSpace.controller.ts
static getSummary = asyncHandler(async (req, res) => {
    const result = await ChatSpaceService.getSummary(
        req.params.id,
        req.user!.userId,
        req.user!.role,
    );
    res.json({ summary: result.summary, generatedAt: result.generatedAt });
});

// chatspace.routes.ts
router.get('/:id/summary', ChatSpaceController.getSummary);
```

## Migration

```sql
ALTER TABLE chat_spaces 
    ADD COLUMN summary TEXT,
    ADD COLUMN summary_generated_at TIMESTAMP;
```

## Client-App Update (Coordinated)

Client-app's Laravel proxy currently hits `/api/chatspaces/:id/summary` (typo, no hyphen). Update to `/api/chat-spaces/:id/summary` to match new endpoint.
