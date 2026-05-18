# socket-authz Specification

## Purpose
TBD - created by archiving change core-api-socket-message-authorization. Update Purpose after archive.
## Requirements
### Requirement: send_message MUST derive courseId/groupId from chatSpace

The `send_message` handler SHALL ignore client-supplied `courseId` and `groupId` and instead resolve them from the `chatSpace` record. Authoritative IDs MUST come from the database.

#### Scenario: Client sends forged courseId

- Given a user authorized for chatSpace A (course X, group Y)
- When the user emits `send_message` with `roomId=A, courseId=Z, groupId=W`
- Then the server MUST resolve `courseId` and `groupId` from chatSpace A
- And the message MUST be persisted with `courseId=X, groupId=Y` (not Z, W)

#### Scenario: Non-member cannot send to room

- Given a user authenticated but not a member of group Y
- When the user emits `send_message` for chatSpace A (group Y)
- Then the server MUST verify membership via `prisma.groupMember.findFirst`
- And MUST emit `error` event with reason `not_authorized_for_room`
- And MUST NOT persist the message

### Requirement: delete_message MUST verify room membership and message origin

The `delete_message` handler SHALL verify the socket is currently joined to `roomId` AND that the target message's chatSpace equals `roomId`.

#### Scenario: User in Room A tries to delete from Room B

- Given a user owns message M in chatSpace A
- When the user emits `delete_message` with `messageId=M, roomId=B`
- Then the server MUST detect chatSpace mismatch
- And MUST emit `error` event with reason `room_mismatch`
- And MUST NOT mark the message as deleted

#### Scenario: Socket not in target room

- Given a user owns message M in chatSpace A
- And the socket is NOT joined to room A
- When the user emits `delete_message` with `messageId=M, roomId=A`
- Then the server MUST reject with `not_in_room`

