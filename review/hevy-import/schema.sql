-- Review snapshot for the Hevy CSV import feature.
-- Reconstructed from supabase/schema.sql and supabase/migrations/20260420_hevy_import.sql.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'provider_type' and n.nspname = 'public'
  ) then
    create type public.provider_type as enum ('hevy');
  end if;
exception
  when duplicate_object then null;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  timezone text not null default 'Europe/Berlin',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.daily_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  entry_date date not null default current_date,
  body_weight numeric(5, 2),
  sleep_score integer check (sleep_score between 1 and 10),
  energy_score integer check (energy_score between 1 and 10),
  cravings_score integer check (cravings_score between 1 and 10),
  training_completed boolean not null default false,
  training_source text,
  calories integer check (calories >= 0),
  notes text,
  day_type text not null default 'training' check (day_type in ('training', 'rest')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint daily_entries_user_date_unique unique (user_id, entry_date)
);

create table if not exists public.data_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  provider public.provider_type not null default 'hevy',
  created_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.source_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  data_import_id uuid references public.data_imports (id) on delete set null,
  provider public.provider_type not null default 'hevy',
  provider_workout_id text,
  workout_date date not null,
  started_at timestamptz,
  duration_minutes integer check (duration_minutes is null or duration_minutes >= 0),
  title text,
  raw_payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists data_imports_user_provider_created_at_idx
  on public.data_imports (user_id, provider, created_at desc);

create index if not exists data_imports_user_provider_file_hash_idx
  on public.data_imports (user_id, provider, ((metadata ->> 'file_hash')));

create index if not exists source_workouts_user_provider_started_at_idx
  on public.source_workouts (user_id, provider, started_at);

create index if not exists source_workouts_user_workout_date_idx
  on public.source_workouts (user_id, workout_date desc);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'source_workouts_user_provider_title_started_duration_unique'
  ) then
    alter table public.source_workouts
      add constraint source_workouts_user_provider_title_started_duration_unique
      unique (user_id, provider, title, started_at, duration_minutes);
  end if;
end;
$$;

alter table public.profiles enable row level security;
alter table public.daily_entries enable row level security;
alter table public.data_imports enable row level security;
alter table public.source_workouts enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own"
on public.profiles
for delete
using (auth.uid() = id);

drop policy if exists "daily_entries_select_own" on public.daily_entries;
create policy "daily_entries_select_own"
on public.daily_entries
for select
using (auth.uid() = user_id);

drop policy if exists "daily_entries_insert_own" on public.daily_entries;
create policy "daily_entries_insert_own"
on public.daily_entries
for insert
with check (auth.uid() = user_id);

drop policy if exists "daily_entries_update_own" on public.daily_entries;
create policy "daily_entries_update_own"
on public.daily_entries
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "daily_entries_delete_own" on public.daily_entries;
create policy "daily_entries_delete_own"
on public.daily_entries
for delete
using (auth.uid() = user_id);

drop policy if exists "data_imports_select_own" on public.data_imports;
create policy "data_imports_select_own"
on public.data_imports
for select
using (auth.uid() = user_id);

drop policy if exists "data_imports_insert_own" on public.data_imports;
create policy "data_imports_insert_own"
on public.data_imports
for insert
with check (auth.uid() = user_id);

drop policy if exists "source_workouts_select_own" on public.source_workouts;
create policy "source_workouts_select_own"
on public.source_workouts
for select
using (auth.uid() = user_id);

drop policy if exists "source_workouts_insert_own" on public.source_workouts;
create policy "source_workouts_insert_own"
on public.source_workouts
for insert
with check (auth.uid() = user_id);

drop policy if exists "source_workouts_update_own" on public.source_workouts;
create policy "source_workouts_update_own"
on public.source_workouts
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "source_workouts_delete_own" on public.source_workouts;
create policy "source_workouts_delete_own"
on public.source_workouts
for delete
using (auth.uid() = user_id);
