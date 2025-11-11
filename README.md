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