# Reports API

This backend now includes Supabase-backed CRUD endpoints for weekly reports while retaining legacy read-only demo endpoints.

Base path: /api

Read-only demo endpoints (in-memory):
- GET /api/reports
  - Returns all demo reports.
- GET /api/reports/mine
  - Filters by the x-user-id header.
  - Headers: x-user-id: <string>
- GET /api/teams/:id/reports
  - Filters by team id path param.

Supabase CRUD endpoints:
- POST /api/reports
  - Body: { userId: string, weekOf: "YYYY-MM-DD", content?: string, blockers?: string, plans?: string }
  - Returns 201 with created report.
- GET /api/reports/:id
  - Returns 200 with report.
- GET /api/reports?userId=<id>&page=1&pageSize=20
  - If userId provided, returns that user's paginated reports.
  - If not, returns recent reports (paginated).
  - Response: { items: Report[], page, pageSize, total? }
- PATCH /api/reports/:id
  - Body: { weekOf?: "YYYY-MM-DD", content?: string, blockers?: string, plans?: string }
  - Returns 200 with updated report.
- DELETE /api/reports/:id
  - Returns 204 on success.

Notes:
- Minimal validation: weekOf must be ISO date string "YYYY-MM-DD".
- Basic string sanitization (trim).
- Pagination limits pageSize to max 100.

Auth:
- TODO: Bind userId from Google auth (use req.user.id). For now, userId must be provided for POST and optional query for list.
- No changes to auth middleware were made.

Error handling:
- If Supabase is not configured, endpoints return 503 with a helpful message.
- If the Supabase table weekly_reports does not exist, endpoints return 503 with guidance to run migrations.
- Other database errors surface as 500 with message.

Environment:
- Copy .env.example to .env and fill:
  - SUPABASE_URL
  - SUPABASE_SERVICE_ROLE_KEY (Service Role key; do NOT use anon key)
- The server loads dotenv at boot (src/server.js), so variables in .env will be available at runtime.
- An alias SUPABASE_KEY is accepted for backward compatibility, but you should migrate to SUPABASE_SERVICE_ROLE_KEY.

Supabase Client:
- src/services/supabaseClient.js
  - getClient(), isConfigured(), healthCheck(), refreshLatestUserReports()
- src/repositories/reportsRepo.js
  - Implements CRUD using table `weekly_reports`.

Swagger docs:
- Visit /docs after starting the server to see routes.

Materialized View auto-refresh:
- After successful create, update, or delete operations on weekly_reports, the backend triggers a best-effort refresh of the materialized view public.latest_user_reports.
- It attempts a concurrent refresh first (requires a UNIQUE index on the MV). If the concurrent refresh fails due to index/constraint limitations, it falls back to a non-concurrent refresh.
- The refresh is executed in a fire-and-forget manner and does not affect the success of the primary mutation.

Manual refresh endpoint:
- GET /api/admin/maintenance/refresh-latest-reports?concurrent=true
  - Returns 200: { refreshed: true, concurrent: boolean } on success
  - Returns 503 if Supabase is not configured
  - Returns 500 on execution errors
- Requires the backend to be configured with the Supabase Service Role Key; ensure the service runs with SUPABASE_SERVICE_ROLE_KEY (do not use anon key).
- For concurrent refresh to work, ensure you have a unique index on the MV that covers all rows, e.g.:
  CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS latest_user_reports_unique_idx ON public.latest_user_reports (user_id);

Operational caveats:
- Non-concurrent refresh will lock the MV, which can temporarily block reads from it during refresh.
- The refresh is performed via Supabase SQL API and requires service role privileges.
- If the SQL API is disabled in your environment, you may need to create a secure RPC function that executes the REFRESH command and grant execute permission to the service role.

Examples (curl):
- Create:
  curl -X POST http://localhost:3000/api/reports \
    -H "Content-Type: application/json" \
    -d '{"userId":"user-123","weekOf":"2025-01-06","content":"Shipped feature A","blockers":"None","plans":"Start feature B"}'

- Get by id:
  curl http://localhost:3000/api/reports/<id>

- List recent:
  curl "http://localhost:3000/api/reports?page=1&pageSize=20"

- List by user:
  curl "http://localhost:3000/api/reports?userId=user-123&page=1&pageSize=10"

- Patch:
  curl -X PATCH http://localhost:3000/api/reports/<id> \
    -H "Content-Type: application/json" \
    -d '{"content":"Updated text"}'

- Delete:
  curl -X DELETE http://localhost:3000/api/reports/<id>
