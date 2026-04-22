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
