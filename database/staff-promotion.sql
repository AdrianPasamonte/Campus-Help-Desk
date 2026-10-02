
create function helpdesk_private.promote_staff_to_admin(p_staff_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or helpdesk_private.actor_role() is distinct from 'admin' then
    raise exception 'Only admins can promote staff';
  end if;
  update public.profiles set role='admin',department=null
  where id=p_staff_id and role='staff';
  if not found then raise exception 'Only existing staff accounts can be promoted'; end if;
end;
$$;
revoke all on function helpdesk_private.promote_staff_to_admin(uuid) from public,anon;
grant execute on function helpdesk_private.promote_staff_to_admin(uuid) to authenticated;
create function public.promote_staff_to_admin(p_staff_id uuid)
returns void language sql security invoker set search_path='' as $$
  select helpdesk_private.promote_staff_to_admin(p_staff_id)
$$;
revoke all on function public.promote_staff_to_admin(uuid) from public,anon;
grant execute on function public.promote_staff_to_admin(uuid) to authenticated;
