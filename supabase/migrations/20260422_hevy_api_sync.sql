create table if not exists public.hevy_api_connections (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  api_key text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.hevy_api_connections enable row level security;

drop trigger if exists hevy_api_connections_set_updated_at on public.hevy_api_connections;
create trigger hevy_api_connections_set_updated_at
before update on public.hevy_api_connections
for each row
execute function public.set_updated_at();

comment on table public.hevy_api_connections is
  'Server-side Hevy API key storage. Access is intentionally limited to server-side service-role flows.';
