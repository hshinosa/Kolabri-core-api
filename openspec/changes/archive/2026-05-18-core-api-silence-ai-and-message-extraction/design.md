# Design

## AI Fallback Pattern (Section A)

Mirror the established pattern from `checkAndIntervenForQuality`:

```typescript
async function triggerIntervention(roomId, courseId, groupId, chatSpaceId): Promise<void> {
    try {
        const lockAcquired = await tryAcquireSilenceLock(roomId);
        if (!lockAcquired) {
            logger.debug(`Silence intervention skipped for ${roomId} (lock held by another instance)`);
            return;
        }

        const silenceEvent = new SilenceEvent({...});
        await silenceEvent.save();

        let message: string;
        try {
            const recentMessages = await ChatLog.find({
                chatSpaceId,
                isDeleted: { $ne: true },
                senderType: { $in: ['student', 'lecturer'] },
            }).sort({ createdAt: -1 }).limit(10).lean();

            const aiResult = await aiEngineService.analyzeIntervention({
                messages: recentMessages.reverse().map(m => ({
                    sender: m.senderName,
                    content: m.content,
                    timestamp: new Date(m.createdAt).toISOString(),
                    sender_id: m.senderId,
                })),
                topic: 'Diskusi sepi',
                chat_room_id: chatSpaceId,
                intervention_type: 'silence',
                force: true,
            });

            if (aiResult.success && aiResult.message) {
                message = aiResult.message;
            } else {
                const promptResult = await aiEngineService.generatePrompt(
                    'Diskusi sepi',
                    'Bantu mendorong diskusi yang sudah sepi tanpa terkesan menggurui',
                    'low',
                );
                message = promptResult.success && promptResult.prompt
                    ? promptResult.prompt
                    : pickRandom(INTERVENTION_MESSAGES);
            }
        } catch {
            message = pickRandom(INTERVENTION_MESSAGES);
        }

        const chatLog = new ChatLog({...content: message...});
        await chatLog.save();
        io.to(roomId).emit('receive_message', {...});
        silenceTimers.delete(roomId);
        logger.info(`Intervention sent to room ${roomId}`);
    } catch (error) {
        logger.error('Intervention error:', error);
    }
}
```

### Why `force: true`

`analyzeIntervention` has internal threshold logic that may decide a message is unnecessary. For silence-driven calls we already established the threshold (10-min silence + cooldown lock acquired), so we force generation. Same pattern as quality path.

### Why `recentMessages.length` not gated

Quality path skips when `< 5` recent messages. Silence path is different: silence by definition means fewer recent messages. We pass whatever exists (could be 0 if room is brand new). AI Engine handles empty context.

### Why HTTP timeout matters

`aiEngineService` already wraps every call in circuit breaker + retry. If AI is unavailable the breaker opens and the call returns fast with the legacy `responded with N` parser converting it to a network-level failure. Total worst-case latency before falling back to hardcoded: configured ANALYTICS_TIMEOUT (15s). Acceptable because silence intervention is itself a 10-minute timer event — 15s extra is invisible to users.

## Data Extraction (Section B)

### File layout after change

```
src/socket/
├── interventionMessages.ts       # exports `pickRandom`, re-exports data arrays
└── data/
    └── interventionMessages.data.ts  # contains INTERVENTION_MESSAGES, QUALITY_INTERVENTIONS
```

### interventionMessages.ts

```typescript
export {
    INTERVENTION_MESSAGES,
    QUALITY_INTERVENTIONS,
} from './data/interventionMessages.data.js';

export function pickRandom<T>(items: readonly T[]): T {
    return items[Math.floor(Math.random() * items.length)];
}
```

### data/interventionMessages.data.ts

```typescript
export const INTERVENTION_MESSAGES = [
    "Sepertinya diskusi sudah agak sepi...",
    // ...
];

export const QUALITY_INTERVENTIONS: Record<'low_hot' | 'low_cognitive' | 'low_lexical' | 'general', string[]> = {
    low_hot: [...],
    // ...
};
```

### Why re-export instead of caller migration

Every existing caller imports from `./interventionMessages.js`. Re-exporting preserves the import surface — no callers change, but anyone wanting to inspect or override the data has a single small file to find. Future `data/interventionMessages.en.ts` becomes additive.

### Why not full i18n yet

The proposal explicitly defers locale switching. Adding `i18next` or similar runtime resolution would be premature: there's no English UI today, no per-tenant config, no admin to set language. Pure data-extract gives us the foundation; the actual i18n decision happens when there's a real second locale to support.

## Test Strategy

### `triggerIntervention` AI-success path
Mock `aiEngineService.analyzeIntervention` to return `{ success: true, message: 'AI generated nudge' }`. Verify `ChatLog` is saved with that exact content and broadcast carries that content. Hardcoded array is never touched.

### `triggerIntervention` AI-fallback path
Mock `analyzeIntervention` to throw. Mock `generatePrompt` to throw. Verify `ChatLog.content` is one of the 5 hardcoded strings. Use `expect(INTERVENTION_MESSAGES).toContain(savedContent)`.

### Data file shape contract
Import `INTERVENTION_MESSAGES` and `QUALITY_INTERVENTIONS` from both `./interventionMessages.js` and `./data/interventionMessages.data.js`. Verify both export the same reference (no duplication).

### Determinism
Mock `Math.random` for tests so `pickRandom` is deterministic. Existing engagement tests already do this via vitest fake timers.
