create extension if not exists supabase_vault with schema vault;

create schema if not exists private;

create table if not exists private.hevy_api_connections (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  vault_secret_id uuid not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table private.hevy_api_connections enable row level security;

drop trigger if exists private_hevy_api_connections_set_updated_at on private.hevy_api_connections;
create trigger private_hevy_api_connections_set_updated_at
before update on private.hevy_api_connections
for each row
execute function public.set_updated_at();

do $$
declare
  legacy_row record;
  next_secret_id uuid;
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'hevy_api_connections'
  ) then
    for legacy_row in
      execute 'select user_id, api_key, created_at, updated_at from public.hevy_api_connections'
    loop
      if exists (
        select 1
        from private.hevy_api_connections
        where user_id = legacy_row.user_id
      ) then
        continue;
      end if;

      next_secret_id := vault.create_secret(
        legacy_row.api_key
      );

      insert into private.hevy_api_connections (
        user_id,
        vault_secret_id,
        created_at,
        updated_at
      )
      values (
        legacy_row.user_id,
        next_secret_id,
        coalesce(legacy_row.created_at, timezone('utc', now())),
        coalesce(legacy_row.updated_at, timezone('utc', now()))
      );
    end loop;
  end if;
end;
$$;

drop table if exists public.hevy_api_connections;

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
  next_secret_id uuid;
begin
  if new_api_key is null or btrim(new_api_key) = '' then
    raise exception 'hevy_api_key_required';
  end if;

  select vault_secret_id
  into existing_secret_id
  from private.hevy_api_connections
  where user_id = target_user_id
  for update;

  if existing_secret_id is not null then
    perform vault.update_secret(
      existing_secret_id,
      btrim(new_api_key)
    );

    update private.hevy_api_connections
    set updated_at = timezone('utc', now())
    where user_id = target_user_id;

    return;
  end if;

  next_secret_id := vault.create_secret(btrim(new_api_key));

  begin
    insert into private.hevy_api_connections (user_id, vault_secret_id)
    values (
      target_user_id,
      next_secret_id
    );
  exception
    when unique_violation then
      delete from vault.secrets
      where id = next_secret_id;

      select vault_secret_id
      into existing_secret_id
      from private.hevy_api_connections
      where user_id = target_user_id
      for update;

      if existing_secret_id is null then
        raise;
      end if;

      perform vault.update_secret(
        existing_secret_id,
        btrim(new_api_key)
      );

      update private.hevy_api_connections
      set updated_at = timezone('utc', now())
      where user_id = target_user_id;
  end;
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

revoke all on schema private from public, anon, authenticated, service_role;
revoke all on all tables in schema private from public, anon, authenticated, service_role;

revoke all on schema vault from public, anon, authenticated, service_role;
revoke all on table vault.secrets from public, anon, authenticated, service_role;
revoke all on table vault.decrypted_secrets from public, anon, authenticated, service_role;

revoke all on function public.hevy_has_api_key(uuid) from public, anon, authenticated;
revoke all on function public.hevy_load_api_key(uuid) from public, anon, authenticated;
revoke all on function public.hevy_store_api_key(uuid, text) from public, anon, authenticated;
revoke all on function public.hevy_delete_api_key(uuid) from public, anon, authenticated;

grant execute on function public.hevy_has_api_key(uuid) to service_role;
grant execute on function public.hevy_load_api_key(uuid) to service_role;
grant execute on function public.hevy_store_api_key(uuid, text) to service_role;
grant execute on function public.hevy_delete_api_key(uuid) to service_role;
