# Design

## Current Send Flow (Vulnerable)

```typescript
socket.on('send_message', async (payload) => {
    const { roomId, courseId, groupId, content, ... } = payload;
    const chatSpace = await prisma.chatSpace.findFirst({ where: { id: roomId, deletedAt: null }});
    if (!chatSpace) return socket.emit('error', 'room_not_found');
    // ❌ NO check that user is in courseId/groupId
    // ❌ NO check that chatSpace belongs to courseId/groupId
    await prisma.message.create({ data: { chatSpaceId: roomId, courseId, groupId, ... }});
    io.to(roomId).emit('new_message', message);
});
```

## Target Send Flow

```typescript
socket.on('send_message', async (payload) => {
    const { roomId, content } = payload;

    // Resolve chatSpace WITH course + group
    const chatSpace = await prisma.chatSpace.findFirst({
        where: { id: roomId, deletedAt: null },
        select: { id: true, courseId: true, groupId: true },
    });
    if (!chatSpace) return socket.emit('error', 'room_not_found');

    // Verify membership (authoritative IDs from DB, not client)
    const isMember = await prisma.groupMember.findFirst({
        where: { groupId: chatSpace.groupId, userId: socket.data.userId, deletedAt: null },
        select: { id: true },
    });
    if (!isMember) return socket.emit('error', 'not_authorized_for_room');

    // Verify socket is actually joined to that room
    if (!socket.rooms.has(roomId)) {
        return socket.emit('error', 'must_join_room_first');
    }

    // Use chatSpace IDs, ignore client-supplied IDs entirely
    await prisma.message.create({
        data: {
            chatSpaceId: chatSpace.id,
            courseId: chatSpace.courseId,
            groupId: chatSpace.groupId,
            content,
            ...
        },
    });
});
```

## Target Delete Flow

```typescript
socket.on('delete_message', async (payload) => {
    const { messageId, roomId } = payload;

    // Verify socket joined the target room
    if (!socket.rooms.has(roomId)) {
        return socket.emit('error', 'not_in_room');
    }

    // Resolve message with its chatSpace
    const message = await prisma.message.findFirst({
        where: { id: messageId, deletedAt: null, userId: socket.data.userId },
        select: { id: true, chatSpaceId: true },
    });
    if (!message) return socket.emit('error', 'not_found_or_not_owner');

    // Verify roomId matches
    if (message.chatSpaceId !== roomId) {
        return socket.emit('error', 'room_mismatch');
    }

    await prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date() }});
    io.to(roomId).emit('message_deleted', { id: messageId });
});
```

## Helper Refactor

Extract `getAuthorizedChatSpace(socket, chatSpaceId)` returning `{ chatSpace, isAuthorized: boolean }` for reuse across handlers (`send_message`, `delete_message`, `typing`, etc.).

## Test Strategy

- Test: forged courseId is ignored, server uses chatSpace.courseId
- Test: non-member of group cannot send_message even after joining room
- Test: delete_message with mismatched roomId returns error
- Test: socket not in room cannot delete_message even if owns message
