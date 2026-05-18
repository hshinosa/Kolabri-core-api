## webhook-ai-intervention

Endpoint yang menerima notifikasi intervensi dari AI Engine dan meneruskannya ke Socket.IO rooms yang tepat.

### Requirements

#### REQ-WAI-01: Endpoint POST /api/webhooks/ai-intervention

Endpoint menerima payload:
```json
{
  "groupId": "string",
  "message": "string",
  "type": "silence | participation_inequity | low_quality | teacher_alert",
  "metadata": {}
}
```

#### REQ-WAI-02: Autentikasi X-API-Key

Request harus menyertakan header `X-API-Key` yang nilainya sama dengan `process.env.CORE_API_SECRET`. Return 401 jika header tidak ada atau salah.

#### REQ-WAI-03: Resolusi Room via PostgreSQL

Query `prisma.group.findFirst({ where: { id: groupId }, include: { course: { select: { id: true } }, chatSpaces: { where: { closedAt: null }, select: { id: true } } } })`. Room ID format: `course_${courseId}_group_${groupId}_space_${chatSpaceId}`.

#### REQ-WAI-04: Broadcast ke Socket.IO

Untuk setiap active chat space, emit dua events ke room:
1. `receive_message` — dengan `senderType: 'ai'`, `isIntervention: true`, `interventionType: type`
2. `quality_intervention` — dengan `interventionType`, `timestamp`

#### REQ-WAI-05: Simpan ke MongoDB ChatLog

Buat `ChatLog` document dengan `senderType: 'ai'`, `senderName: 'AI Assistant'`, `isIntervention: true`, `content: message` untuk setiap active chat space.

#### REQ-WAI-06: Response

Return `{ success: true, delivered: N }` di mana N adalah jumlah rooms yang menerima broadcast. Return 200 meskipun N = 0 (group tidak punya active chat space).
