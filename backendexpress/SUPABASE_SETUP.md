# Supabase setup (server)

Required environment variables (see .env.example):
- SUPABASE_URL=https://your-project.supabase.co
- SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
- (Optional legacy alias) SUPABASE_KEY=your-service-role-key

Notes:
- Never use the anon key on the backend; RLS will block inserts/updates/deletes.
- This service uses a single, reusable Supabase client from src/services/supabaseClient.js.
- Health probe: GET /api/health/supabase shows configured status and basic connectivity without leaking secrets.
