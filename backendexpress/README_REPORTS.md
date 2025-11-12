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
  - Validation: userId must be a valid UUID and exist in public.profiles (mirror of auth.users). If not found, returns 400 with diagnostics (DIAGNOSTICS=1).
  - Field mapping: the request field "content" is stored in the database column "progress".
  - Returns 201 with created report when valid.
- GET /api/reports/:id
  - Returns 200 with report.
- GET /api/reports?userId=<id>&page=1&pageSize=20
  - If userId provided, returns that user's paginated reports.
  - If not, returns recent reports (paginated).
  - Response: { items: Report[], page, pageSize, total? }
- PATCH /api/reports/:id
  - Body: { weekOf?: "YYYY-MM-DD", content?: string, blockers?: string, plans?: string }
  - Field mapping: "content" in the request updates the database "progress" column.
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

API to DB field mapping:
- Request body accepts "content" as the narrative of the weekly report. This value is stored in the table column "progress".
- Responses from the CRUD endpoints return raw database rows and therefore will include "progress" (and not "content").
- Other fields map directly: userId -> user_id, weekOf -> week_of, blockers -> blockers, plans -> plans.

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

Profiles mirror (public.profiles) - required setup:
- We mirror Supabase Auth users into a public schema table for safe lookups from the backend.
- Keep your weekly_reports.user_id foreign key referencing auth.users(id). The mirror is for validation/reads only.

SQL (run in Supabase SQL editor or migrations):

-- 1) Create public.profiles table (UUID PK referencing auth.users) and basic columns
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  raw_user_meta jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS and allow owner access (example policy; adjust as needed)
alter table public.profiles enable row level security;

-- Basic policy allowing individual owners to select/update their row (if you use JWT claims)
-- You may adjust or add admin/service role bypass as per your security model.
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='Allow individual read'
  ) then
    create policy "Allow individual read"
      on public.profiles for select
      using (auth.uid() = id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='Allow individual update'
  ) then
    create policy "Allow individual update"
      on public.profiles for update
      using (auth.uid() = id);
  end if;
end$$;

-- 2) Function to handle new auth.users inserts
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, email, raw_user_meta, created_at, updated_at)
  values (new.id, coalesce(new.email, null), to_jsonb(new), now(), now())
  on conflict (id) do update
    set email = excluded.email,
        raw_user_meta = excluded.raw_user_meta,
        updated_at = now();
  return new;
end;
$$;

-- 3) Trigger on auth.users after insert
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- 4) Optional: Upsert helper to backfill from existing auth.users rows (run once)
create or replace function public.backfill_profiles_from_auth()
returns void
language sql
security definer
as $$
  insert into public.profiles (id, email, raw_user_meta, created_at, updated_at)
  select u.id, u.email, to_jsonb(u), now(), now()
  from auth.users u
  on conflict (id) do update
    set email = excluded.email,
        raw_user_meta = excluded.raw_user_meta,
        updated_at = now();
$$;

-- Run backfill once:
-- select public.backfill_profiles_from_auth();

Acceptance:
- After running the SQL and executing: select public.backfill_profiles_from_auth();
- GET /api/reports/users/391eb516-4e8e-43e8-84a4-5e24a8a3d1d6/raw-check should query public.profiles and return count=1 and the row id.
- POST /api/reports with that userId returns 201.

Deprecation notes:
- Previous existence checks directly against auth.users are deprecated for create path.
- Raw auth.users diagnostics remain available in code comments and can be re-enabled if needed for deeper troubleshooting.

Examples (curl):
- Diagnostics:
  curl http://localhost:3000/api/reports/diagnostics
  # Expected: {"host":"<your-project.supabase.co>","schemaTargeting":true,"configured":true|false}

- Verify route precedence order (fixed paths before /:id):
  curl http://localhost:3000/api/reports/routes-check

- User existence check (public.profiles):
  curl http://localhost:3000/api/reports/users/391eb516-4e8e-43e8-84a4-5e24a8a3d1d6/check
- Raw diagnostic against public.profiles (returns rows/count/error for deeper investigation):
  curl http://localhost:3000/api/reports/users/391eb516-4e8e-43e8-84a4-5e24a8a3d1d6/raw-check

- Self-test (requires an existing user replicated into public.profiles via mirror):
  curl -X POST http://localhost:3000/api/reports/selftest \
    -H "Content-Type: application/json" \
    -d '{"userId":"391eb516-4e8e-43e8-84a4-5e24a8a3d1d6"}'

- Create:
  curl -X POST http://localhost:3000/api/reports \
    -H "Content-Type: application/json" \
    -d '{"userId":"391eb516-4e8e-43e8-84a4-5e24a8a3d1d6","weekOf":"2025-01-06","content":"Shipped feature A","blockers":"None","plans":"Start feature B"}'

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
