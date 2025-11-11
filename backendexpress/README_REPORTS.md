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

## Supabase integration (database client only)

We have added a Supabase client for future data access. Authentication and routes remain unchanged.

Files:
- src/services/supabaseClient.js
  - Provides getClient(), isConfigured(), and healthCheck() helpers.
  - Uses env vars: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
- src/repositories/reportsRepo.js
  - Placeholder repository demonstrating a simple select from table weekly_reports (limit 1).
  - Returns a typed error if Supabase is not configured.

Environment:
- Copy .env.example to .env and fill the following:
  - SUPABASE_URL
  - SUPABASE_SERVICE_ROLE_KEY

How to obtain values:
- In your Supabase project:
  - SUPABASE_URL: Settings -> API -> Project URL
  - SUPABASE_SERVICE_ROLE_KEY: Settings -> API -> service_role key (SERVER-SIDE ONLY, keep secret)

Health check:
- Call healthCheck() from src/services/supabaseClient.js to verify connectivity:
  - Returns { ok: boolean, configured: boolean, ... }

Important:
- No auth flow or route changes were made.
- Repositories should handle the not-configured case gracefully as shown.
