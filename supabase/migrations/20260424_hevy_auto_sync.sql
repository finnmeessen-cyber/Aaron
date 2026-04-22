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

revoke all on function public.hevy_list_connected_users() from public, anon, authenticated;
grant execute on function public.hevy_list_connected_users() to service_role;
