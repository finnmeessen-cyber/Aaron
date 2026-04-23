create extension if not exists supabase_vault with schema vault;

alter type public.provider_type add value if not exists 'fatsecret';

create table if not exists private.fatsecret_connections (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  vault_secret_id uuid not null,
  token_type text not null default 'oauth1' check (token_type in ('oauth1', 'oauth2')),
  token_expires_at timestamptz,
  last_synced_date date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists private.fatsecret_sync_leases (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  lease_token uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists private_fatsecret_sync_leases_expires_at_idx
  on private.fatsecret_sync_leases (expires_at);

alter table public.daily_entries
  alter column calories type numeric(10, 2)
  using calories::numeric(10, 2);

alter table public.daily_entries
  alter column calories drop not null;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'daily_entries'
      and column_name = 'protein_g'
  ) then
    alter table public.daily_entries
      add column protein_g numeric(10, 2) check (protein_g is null or protein_g >= 0);
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'daily_entries'
      and column_name = 'carbs_g'
  ) then
    alter table public.daily_entries
      add column carbs_g numeric(10, 2) check (carbs_g is null or carbs_g >= 0);
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'daily_entries'
      and column_name = 'fat_g'
  ) then
    alter table public.daily_entries
      add column fat_g numeric(10, 2) check (fat_g is null or fat_g >= 0);
  end if;
end;
$$;

create table if not exists public.source_nutrition_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  data_import_id uuid references public.data_imports (id) on delete set null,
  provider public.provider_type not null default 'fatsecret',
  provider_entry_id text not null,
  entry_date date not null,
  meal_type text not null,
  food_name text not null,
  calories numeric(10, 2) check (calories is null or calories >= 0),
  protein_g numeric(10, 2) check (protein_g is null or protein_g >= 0),
  carbs_g numeric(10, 2) check (carbs_g is null or carbs_g >= 0),
  fat_g numeric(10, 2) check (fat_g is null or fat_g >= 0),
  raw_payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists source_nutrition_entries_user_entry_date_idx
  on public.source_nutrition_entries (user_id, entry_date desc);

create index if not exists source_nutrition_entries_provider_entry_idx
  on public.source_nutrition_entries (provider, provider_entry_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'source_nutrition_entries_user_provider_entry_id_unique'
  ) then
    alter table public.source_nutrition_entries
      add constraint source_nutrition_entries_user_provider_entry_id_unique
      unique (user_id, provider, provider_entry_id);
  end if;
end;
$$;

alter table private.fatsecret_connections enable row level security;
alter table private.fatsecret_sync_leases enable row level security;
alter table public.source_nutrition_entries enable row level security;

drop trigger if exists private_fatsecret_connections_set_updated_at on private.fatsecret_connections;
create trigger private_fatsecret_connections_set_updated_at
before update on private.fatsecret_connections
for each row
execute function public.set_updated_at();

drop trigger if exists private_fatsecret_sync_leases_set_updated_at on private.fatsecret_sync_leases;
create trigger private_fatsecret_sync_leases_set_updated_at
before update on private.fatsecret_sync_leases
for each row
execute function public.set_updated_at();

