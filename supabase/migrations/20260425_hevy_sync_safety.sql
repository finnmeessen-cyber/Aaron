create schema if not exists private;

create table if not exists private.hevy_sync_leases (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  lease_token uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table private.hevy_sync_leases enable row level security;

drop trigger if exists private_hevy_sync_leases_set_updated_at on private.hevy_sync_leases;
create trigger private_hevy_sync_leases_set_updated_at
before update on private.hevy_sync_leases
for each row
execute function public.set_updated_at();

create index if not exists private_hevy_sync_leases_expires_at_idx
  on private.hevy_sync_leases (expires_at);

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

drop policy if exists "data_imports_update_own" on public.data_imports;
create policy "data_imports_update_own"
on public.data_imports
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

revoke all on function public.hevy_acquire_sync_lease(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.hevy_release_sync_lease(uuid, uuid) from public, anon, authenticated;

grant execute on function public.hevy_acquire_sync_lease(uuid, uuid, integer) to service_role;
grant execute on function public.hevy_release_sync_lease(uuid, uuid) to service_role;
