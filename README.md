# weekly-insight-report-platform-22440-22609

## Backend (Express) Supabase setup

1) In weekly-insight-report-platform-22440-22609/backendexpress:
   - Copy .env.example to .env
   - Set:
     - SUPABASE_URL=https://your-project.supabase.co
     - SUPABASE_SERVICE_ROLE_KEY=your-service-role-key (Service Role, not anon)
   - Optional alias supported (for legacy configs): SUPABASE_KEY, but prefer SUPABASE_SERVICE_ROLE_KEY.

2) Start the server:
   - npm install
   - npm run dev

3) Verify configuration:
   - Visit /api/health/supabase
   - You should see configured=true and env flags with *_present true values (secrets are not printed).
   - Visit /api/reports/diagnostics to see the effective SUPABASE_URL host and the schema-qualified path used for auth.users checks.
   - From Swagger (/docs), run POST /api/reports/selftest with a valid auth.users UUID and expect 201. This confirms server-side inserts bypass RLS using the Service Role key.

RLS note:
- All backend inserts/updates/deletes for weekly_reports are performed with a server-side Supabase client initialized using SUPABASE_SERVICE_ROLE_KEY.
- Do not configure the backend with the anon key; doing so will trigger RLS violations on inserts.