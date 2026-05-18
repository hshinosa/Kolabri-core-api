# auth-checks Specification

## Purpose
TBD - created by archiving change core-api-auth-isactive-and-cache-policy. Update Purpose after archive.
## Requirements
### Requirement: HTTP auth middleware MUST verify isActive

The JWT auth middleware SHALL include `isActive: true` in the user lookup query, in addition to `deletedAt: null`. Deactivated users MUST be rejected with HTTP 401.

#### Scenario: Deactivated user attempts request

- Given a user with `isActive=false` in the database
- When the user makes an HTTP request with a valid JWT
- Then auth middleware MUST query with `where: { id, deletedAt: null, isActive: true }`
- And MUST reject the request with HTTP 401
- And the cache MUST NOT mark the user as allowed

### Requirement: Socket.IO auth MUST verify isActive

Socket.IO connection auth SHALL include `isActive: true` in the user lookup query.

#### Scenario: Deactivated user attempts socket connection

- Given a user with `isActive=false`
- When the user attempts Socket.IO handshake with valid JWT
- Then connection MUST be rejected
- And no socket events MUST be emitted to the client

### Requirement: User state cache MUST support invalidation

The `userActiveCache` SHALL expose an `invalidate(userId)` function that admin/user services MUST call when user state changes.

#### Scenario: Admin deactivates user

- Given a logged-in user with active session
- When admin calls deactivate endpoint
- Then the user service MUST call `userActiveCache.invalidate(userId)`
- And the next request from that user MUST be rejected (cache miss → DB lookup → isActive=false → 401)

### Requirement: Cache TTL MUST be short for security

The `userActiveCache` TTL SHALL NOT exceed 60 seconds. The default TTL MUST be 30 seconds.

#### Scenario: Cache expires within 30s

- Given a user is cached as allowed at time T
- When current time > T + 30 seconds
- Then the cache MUST be considered stale
- And the next auth check MUST re-query the database

