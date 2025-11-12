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

Files:
- src/services/supabaseClient.js: central Supabase initialization and helpers
- src/repositories/reportsRepo.js: Supabase-backed CRUD for weekly_reports
- src/controllers/supabaseHealth.js: health probe
