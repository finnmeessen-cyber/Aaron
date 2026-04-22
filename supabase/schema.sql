create extension if not exists pgcrypto;
create extension if not exists supabase_vault with schema vault;

create schema if not exists private;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.sync_phase_started_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.phase_started_at = coalesce(new.phase_started_at, timezone('utc', now()));
    return new;
  end if;

  if new.current_phase_slug is distinct from old.current_phase_slug then
    new.phase_started_at = timezone('utc', now());
  elsif new.phase_started_at is null then
    new.phase_started_at = old.phase_started_at;
  end if;

  return new;
end;
$$;

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

create table if not exists public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  current_phase_slug text not null default 'stabilisierung',
  phase_started_at timestamptz not null default timezone('utc', now()),
  dark_mode_preference text not null default 'dark' check (dark_mode_preference in ('system', 'light', 'dark')),
  macro_training_calories integer not null default 3150 check (macro_training_calories > 0),
  macro_training_protein integer not null default 170 check (macro_training_protein > 0),
  macro_training_carbs integer not null default 420 check (macro_training_carbs >= 0),
  macro_training_fat integer not null default 50 check (macro_training_fat >= 0),
  macro_rest_calories integer not null default 2750 check (macro_rest_calories > 0),
  macro_rest_protein integer not null default 170 check (macro_rest_protein > 0),
  macro_rest_carbs integer not null default 320 check (macro_rest_carbs >= 0),
  macro_rest_fat integer not null default 55 check (macro_rest_fat >= 0),
  training_days integer[] not null default array[1, 3, 5],
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists private.hevy_api_connections (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  vault_secret_id uuid not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists private.hevy_sync_leases (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  lease_token uuid not null,
  expires_at timestamptz not null,
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

create table if not exists public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  section text not null check (section in ('morning', 'meals', 'training', 'evening', 'sleep')),
  is_supplement boolean not null default false,
  supplement_slugs text[] not null default array[]::text[],
  title text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.daily_checklists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  entry_date date not null default current_date,
  template_key text not null references public.checklist_templates (template_key) on update cascade on delete cascade,
  completed boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint daily_checklists_user_date_template_unique unique (user_id, entry_date, template_key)
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
  provider_workout_id text not null,
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

create index if not exists private_hevy_sync_leases_expires_at_idx
  on private.hevy_sync_leases (expires_at);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'source_workouts_user_provider_workout_id_unique'
  ) then
    alter table public.source_workouts
      add constraint source_workouts_user_provider_workout_id_unique
      unique (user_id, provider, provider_workout_id);
  end if;
end;
$$;

create table if not exists public.supplement_catalog (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  dosage text,
  timing text,
  category text not null check (category in ('Fokus', 'Performance', 'Schlaf', 'Gesundheit', 'Entzug')),
  guidance text,
  is_default_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_supplements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  supplement_id uuid not null references public.supplement_catalog (id) on delete cascade,
  active boolean not null default true,
  custom_dosage text,
  custom_timing text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_supplements_user_supplement_unique unique (user_id, supplement_id)
);

create table if not exists public.supplement_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  supplement_id uuid not null references public.supplement_catalog (id) on delete cascade,
  log_date date not null default current_date,
  completed boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint supplement_logs_user_supplement_date_unique unique (user_id, supplement_id, log_date)
);

create table if not exists public.meal_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,
  template_key text not null,
  meal_slot text not null,
  name text not null,
  description text,
  protein_g integer check (protein_g >= 0),
  carbs_g integer check (carbs_g >= 0),
  fat_g integer check (fat_g >= 0),
  calories integer check (calories >= 0),
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint meal_templates_user_template_unique unique (user_id, template_key)
);

create unique index if not exists meal_templates_system_template_unique
  on public.meal_templates (template_key)
  where user_id is null;

