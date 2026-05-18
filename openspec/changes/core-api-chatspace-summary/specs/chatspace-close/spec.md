## chatspace-close (Summary Generation)

### Requirements

#### REQ-CS-01: Ambil Pesan Terakhir

Setelah `prisma.chatSpace.update()` berhasil, query MongoDB ChatLog:
```typescript
const recentMessages = await ChatLog.find({
    chatSpaceId,
    isDeleted: { $ne: true },
    senderType: { $in: ['student', 'lecturer'] },
}).sort({ createdAt: -1 }).limit(30).lean();
```

#### REQ-CS-02: Generate Summary via AI Engine

Jika `recentMessages.length > 0`, panggil:
```typescript
const summaryResult = await aiEngineService.generateSummary(
    recentMessages.reverse().map(m => ({
        sender: m.senderName,
        content: m.content,
        timestamp: m.createdAt?.toISOString(),
    })),
    chatSpaceId
);
```

#### REQ-CS-03: Graceful Degradation

Jika `recentMessages.length === 0` atau `generateSummary()` gagal/throw → `summary = null`. Close operation tidak boleh gagal karena summary generation gagal.

#### REQ-CS-04: Return Type

`closeSession()` return object diperluas:
```typescript
{
    id, name, closedAt, closedBy,
    summary?: string | null,
}
```
`summary` berisi teks ringkasan dari AI Engine, atau `null` jika tidak tersedia.
