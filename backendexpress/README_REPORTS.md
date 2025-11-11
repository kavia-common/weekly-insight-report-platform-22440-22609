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
  - SUPABASE_SERVICE_ROLE_KEY

Supabase Client:
- src/services/supabaseClient.js
  - getClient(), isConfigured(), healthCheck()
- src/repositories/reportsRepo.js
  - Implements CRUD using table `weekly_reports`.

Swagger docs:
- Visit /docs after starting the server to see routes.

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
