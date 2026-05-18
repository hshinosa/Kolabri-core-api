# lifecycle-resilience Specification

## Purpose
TBD - created by archiving change core-api-graceful-shutdown-and-mongo-resilience. Update Purpose after archive.
## Requirements
### Requirement: Service MUST shutdown gracefully on SIGTERM

On receiving SIGTERM or SIGINT, the service SHALL close resources in order: HTTP server → Socket.IO server → Prisma → MongoDB. Each step MUST log start and completion.

#### Scenario: SIGTERM during active connections

- Given the service is running with active HTTP and Socket.IO connections
- When the process receives SIGTERM
- Then the HTTP server MUST stop accepting new connections immediately
- And existing requests MUST be allowed to complete (within 30s timeout)
- And Socket.IO MUST disconnect all clients gracefully
- And Prisma `$disconnect()` MUST be called
- And Mongoose connection MUST be closed
- And the process MUST exit with code 0 within 30 seconds

#### Scenario: Shutdown timeout

- Given graceful shutdown takes longer than 30 seconds
- When the timeout fires
- Then the process MUST exit with code 1
- And a force-exit log MUST be emitted

### Requirement: MongoDB connection failure MUST fail boot

If MongoDB connection cannot be established at startup, the service SHALL exit with non-zero status before accepting traffic.

#### Scenario: MongoDB unavailable at boot

- Given `MONGO_URL` points to an unreachable MongoDB
- When `bootstrap()` runs
- Then `connectMongo()` MUST throw
- And the process MUST exit with code 1
- And `app.listen()` MUST NOT be called

