# Design

## Sanitization Strategy

### Library Choice
- `dompurify` (with `jsdom`) for HTML sanitization
- OR `validator` for individual escapers + URL validation
- Recommended: `isomorphic-dompurify` for SSR/Node compatibility

### Pattern

```typescript
// src/utils/sanitize.ts (extend existing)
import DOMPurify from "isomorphic-dompurify";

export function sanitizeMessageContent(content: string): string {
    if (typeof content !== "string") return "";
    if (content.length > 10_000) {
        throw new Error("message_too_long");
    }
    return DOMPurify.sanitize(content, {
        ALLOWED_TAGS: ["b", "i", "em", "strong", "a", "p", "br", "code", "pre"],
        ALLOWED_ATTR: ["href"],
        ALLOWED_URI_REGEXP: /^https?:/,
    });
}

export function sanitizeAttachmentMeta(meta: { name: string; url: string }): { name: string; url: string } {
    return {
        name: meta.name.replace(/[<>"\\\\\\\\\/]/g, "_").slice(0, 200),
        url: validator.isURL(meta.url, { protocols: ["https", "http"] }) ? meta.url : "",
    };
}
```

### Application Points

```typescript
// src/socket/index.ts (send_message handler)
const safeContent = sanitizeMessageContent(payload.content);
if (!safeContent) return socket.emit("error", "invalid_content");

const message = await prisma.message.create({
    data: { content: safeContent, ... },
});
io.to(roomId).emit("new_message", message);
```

### Validation Schema

```typescript
// src/validators/socket.ts (NEW)
import { z } from "zod";

export const sendMessageSchema = z.object({
    roomId: z.string().min(1),
    content: z.string().min(1).max(10_000),
    attachments: z.array(z.object({
        name: z.string().max(200),
        url: z.string().url(),
        size: z.number().int().positive().max(50 * 1024 * 1024),
    })).max(10).optional(),
});

socket.on("send_message", async (raw) => {
    const result = sendMessageSchema.safeParse(raw);
    if (!result.success) return socket.emit("error", "invalid_payload");
    const payload = result.data;
    payload.content = sanitizeMessageContent(payload.content);
    // ... continue
});
```

## Defense in Depth

Even with sanitization, frontend should NEVER trust message content. Render via React text nodes (auto-escaped) or controlled markdown library. This change protects DB integrity, not frontend rendering.

## Test Strategy

- Test: `<script>alert(1)</script>` payload is stripped
- Test: `javascript:void(0)` URL is rejected
- Test: oversized content (>10k) rejected
- Test: malformed attachment URL rejected
- Test: legit markdown-style content preserved
