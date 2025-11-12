-- Supabase public.profiles mirror of auth.users
-- Create table, enable RLS, create trigger function and trigger, and a backfill helper.

-- 1) Table
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  raw_user_meta jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2) RLS
alter table public.profiles enable row level security;

-- Policies (adjust to your auth model). Owner-only examples:
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

-- 3) Trigger function to sync from auth.users
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

-- 4) Trigger on auth.users AFTER INSERT
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- 5) Optional UPSERT helper to backfill existing users
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

-- To backfill now, run:
-- select public.backfill_profiles_from_auth();