create or replace function public.fatsecret_has_connection(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
begin
  return exists (
    select 1
    from private.fatsecret_connections
    where user_id = target_user_id
  );
end;
$$;

create or replace function public.fatsecret_load_connection(target_user_id uuid)
returns jsonb
language sql
security definer
set search_path = public, private, vault
as $$
  select jsonb_build_object(
    'auth_secret', secret_payload.secret_json ->> 'auth_secret',
    'auth_token', secret_payload.secret_json ->> 'auth_token',
    'last_synced_date', connection.last_synced_date,
    'token_expires_at', connection.token_expires_at,
    'token_type', connection.token_type
  )
  from private.fatsecret_connections connection
  join lateral (
    select secret.decrypted_secret::jsonb as secret_json
    from vault.decrypted_secrets secret
    where secret.id = connection.vault_secret_id
  ) secret_payload on true
  where connection.user_id = target_user_id;
$$;

create or replace function public.fatsecret_store_connection(
  target_user_id uuid,
  new_credentials jsonb,
  new_token_type text default 'oauth1',
  new_token_expires_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public, private, vault
as $$
declare
  existing_secret_id uuid;
  next_secret_id uuid;
begin
  if coalesce(new_credentials ->> 'auth_token', '') = '' then
    raise exception 'fatsecret_auth_token_required';
  end if;

  if coalesce(new_credentials ->> 'auth_secret', '') = '' then
    raise exception 'fatsecret_auth_secret_required';
  end if;

  if new_token_type not in ('oauth1', 'oauth2') then
    raise exception 'fatsecret_invalid_token_type';
  end if;

  select vault_secret_id
  into existing_secret_id
  from private.fatsecret_connections
  where user_id = target_user_id
  for update;

  if existing_secret_id is not null then
    perform vault.update_secret(existing_secret_id, new_credentials::text);

    update private.fatsecret_connections
    set token_expires_at = new_token_expires_at,
        token_type = new_token_type,
        updated_at = timezone('utc', now())
    where user_id = target_user_id;

    return;
  end if;

  next_secret_id := vault.create_secret(new_credentials::text);

  begin
    insert into private.fatsecret_connections (
      user_id,
      vault_secret_id,
      token_type,
      token_expires_at
    )
    values (
      target_user_id,
      next_secret_id,
      new_token_type,
      new_token_expires_at
    );
  exception
    when unique_violation then
      delete from vault.secrets
      where id = next_secret_id;

      select vault_secret_id
      into existing_secret_id
      from private.fatsecret_connections
      where user_id = target_user_id
      for update;

      if existing_secret_id is null then
        raise;
      end if;

      perform vault.update_secret(existing_secret_id, new_credentials::text);

      update private.fatsecret_connections
      set token_expires_at = new_token_expires_at,
          token_type = new_token_type,
          updated_at = timezone('utc', now())
      where user_id = target_user_id;
  end;
end;
$$;

create or replace function public.fatsecret_update_last_synced_date(
  target_user_id uuid,
  new_last_synced_date date
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  update private.fatsecret_connections
  set last_synced_date = new_last_synced_date,
      updated_at = timezone('utc', now())
  where user_id = target_user_id;
end;
$$;

create or replace function public.fatsecret_delete_connection(target_user_id uuid)
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
  from private.fatsecret_connections
  where user_id = target_user_id
  for update;

  if existing_secret_id is not null then
    delete from vault.secrets
    where id = existing_secret_id;
  end if;

  delete from private.fatsecret_connections
  where user_id = target_user_id;
end;
$$;

create or replace function public.fatsecret_list_connected_users()
returns table(user_id uuid)
language sql
security definer
set search_path = public, private
as $$
  select connection.user_id
  from private.fatsecret_connections connection
  order by connection.updated_at asc;
$$;

create or replace function public.fatsecret_acquire_sync_lease(
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
  delete from private.fatsecret_sync_leases
  where expires_at <= current_time;

  insert into private.fatsecret_sync_leases (
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
  where private.fatsecret_sync_leases.expires_at <= current_time;

  get diagnostics affected_rows = row_count;
  return affected_rows > 0;
end;
$$;

create or replace function public.fatsecret_release_sync_lease(
  target_user_id uuid,
  requested_lease_token uuid
)
returns void
language sql
security definer
set search_path = pg_catalog, public, private
as $$
  delete from private.fatsecret_sync_leases
  where user_id = target_user_id
    and lease_token = requested_lease_token;
$$;

drop policy if exists "source_nutrition_entries_select_own" on public.source_nutrition_entries;
create policy "source_nutrition_entries_select_own"
on public.source_nutrition_entries
for select
using (auth.uid() = user_id);

drop policy if exists "source_nutrition_entries_insert_own" on public.source_nutrition_entries;
create policy "source_nutrition_entries_insert_own"
on public.source_nutrition_entries
for insert
with check (auth.uid() = user_id);

drop policy if exists "source_nutrition_entries_update_own" on public.source_nutrition_entries;
create policy "source_nutrition_entries_update_own"
on public.source_nutrition_entries
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "source_nutrition_entries_delete_own" on public.source_nutrition_entries;
create policy "source_nutrition_entries_delete_own"
on public.source_nutrition_entries
for delete
using (auth.uid() = user_id);

revoke all on function public.fatsecret_has_connection(uuid) from public, anon, authenticated;
revoke all on function public.fatsecret_load_connection(uuid) from public, anon, authenticated;
revoke all on function public.fatsecret_store_connection(uuid, jsonb, text, timestamptz) from public, anon, authenticated;
revoke all on function public.fatsecret_update_last_synced_date(uuid, date) from public, anon, authenticated;
revoke all on function public.fatsecret_delete_connection(uuid) from public, anon, authenticated;
revoke all on function public.fatsecret_list_connected_users() from public, anon, authenticated;
revoke all on function public.fatsecret_acquire_sync_lease(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.fatsecret_release_sync_lease(uuid, uuid) from public, anon, authenticated;

grant execute on function public.fatsecret_has_connection(uuid) to service_role;
grant execute on function public.fatsecret_load_connection(uuid) to service_role;
grant execute on function public.fatsecret_store_connection(uuid, jsonb, text, timestamptz) to service_role;
grant execute on function public.fatsecret_update_last_synced_date(uuid, date) to service_role;
grant execute on function public.fatsecret_delete_connection(uuid) to service_role;
grant execute on function public.fatsecret_list_connected_users() to service_role;
grant execute on function public.fatsecret_acquire_sync_lease(uuid, uuid, integer) to service_role;
grant execute on function public.fatsecret_release_sync_lease(uuid, uuid) to service_role;
