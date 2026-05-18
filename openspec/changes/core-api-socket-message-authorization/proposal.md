# Socket.IO Message Authorization

## Problem Statement

Socket.IO message handlers trust client-supplied IDs without verification:

1. **`send_message`** (`src/socket/index.ts:436-487`):
   - Verifies `roomId` (chatSpace) exists in DB
   - Trusts client-supplied `courseId` and `groupId` in payload
   - Never verifies user is member of that course/group, or chatSpace belongs to those IDs
   - Attack: User joins legitimate room, then emits messages with forged `courseId/groupId`, corrupting logs and AI analytics signals

2. **`delete_message`** (`src/socket/index.ts:560-579`):
   - Verifies user owns the message
   - Does NOT verify user is member of the room being broadcast to
   - Does NOT verify `roomId` matches the message's chatSpace
   - Attack: User in Room A deletes own message, broadcasts deletion to Room B. Users in Room B see fake delete event.

## Proposed Solution

1. **Server-side authorization for `send_message`**:
   - Resolve `chatSpace` from DB
   - Derive authoritative `courseId` and `groupId` from chatSpace, NOT from client
   - Verify user is member of resolved `courseId` and `groupId`
   - Reject with `unauthorized` event if any check fails

2. **Server-side authorization for `delete_message`**:
   - Verify socket is in the target room (via `socket.rooms.has(roomId)`)
   - Verify message belongs to that room (chatSpace match)
   - Reject if mismatch

## Scope

- `src/socket/index.ts:436-487` — refactor send_message authorization
- `src/socket/index.ts:560-579` — refactor delete_message authorization
- Add helper `getAuthorizedChatSpace(socket, chatSpaceId)` for reuse
- Tests for tampered payload + cross-room delete scenarios

## Out of Scope

- Rate limiting (already implemented)
- Message content validation (separate change: payload sanitization)
