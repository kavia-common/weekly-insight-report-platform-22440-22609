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

Self-test endpoint:
- POST /api/reports/selftest
  - Optional body: { "userId": "<existing-auth-users-uuid>" }
  - If userId is provided, the self-test verifies it exists in auth.users; proceeds only if found.
  - If not provided, the endpoint returns 400 with guidance to pass a valid user id from auth.users.
  - Returns 201 when a report is inserted using the provided auth.users id.
  - Use this to verify server-side inserts (service role) and that your weekly_reports.user_id FK to auth.users works.

Optional policy approach (not required when using Service Role):
- If you want to allow anon inserts instead (not recommended), create a permissive RLS policy on public.weekly_reports:
  Example policy (allow when header x-user-id equals body.user_id):
  1) Ensure your Supabase project is configured to forward request headers to PostgREST. Then run:
     -- Enable RLS
     ALTER TABLE public.weekly_reports ENABLE ROW LEVEL SECURITY;
     -- Create policy allowing insert when provided header matches inserted user_id
     CREATE POLICY allow_insert_when_header_matches_user
       ON public.weekly_reports
       FOR INSERT
       TO anon
       WITH CHECK (
         current_setting('request.headers', true)::jsonb ->> 'x-user-id' = user_id
       );
  2) Update your reverse proxy to ensure the x-user-id header is forwarded.
  Note: This approach should only be used if you cannot use the Service Role key. Prefer server-side service role.

Files:
- src/services/supabaseClient.js: central Supabase initialization and helpers
- src/repositories/reportsRepo.js: Supabase-backed CRUD for weekly_reports
- src/controllers/supabaseHealth.js: health probe
- src/controllers/reportsSelfTest.js: self-test insert controller
