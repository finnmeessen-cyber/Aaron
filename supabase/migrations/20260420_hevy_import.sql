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

alter table public.daily_entries
  add column if not exists training_source text;

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

update public.source_workouts
set provider_workout_id = encode(
  digest(
    lower(trim(coalesce(title, ''))) || '::' ||
    coalesce(raw_payload ->> 'start_time', '') || '::' ||
    coalesce(raw_payload ->> 'end_time', ''),
    'sha256'
  ),
  'hex'
)
where provider_workout_id is null;

alter table public.source_workouts
  alter column provider_workout_id set not null;

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
    where conname = 'source_workouts_user_provider_workout_id_unique'
  ) then
    alter table public.source_workouts
      drop constraint if exists source_workouts_user_provider_title_started_duration_unique;

    alter table public.source_workouts
      add constraint source_workouts_user_provider_workout_id_unique
      unique (user_id, provider, provider_workout_id);
  end if;
end;
$$;

alter table public.data_imports enable row level security;
alter table public.source_workouts enable row level security;

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
