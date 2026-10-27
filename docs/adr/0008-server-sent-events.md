# ADR 0008: Server-Sent Events

**Status:** Accepted for Phase 1

## Decision
Use authenticated Server-Sent Events (SSE) for one-way live pipeline and deployment updates to the browser.

## Context
The primary live interaction is server-to-client status streaming. Bidirectional messaging is not required for Phase 1.

## Alternatives
Polling increases latency and load. WebSockets provide bidirectional transport but add connection and infrastructure complexity. Third-party realtime services add dependency and data exposure.

## Security implications
Authorize each stream and event by tenant, avoid tokens in URLs, validate origins, cap connections, send no secrets, support revocation and prevent event data from becoming script content.

## Operational implications
Proxies need streaming-safe timeouts and buffering settings. Implement heartbeats, reconnect semantics, event IDs and connection metrics.

## Consequences
Browsers receive efficient live updates over HTTP, but client-to-server actions continue over normal authenticated APIs.

## Future extension points
Add a broker-backed event fan-out and adopt WebSockets only if true bidirectional use cases emerge.
