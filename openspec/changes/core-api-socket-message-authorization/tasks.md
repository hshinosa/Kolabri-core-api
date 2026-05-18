## 1. Pre-flight

- [ ] 1.1 Run baseline: `npm test`
- [ ] 1.2 Read `src/socket/index.ts:436-487` (send_message), `:560-579` (delete_message)
- [ ] 1.3 Identify all client-supplied IDs being trusted

## 2. Refactor send_message handler

- [ ] 2.1 Resolve `chatSpace` with `courseId, groupId` selected from DB
- [ ] 2.2 Verify `groupMember` exists for `(groupId, userId)`
- [ ] 2.3 Verify socket is joined to `roomId` via `socket.rooms.has(roomId)`
- [ ] 2.4 Use chatSpace.courseId/groupId for message creation, ignore client IDs

## 3. Refactor delete_message handler

- [ ] 3.1 Verify `socket.rooms.has(roomId)`
- [ ] 3.2 Resolve message with `chatSpaceId` selected
- [ ] 3.3 Verify `message.chatSpaceId === roomId` (room mismatch check)

## 4. Extract reusable helper (optional)

- [ ] 4.1 Add `getAuthorizedChatSpace(socket, chatSpaceId)` returning `{ chatSpace, isMember }`
- [ ] 4.2 Apply to all socket events that take `chatSpaceId/roomId` parameter

## 5. Tests

- [ ] 5.1 Test: forged courseId is overridden by DB chatSpace.courseId
- [ ] 5.2 Test: non-member rejection
- [ ] 5.3 Test: cross-room delete rejection
- [ ] 5.4 Test: socket-not-in-room delete rejection

## 6. Verify

- [ ] 6.1 `npm test` passing
- [ ] 6.2 `openspec validate core-api-socket-message-authorization --strict`
- [ ] 6.3 Manual: emit forged payload, verify server uses authoritative IDs
