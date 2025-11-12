# Backend Express

This service powers the Weekly Insight Report Platform backend.

Quick start:
1) Copy .env.example to .env
2) Fill Supabase config:
   - SUPABASE_URL=https://your-project.supabase.co
   - SUPABASE_SERVICE_ROLE_KEY=your-service-role-key (Service Role, not anon)
   - Optional legacy alias: SUPABASE_KEY (prefer SUPABASE_SERVICE_ROLE_KEY)

Install and run:
- npm install
- npm run dev
- Visit /docs for Swagger UI
- Check Supabase health at /api/health/supabase

Behavior without Supabase:
- Service starts in "Supabase disabled" mode.
- Read-only demo endpoints work.
- Supabase-backed CRUD routes return 503 with guidance.
- /api/health/supabase shows configured=false and env presence flags.

Verify Supabase integration:
- With .env set, GET /api/health/supabase should show:
  - configured=true
  - env flags with *_present true (secrets are never echoed)
  - status/statusText from Supabase edge (200/404 indicates reachable)
  - keySource indicating which env var supplied the key
- Startup logs show:
  - [startup] Supabase env -> URL: true, SERVICE_ROLE_KEY: true, KEY(alias): (true/false)
  - [supabase] Configuration detected... (diagnostic only)

RLS and inserts to weekly_reports:
- The backend uses a server-side Supabase client initialized with SUPABASE_SERVICE_ROLE_KEY for all CRUD on weekly_reports. This bypasses Row Level Security (RLS) and is the recommended pattern.
- If you see "new row violates row-level security policy for table weekly_reports" via Swagger:
  1) Ensure SUPABASE_SERVICE_ROLE_KEY is set and is the Service Role key (not anon).
  2) Check /api/health/supabase for configured=true and keySource=SUPABASE_SERVICE_ROLE_KEY.
  3) Use the self-test below to confirm server-side inserts work.

Self-test endpoint (updated):
- POST /api/reports/selftest
  - Body: { "userId": "<existing-auth.users-uuid>" } (required)
  - The endpoint trims the UUID, validates it, and verifies it exists in auth.users (schema-targeted) before inserting.
  - Returns 201 when a report is inserted using the provided auth.users id.
  - Returns 400 with structured diagnostics if the user is missing in auth.users or the UUID is invalid.
  - This confirms server-side inserts (service role) and validates your weekly_reports.user_id FK to auth.users.

Auth schema targeting (auth.users):
- The backend queries Supabase Auth's "auth.users" using client.schema('auth').from('users') with head+count existence checks (no PII selection).
- Diagnostics include:
  - Supabase host (from SUPABASE_URL)
  - schema path: "auth.users"
  - Whether the existence check returned count=1
- Ensure your backend is configured with the Service Role key. If PostgREST restricts auth schema under anon, service role bypasses that.

FK and table expectations:
- weekly_reports.user_id must reference auth.users(id) (uuid).
- The backend does NOT upsert into public.users. Ensure your DB migration defines weekly_reports with FK to auth.users.
- Use service-role credentials (SUPABASE_SERVICE_ROLE_KEY) for all inserts/updates/deletes; anon key will hit RLS.

Troubleshooting 400 on POST /api/reports:
- The backend now:
  1) Trims and validates userId as a UUID.
  2) Uses the same service-role Supabase client instance for existence check and insert.
  3) Targets auth schema explicitly: schema('auth').from('users').
  4) Returns diagnostics on failure: { diag: { existenceSource: "auth.users", host, schema, path, count } } when DIAGNOSTICS=1.
- Verify the userId is exactly the auth.users.id UUID.
- Check /api/health/supabase for configured=true and a reachable host.
- Try the provided test UUID:
  391eb516-4e8e-43e8-84a4-5e24a8a3d1d6

Troubleshooting 500 on /api/reports/selftest:
- The self-test now requires a userId and will:
  - Return 400 if auth.users does not contain the id (no upsert into public.users).
  - Return 400 if UUID is invalid.
  - Return 503 if Supabase is not configured.
  - Return structured details on error, including the schema-qualified path and host.

Diagnostics toggle:
- Set DIAGNOSTICS=1 in the backend environment to include non-sensitive diagnostics in error responses for /api/reports and self-test.

Files:
- src/services/supabaseClient.js: central Supabase initialization and helpers (schema targeting, auth.users existence, UUID validation, diagnostics)
- src/repositories/reportsRepo.js: Supabase-backed CRUD for weekly_reports (uses the same service client, trims/validates UUIDs, enhanced error diagnostics)
- src/controllers/supabaseHealth.js: health probe
- src/controllers/reportsSelfTest.js: strict self-test insert controller (auth.users only)
