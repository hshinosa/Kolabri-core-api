# Chat Space Summary Persistence

## ADDED Requirements

### Requirement: Chat space summary MUST be persisted on close

When `closeSession()` successfully generates a summary via AI Engine, the summary text and generation timestamp SHALL be persisted to the `ChatSpace` table.

#### Scenario: Successful summary generation

- Given a chat space with 30 recent messages is being closed
- When AI Engine returns `{ success: true, summary: "..." }`
- Then `prisma.chatSpace.update` MUST set `summary` and `summaryGeneratedAt`
- And subsequent calls to `getSummary` MUST return the same value
- And the close response MUST also include the summary inline (backward compat)

#### Scenario: AI Engine summary generation fails

- Given AI Engine returns `{ success: false }` or throws
- When `closeSession` handles the error
- Then `summary` MUST remain null (not persisted)
- And the close request MUST still succeed (graceful degradation)
- And `getSummary` MUST return null for this chat space

### Requirement: GET /api/chat-spaces/:id/summary endpoint

The Core API SHALL expose `GET /api/chat-spaces/:id/summary` returning `{ summary, generatedAt }`. Authorization mirrors `getStatus`: student must be a member of the group, lecturer must own the course, admin always allowed.

#### Scenario: Student member fetches summary

- Given a closed chat space with persisted summary
- And the requesting user is a member of the parent group
- When the user GETs `/api/chat-spaces/:id/summary`
- Then the response MUST be 200 with `{ summary, generatedAt }`

#### Scenario: Non-member student attempts fetch

- Given a chat space the requesting student is NOT a member of
- When the user GETs the summary endpoint
- Then the response MUST be 403 Forbidden

#### Scenario: Summary not yet generated

- Given a chat space that has been closed but AI generation failed (or no messages)
- When user fetches summary
- Then the response MUST be 200 with `{ summary: null, generatedAt: null }`

#### Scenario: Deleted chat space

- Given a chat space with `deletedAt` set
- When user fetches summary
- Then the response MUST be 404 Not Found
