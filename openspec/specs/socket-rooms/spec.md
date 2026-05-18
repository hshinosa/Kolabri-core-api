# socket-rooms Specification

## Purpose
TBD - created by archiving change core-api-webhook-room-id-alignment. Update Purpose after archive.
## Requirements
### Requirement: Room names MUST be consistent across emit and join sites

All Socket.IO room names SHALL be derived from a single source-of-truth helper. Webhook emits and socket joins for the same chatSpace MUST resolve to the identical room string.

#### Scenario: Webhook emits to chatSpace

- Given a webhook handler receiving an intervention for `chatSpaceId="abc"`
- When the handler emits to the chatSpace room
- Then `io.to(roomName)` MUST use the same `roomName` that sockets used in `socket.join(roomName)` for that chatSpace
- And the connected client MUST receive the intervention event

#### Scenario: Helper enforces single name

- Given the codebase declares `roomNames.chatSpace(id)` helper
- When any new emit or join site is added
- Then it MUST use `roomNames.chatSpace(id)` instead of inline string interpolation
- And static analysis (grep) MUST find zero direct `\`course_\`` or `\`space_\`` template literals

