# Distributed State

## ADDED Requirements

### Requirement: Rate limiting state MUST be shared across instances

HTTP and Socket.IO rate limiters SHALL use Redis as the backing store. In-process Maps or arrays MUST NOT be used for rate limit counters.

#### Scenario: Rate limit across instances

- Given two instances of the service running behind a load balancer
- When a client exceeds rate limit through any mix of instances
- Then the limit MUST be enforced consistently
- And requests routed to a different instance MUST still hit the limit

### Requirement: Token revocation MUST propagate across instances

The token blacklist SHALL be stored in Redis with TTL equal to remaining JWT expiry. In-memory Map MUST NOT be used.

#### Scenario: Logout on instance A

- Given a user logs out via instance A
- When the same JWT is presented to instance B before expiry
- Then instance B MUST detect revocation
- And MUST reject with 401

### Requirement: Socket.IO MUST use Redis adapter for multi-instance broadcast

The Socket.IO server SHALL use `@socket.io/redis-adapter` so that `io.to(room).emit(...)` reaches connections on other instances.

#### Scenario: Cross-instance broadcast

- Given a client connected to instance A is in room R
- And a webhook arrives at instance B that emits to room R
- Then the client on instance A MUST receive the event

### Requirement: Presence and silence timers MUST be Redis-backed

Online presence (`roomUsers`) and silence timers SHALL be stored in Redis. In-memory Maps MUST NOT be used.

#### Scenario: Disconnect cleanup

- Given a user disconnects from instance A
- When presence is cleaned up
- Then `presence:<roomId>` Redis SET MUST have the user removed
- And other instances querying presence MUST see the updated state
