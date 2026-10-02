create function helpdesk_private.require_student_confirmation() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status='Closed' and new.status is distinct from old.status and auth.uid() is not null then
  if helpdesk_private.actor_role()<>'student' or old.student_id<>auth.uid() or old.status<>'Resolved' or nullif(btrim(old.resolution_note),'') is null then
   raise exception 'Only the requesting student can close a resolved ticket by confirming the solution';
  end if;
 end if;
 return new;
end $$;
revoke all on function helpdesk_private.require_student_confirmation() from public,anon,authenticated;
create trigger tickets_require_student_confirmation before update of status on public.tickets for each row execute function helpdesk_private.require_student_confirmation();
grant update(full_name) on public.profiles to authenticated;
create policy "users edit own profile name" on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create function helpdesk_private.guard_profile_name_edit() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user='authenticated' and helpdesk_private.actor_role()<>'admin' and
 (to_jsonb(new)-array['full_name','updated_at']) is distinct from (to_jsonb(old)-array['full_name','updated_at']) then
  raise exception 'Only your profile name can be edited';
 end if;
 if new.full_name is distinct from old.full_name and (new.full_name is null or length(btrim(new.full_name)) not between 1 and 150) then
  raise exception 'Name must contain 1 to 150 characters';
 end if;
 return new;
end $$;
revoke all on function helpdesk_private.guard_profile_name_edit() from public,anon,authenticated;
create trigger profiles_guard_name_edit before update on public.profiles for each row execute function helpdesk_private.guard_profile_name_edit();
create function helpdesk_private.sync_confirmed_profile_email() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.profiles set email=new.email where id=new.id;
 return new;
end $$;
revoke all on function helpdesk_private.sync_confirmed_profile_email() from public,anon,authenticated;
create trigger auth_sync_confirmed_profile_email after update of email on auth.users for each row when(old.email is distinct from new.email) execute function helpdesk_private.sync_confirmed_profile_email();
