# Reports API (Read-only, minimal)

This backend exposes minimal read-only endpoints to fetch reports with an in-memory repository fallback.

Base path: /api

Endpoints:
- GET /api/reports
  - Returns all reports.
- GET /api/reports/mine
  - Filters by the x-user-id header.
  - Headers: x-user-id: <string>
- GET /api/teams/:id/reports
  - Filters by team id path param.

Headers (mock auth for demo):
- x-user-id: string (required for /api/reports/mine)
- x-user-name: optional

Swagger docs:
- Visit /docs after starting the server.

Notes:
- The service uses an in-memory repository (seeded with sample data). It is structured to be replaced with MongoDB later without changing the public interface.
