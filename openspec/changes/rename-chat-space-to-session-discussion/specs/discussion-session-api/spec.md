## MODIFIED Requirements

### Requirement: Consistent session_discussion naming across all services

All internal identifiers — DB tables, columns, API paths, request/response fields, TypeScript types, Python schemas, variable names — use `session_discussion` / `SessionDiscussion` / `sessionDiscussionId` consistently. No `chatSpace` / `ChatSpace` / `chat_space` identifiers remain in any source file.

#### Scenario: Core-api Prisma model
- **WHEN** the Prisma schema is read
- **THEN** the model is named `SessionDiscussion`
- **AND** the table mapping is `@@map("session_discussions")`
- **AND** no `ChatSpace` model exists

#### Scenario: Core-api API endpoints
- **WHEN** a client calls the discussion session API
- **THEN** the path is `/api/session-discussions/:id/close` (not `/api/chat-spaces/:id/close`)
- **AND** the path is `/api/groups/:id/session-discussions` (not `/api/chat-spaces`)

#### Scenario: Client-app routes
- **WHEN** a student navigates to a pre-read page
- **THEN** the URL is `/courses/{course}/session-discussions/{sessionDiscussion}/pre-read`
- **AND** the route name is `session-discussions.pre-read.show`

#### Scenario: Client-app TypeScript types
- **WHEN** the frontend references a discussion session
- **THEN** the interface is `SessionDiscussion` (not `ChatSpace`)
- **AND** the ID field is `sessionDiscussionId` (not `chatSpaceId`)

#### Scenario: AI-engine schemas
- **WHEN** the ai-engine receives a goal validation request
- **THEN** the Pydantic field is `session_discussion_id` (not `chat_space_id`)
- **AND** the export endpoint is `/export/activity/session-discussion/{session_discussion_id}`

#### Scenario: MongoDB fields
- **WHEN** a ChatLog document is read from MongoDB
- **THEN** the field is `sessionDiscussionId` (not `chatSpaceId`)
- **AND** all documents are recreated from seed scripts (clean break, beta testing)

#### Scenario: PostgreSQL columns
- **WHEN** the `learning_goals` table is queried
- **THEN** the FK column is `session_discussion_id` (not `chat_space_id`)
- **AND** all data is recreated from seed scripts (clean break, beta testing)