create table if not exists public.phases (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  summary text not null,
  objective text not null,
  guidance text,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.phase_supplements (
  id uuid primary key default gen_random_uuid(),
  phase_id uuid not null references public.phases (id) on delete cascade,
  supplement_id uuid not null references public.supplement_catalog (id) on delete cascade,
  dosage text,
  timing text,
  notes text,
  sort_order integer not null default 0,
  constraint phase_supplements_phase_supplement_unique unique (phase_id, supplement_id)
);

create table if not exists public.day_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  day_type text not null check (day_type in ('training', 'rest')),
  calories integer check (calories >= 0),
  notes text,
  meal_template_keys text[],
  default_checklist_keys text[],
  created_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists user_settings_set_updated_at on public.user_settings;
create trigger user_settings_set_updated_at
before update on public.user_settings
for each row
execute function public.set_updated_at();

drop trigger if exists private_hevy_api_connections_set_updated_at on private.hevy_api_connections;
create trigger private_hevy_api_connections_set_updated_at
before update on private.hevy_api_connections
for each row
execute function public.set_updated_at();

drop trigger if exists private_hevy_sync_leases_set_updated_at on private.hevy_sync_leases;
create trigger private_hevy_sync_leases_set_updated_at
before update on private.hevy_sync_leases
for each row
execute function public.set_updated_at();

create or replace function public.hevy_has_api_key(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
begin
  return exists (
    select 1
    from private.hevy_api_connections
    where user_id = target_user_id
  );
end;
$$;

create or replace function public.hevy_load_api_key(target_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public, private, vault
as $$
declare
  stored_secret text;
begin
  select decrypted_secret
  into stored_secret
  from private.hevy_api_connections connection
  join vault.decrypted_secrets secret
    on secret.id = connection.vault_secret_id
  where connection.user_id = target_user_id;

  return stored_secret;
end;
$$;

create or replace function public.hevy_store_api_key(target_user_id uuid, new_api_key text)
returns void
language plpgsql
security definer
set search_path = public, private, vault
as $$
declare
  existing_secret_id uuid;
begin
  if new_api_key is null or btrim(new_api_key) = '' then
    raise exception 'hevy_api_key_required';
  end if;

  select vault_secret_id
  into existing_secret_id
  from private.hevy_api_connections
  where user_id = target_user_id;

  if existing_secret_id is null then
    insert into private.hevy_api_connections (user_id, vault_secret_id)
    values (
      target_user_id,
      vault.create_secret(btrim(new_api_key))
    )
    on conflict (user_id) do update
      set vault_secret_id = excluded.vault_secret_id;

    return;
  end if;

  perform vault.update_secret(
    existing_secret_id,
    btrim(new_api_key)
  );

  update private.hevy_api_connections
  set updated_at = timezone('utc', now())
  where user_id = target_user_id;
end;
$$;

create or replace function public.hevy_delete_api_key(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, vault
as $$
declare
  existing_secret_id uuid;
begin
  select vault_secret_id
  into existing_secret_id
  from private.hevy_api_connections
  where user_id = target_user_id;

  if existing_secret_id is null then
    return;
  end if;

  delete from private.hevy_api_connections
  where user_id = target_user_id;

  delete from vault.secrets
  where id = existing_secret_id;
end;
$$;

create or replace function public.hevy_list_connected_users()
returns table(user_id uuid)
language sql
security definer
set search_path = public, private
as $$
  select connection.user_id
  from private.hevy_api_connections connection
  order by connection.user_id;
$$;

create or replace function public.hevy_acquire_sync_lease(
  target_user_id uuid,
  requested_lease_token uuid,
  lease_seconds integer default 1800
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  current_time timestamptz := timezone('utc', now());
  effective_lease_seconds integer := greatest(coalesce(lease_seconds, 1800), 60);
  affected_rows integer := 0;
begin
  delete from private.hevy_sync_leases
  where expires_at <= current_time;

  insert into private.hevy_sync_leases (
    user_id,
    lease_token,
    expires_at
  )
  values (
    target_user_id,
    requested_lease_token,
    current_time + make_interval(secs => effective_lease_seconds)
  )
  on conflict (user_id) do update
    set lease_token = excluded.lease_token,
        expires_at = excluded.expires_at,
        updated_at = current_time
  where private.hevy_sync_leases.expires_at <= current_time;

  get diagnostics affected_rows = row_count;
  return affected_rows > 0;
end;
$$;

create or replace function public.hevy_release_sync_lease(
  target_user_id uuid,
  requested_lease_token uuid
)
returns void
language sql
security definer
set search_path = pg_catalog, public, private
as $$
  delete from private.hevy_sync_leases
  where user_id = target_user_id
    and lease_token = requested_lease_token;
$$;

drop trigger if exists user_settings_sync_phase_started_at on public.user_settings;
create trigger user_settings_sync_phase_started_at
before insert or update on public.user_settings
for each row
execute function public.sync_phase_started_at();

drop trigger if exists daily_entries_set_updated_at on public.daily_entries;
create trigger daily_entries_set_updated_at
before update on public.daily_entries
for each row
execute function public.set_updated_at();

drop trigger if exists daily_checklists_set_updated_at on public.daily_checklists;
create trigger daily_checklists_set_updated_at
before update on public.daily_checklists
for each row
execute function public.set_updated_at();

drop trigger if exists supplement_catalog_set_updated_at on public.supplement_catalog;
create trigger supplement_catalog_set_updated_at
before update on public.supplement_catalog
for each row
execute function public.set_updated_at();

drop trigger if exists user_supplements_set_updated_at on public.user_supplements;
create trigger user_supplements_set_updated_at
before update on public.user_supplements
for each row
execute function public.set_updated_at();

drop trigger if exists supplement_logs_set_updated_at on public.supplement_logs;
create trigger supplement_logs_set_updated_at
before update on public.supplement_logs
for each row
execute function public.set_updated_at();

drop trigger if exists meal_templates_set_updated_at on public.meal_templates;
create trigger meal_templates_set_updated_at
before update on public.meal_templates
for each row
execute function public.set_updated_at();

drop trigger if exists phases_set_updated_at on public.phases;
create trigger phases_set_updated_at
before update on public.phases
for each row
execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table private.hevy_api_connections enable row level security;
alter table private.hevy_sync_leases enable row level security;
alter table public.daily_entries enable row level security;
alter table public.checklist_templates enable row level security;
alter table public.daily_checklists enable row level security;
alter table public.data_imports enable row level security;
alter table public.source_workouts enable row level security;
alter table public.supplement_catalog enable row level security;
alter table public.user_supplements enable row level security;
alter table public.supplement_logs enable row level security;
alter table public.meal_templates enable row level security;
alter table public.phases enable row level security;
alter table public.phase_supplements enable row level security;
alter table public.day_templates enable row level security;

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

drop policy if exists "user_settings_select_own" on public.user_settings;
create policy "user_settings_select_own"
on public.user_settings
for select
using (auth.uid() = user_id);

drop policy if exists "user_settings_insert_own" on public.user_settings;
create policy "user_settings_insert_own"
on public.user_settings
for insert
with check (auth.uid() = user_id);

drop policy if exists "user_settings_update_own" on public.user_settings;
create policy "user_settings_update_own"
on public.user_settings
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

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

drop policy if exists "checklist_templates_select_authenticated" on public.checklist_templates;
create policy "checklist_templates_select_authenticated"
on public.checklist_templates
for select
using (auth.role() = 'authenticated');

drop policy if exists "daily_checklists_select_own" on public.daily_checklists;
create policy "daily_checklists_select_own"
on public.daily_checklists
for select
using (auth.uid() = user_id);

drop policy if exists "daily_checklists_insert_own" on public.daily_checklists;
create policy "daily_checklists_insert_own"
on public.daily_checklists
for insert
with check (auth.uid() = user_id);

drop policy if exists "daily_checklists_update_own" on public.daily_checklists;
create policy "daily_checklists_update_own"
on public.daily_checklists
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "daily_checklists_delete_own" on public.daily_checklists;
create policy "daily_checklists_delete_own"
on public.daily_checklists
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

drop policy if exists "data_imports_update_own" on public.data_imports;
create policy "data_imports_update_own"
on public.data_imports
for update
using (auth.uid() = user_id)
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

drop policy if exists "supplement_catalog_select_authenticated" on public.supplement_catalog;
create policy "supplement_catalog_select_authenticated"
on public.supplement_catalog
for select
using (auth.role() = 'authenticated');

drop policy if exists "user_supplements_select_own" on public.user_supplements;
create policy "user_supplements_select_own"
on public.user_supplements
for select
using (auth.uid() = user_id);

drop policy if exists "user_supplements_insert_own" on public.user_supplements;
create policy "user_supplements_insert_own"
on public.user_supplements
for insert
with check (auth.uid() = user_id);

drop policy if exists "user_supplements_update_own" on public.user_supplements;
create policy "user_supplements_update_own"
on public.user_supplements
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "user_supplements_delete_own" on public.user_supplements;
create policy "user_supplements_delete_own"
on public.user_supplements
for delete
using (auth.uid() = user_id);

drop policy if exists "supplement_logs_select_own" on public.supplement_logs;
create policy "supplement_logs_select_own"
on public.supplement_logs
for select
using (auth.uid() = user_id);

drop policy if exists "supplement_logs_insert_own" on public.supplement_logs;
create policy "supplement_logs_insert_own"
on public.supplement_logs
for insert
with check (auth.uid() = user_id);

drop policy if exists "supplement_logs_update_own" on public.supplement_logs;
create policy "supplement_logs_update_own"
on public.supplement_logs
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "supplement_logs_delete_own" on public.supplement_logs;
create policy "supplement_logs_delete_own"
on public.supplement_logs
for delete
using (auth.uid() = user_id);

drop policy if exists "meal_templates_select_own_or_system" on public.meal_templates;
create policy "meal_templates_select_own_or_system"
on public.meal_templates
for select
using (auth.role() = 'authenticated' and (user_id is null or auth.uid() = user_id));

drop policy if exists "meal_templates_insert_own" on public.meal_templates;
create policy "meal_templates_insert_own"
on public.meal_templates
for insert
with check (auth.uid() = user_id);

drop policy if exists "meal_templates_update_own" on public.meal_templates;
create policy "meal_templates_update_own"
on public.meal_templates
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "meal_templates_delete_own" on public.meal_templates;
create policy "meal_templates_delete_own"
on public.meal_templates
for delete
using (auth.uid() = user_id);

drop policy if exists "phases_select_authenticated" on public.phases;
create policy "phases_select_authenticated"
on public.phases
for select
using (auth.role() = 'authenticated');

drop policy if exists "phase_supplements_select_authenticated" on public.phase_supplements;
create policy "phase_supplements_select_authenticated"
on public.phase_supplements
for select
using (auth.role() = 'authenticated');

drop policy if exists "day_templates_select_authenticated" on public.day_templates;
create policy "day_templates_select_authenticated"
on public.day_templates
for select
using (auth.role() = 'authenticated');

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.user_supplements (user_id, supplement_id, active)
  select new.id, s.id, s.is_default_active
  from public.supplement_catalog s
  on conflict (user_id, supplement_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();
revoke all on schema private from public, anon, authenticated, service_role;
revoke all on all tables in schema private from public, anon, authenticated, service_role;

revoke all on schema vault from public, anon, authenticated, service_role;
revoke all on table vault.secrets from public, anon, authenticated, service_role;
revoke all on table vault.decrypted_secrets from public, anon, authenticated, service_role;

revoke all on function public.hevy_has_api_key(uuid) from public, anon, authenticated;
revoke all on function public.hevy_load_api_key(uuid) from public, anon, authenticated;
revoke all on function public.hevy_store_api_key(uuid, text) from public, anon, authenticated;
revoke all on function public.hevy_delete_api_key(uuid) from public, anon, authenticated;
revoke all on function public.hevy_list_connected_users() from public, anon, authenticated;
revoke all on function public.hevy_acquire_sync_lease(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.hevy_release_sync_lease(uuid, uuid) from public, anon, authenticated;

grant execute on function public.hevy_has_api_key(uuid) to service_role;
grant execute on function public.hevy_load_api_key(uuid) to service_role;
grant execute on function public.hevy_store_api_key(uuid, text) to service_role;
grant execute on function public.hevy_delete_api_key(uuid) to service_role;
grant execute on function public.hevy_list_connected_users() to service_role;
grant execute on function public.hevy_acquire_sync_lease(uuid, uuid, integer) to service_role;
grant execute on function public.hevy_release_sync_lease(uuid, uuid) to service_role;
