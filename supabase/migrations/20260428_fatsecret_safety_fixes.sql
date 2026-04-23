alter table public.daily_entries
  add column if not exists nutrition_source text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'daily_entries_nutrition_source_check'
  ) then
    alter table public.daily_entries
      add constraint daily_entries_nutrition_source_check
      check (nutrition_source in ('manual', 'fatsecret'));
  end if;
end;
$$;

update public.daily_entries daily_entry
set nutrition_source = 'fatsecret'
where nutrition_source is null
  and exists (
    select 1
    from public.source_nutrition_entries source_entry
    where source_entry.user_id = daily_entry.user_id
      and source_entry.entry_date = daily_entry.entry_date
      and source_entry.provider = 'fatsecret'
  );

update public.daily_entries
set nutrition_source = 'manual'
where nutrition_source is null
  and (
    calories is not null
    or protein_g is not null
    or carbs_g is not null
    or fat_g is not null
  );

update public.source_nutrition_entries
set raw_payload = jsonb_build_object(
  'provider', provider,
  'provider_entry_id', provider_entry_id,
  'entry_date', entry_date,
  'payload_minimized', true
)
where provider = 'fatsecret';

alter table private.fatsecret_connections
  drop column if exists token_type,
  drop column if exists token_expires_at;

create or replace function public.fatsecret_load_connection(target_user_id uuid)
returns jsonb
language sql
security definer
set search_path = public, private, vault
as $$
  select jsonb_build_object(
    'auth_secret', secret_payload.secret_json ->> 'auth_secret',
    'auth_token', secret_payload.secret_json ->> 'auth_token',
    'last_synced_date', connection.last_synced_date
  )
  from private.fatsecret_connections connection
  join lateral (
    select secret.decrypted_secret::jsonb as secret_json
    from vault.decrypted_secrets secret
    where secret.id = connection.vault_secret_id
  ) secret_payload on true
  where connection.user_id = target_user_id;
$$;

drop function if exists public.fatsecret_store_connection(uuid, jsonb, text, timestamptz);

create or replace function public.fatsecret_store_connection(
  target_user_id uuid,
  new_credentials jsonb
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

  select vault_secret_id
  into existing_secret_id
  from private.fatsecret_connections
  where user_id = target_user_id
  for update;

  if existing_secret_id is not null then
    perform vault.update_secret(existing_secret_id, new_credentials::text);

    update private.fatsecret_connections
    set updated_at = timezone('utc', now())
    where user_id = target_user_id;

    return;
  end if;

  next_secret_id := vault.create_secret(new_credentials::text);

  begin
    insert into private.fatsecret_connections (
      user_id,
      vault_secret_id
    )
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
      from private.fatsecret_connections
      where user_id = target_user_id
      for update;

      if existing_secret_id is null then
        raise;
      end if;

      perform vault.update_secret(existing_secret_id, new_credentials::text);

      update private.fatsecret_connections
      set updated_at = timezone('utc', now())
      where user_id = target_user_id;
  end;
end;
$$;

revoke all on function public.fatsecret_store_connection(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.fatsecret_store_connection(uuid, jsonb) to service_role;
