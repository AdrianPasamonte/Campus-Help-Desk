
alter table public.profiles add column department text;
alter table public.profiles add constraint profiles_department_check check (department is null or (role = 'staff' and department in ('it','registrar','finance')));
alter table public.tickets add column department text not null default 'review';
alter table public.tickets add column support_area text;
alter table public.tickets add column concern text;
alter table public.tickets add constraint tickets_department_check check (department in ('it','registrar','finance','review'));
alter table public.tickets add constraint tickets_area_check check (support_area is null or support_area in ('account','portals','lab','records','fees','other'));
update public.tickets set department = case
  when description like 'Area: Fees%' then 'finance'
  when category = 'Registrar' then 'registrar'
  when category in ('Account','Software','Hardware','Network') then 'it'
  else 'review' end;
-- Existing staff have no department until an admin assigns one.
-- Release incompatible assignments without deleting any tickets or replies.
update public.tickets t set assigned_to = null where assigned_to is not null and exists (
  select 1 from public.profiles p where p.id=t.assigned_to and p.role <> 'admin'
);
create index tickets_department_created_idx on public.tickets(department,created_at);
create index if not exists tickets_student_idx on public.tickets(student_id);
create index if not exists tickets_assignee_idx on public.tickets(assigned_to);
create index if not exists ticket_comments_ticket_idx on public.ticket_comments(ticket_id);
create index profiles_department_role_idx on public.profiles(department,role);
create schema if not exists helpdesk_private;
revoke all on schema helpdesk_private from public,anon;
grant usage on schema helpdesk_private to authenticated;
create function helpdesk_private.actor_role() returns text language sql stable security definer set search_path='' as $$
  select role from public.profiles where id=(select auth.uid())
$$;
create function helpdesk_private.actor_department() returns text language sql stable security definer set search_path='' as $$
  select department from public.profiles where id=(select auth.uid()) and role='staff'
$$;
revoke all on function helpdesk_private.actor_role(),helpdesk_private.actor_department() from public,anon;
grant execute on function helpdesk_private.actor_role(),helpdesk_private.actor_department() to authenticated;

drop policy "tickets read" on public.tickets;
drop policy "tickets staff update" on public.tickets;
drop policy "create own tickets" on public.tickets;
create policy "department tickets read" on public.tickets for select to authenticated using (
  (select helpdesk_private.actor_role())='admin'
  or ((select helpdesk_private.actor_role())='student' and student_id=(select auth.uid()))
  or ((select helpdesk_private.actor_role())='staff' and department=(select helpdesk_private.actor_department()))
);
create policy "department tickets update" on public.tickets for update to authenticated using (
  (select helpdesk_private.actor_role())='admin'
  or ((select helpdesk_private.actor_role())='staff' and department=(select helpdesk_private.actor_department()) and (assigned_to is null or assigned_to=(select auth.uid())))
) with check (
  (select helpdesk_private.actor_role())='admin'
  or ((select helpdesk_private.actor_role())='staff' and department=(select helpdesk_private.actor_department()) and (assigned_to is null or assigned_to=(select auth.uid())))
);
create policy "students create own tickets" on public.tickets for insert to authenticated with check (
  (select helpdesk_private.actor_role())='student' and student_id=(select auth.uid())
);
create policy "students delete open tickets" on public.tickets for delete to authenticated using (
  (select helpdesk_private.actor_role())='student' and student_id=(select auth.uid()) and status='Open'
);
drop policy "profiles read" on public.profiles;
drop policy "profiles admin update" on public.profiles;
create policy "department profiles read" on public.profiles for select to authenticated using (
  id=(select auth.uid()) or (select helpdesk_private.actor_role())='admin'
  or role='admin'
  or (role='staff' and (
    (select helpdesk_private.actor_role())='student' or department=(select helpdesk_private.actor_department())
  ))
  or exists(select 1 from public.tickets t where t.student_id=profiles.id)
  or exists(select 1 from public.ticket_comments c where c.author_id=profiles.id)
);
create policy "admin manages roles and departments" on public.profiles for update to authenticated
  using ((select helpdesk_private.actor_role())='admin')
  with check ((select helpdesk_private.actor_role())='admin');
-- Existing comment policies inherit the ticket's RLS, so cross-department replies
-- and reads are denied as soon as the parent ticket becomes inaccessible.
revoke all on public.profiles,public.tickets,public.ticket_comments from anon,authenticated;
grant select on public.profiles to authenticated;
grant update(role,department) on public.profiles to authenticated;
grant select,delete on public.tickets to authenticated;
grant insert(subject,description,category,priority,support_area,concern) on public.tickets to authenticated;
grant update(status,assigned_to,resolution_note,department) on public.tickets to authenticated;
grant select on public.ticket_comments to authenticated;
grant insert(ticket_id,message) on public.ticket_comments to authenticated;
grant usage on sequence public.tickets_id_seq, public.ticket_comments_id_seq to authenticated;

create function helpdesk_private.route_and_guard_ticket() returns trigger language plpgsql security definer set search_path='' as $$
declare actor text;
begin
  actor := helpdesk_private.actor_role();
  if tg_op='INSERT' then
    new.department := case new.support_area
      when 'account' then 'it' when 'portals' then 'it' when 'lab' then 'it'
      when 'records' then 'registrar' when 'fees' then 'finance' when 'other' then 'review'
      else case when new.category in ('Account','Hardware','Software','Network') then 'it'
                when new.category='Registrar' then 'registrar' else 'review' end end;
  elsif auth.uid() is not null then
    if (to_jsonb(new) - array['status','assigned_to','resolution_note','department','updated_at','resolved_at','reopen_count'])
       is distinct from (to_jsonb(old) - array['status','assigned_to','resolution_note','department','updated_at','resolved_at','reopen_count']) then
      raise exception 'Ticket identity and request details cannot be changed';
    end if;
    if actor='staff' and new.department is distinct from old.department then
      raise exception 'Only admins can route a ticket to another department';
    end if;
    if actor='student' then
      if old.student_id <> auth.uid() or old.status <> 'Resolved'
         or new.status not in ('Closed','In Progress')
         or new.department is distinct from old.department
         or new.assigned_to is distinct from old.assigned_to
         or new.resolution_note is distinct from old.resolution_note
         or new.reopen_count <> old.reopen_count + (case when new.status='In Progress' then 1 else 0 end) then
        raise exception 'Students may only respond to their own resolved tickets';
      end if;
    elsif actor not in ('admin','staff') then
      raise exception 'Not authorized';
    end if;
  end if;
  if new.assigned_to is not null and not exists (
    select 1 from public.profiles p where p.id=new.assigned_to and
    (p.role='admin' or (p.role='staff' and p.department=new.department))
  ) then raise exception 'Assignee must belong to the ticket department or be an admin'; end if;
  if new.status='Resolved' and (tg_op='INSERT' or old.status is distinct from new.status or old.resolution_note is distinct from new.resolution_note) and nullif(btrim(new.resolution_note),'') is null then
    raise exception 'A resolution note is required';
  end if;
  return new;
end;
$$;
create trigger tickets_department_guard before insert or update on public.tickets for each row execute function helpdesk_private.route_and_guard_ticket();
create function helpdesk_private.release_incompatible_assignments() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.role is distinct from old.role or new.department is distinct from old.department then
    update public.tickets set assigned_to=null
    where assigned_to=new.id and not coalesce((new.role='admin' or (new.role='staff' and new.department=department)),false);
    -- NULL department is deliberately treated as no queue access.
    if new.role='staff' and new.department is null then
      update public.tickets set assigned_to=null where assigned_to=new.id;
    end if;
  end if;
  return new;
end;
$$;
create trigger profiles_department_reassign after update of role,department on public.profiles for each row execute function helpdesk_private.release_incompatible_assignments();

create or replace function public.respond_to_resolution(p_ticket_id bigint,p_fixed boolean,p_reason text default null)
returns void language plpgsql security definer set search_path='' as $$
declare t public.tickets;
begin
  if auth.uid() is null or helpdesk_private.actor_role() <> 'student' then raise exception 'Student login required'; end if;
  select * into t from public.tickets where id=p_ticket_id and student_id=auth.uid() for update;
  if not found then raise exception 'Ticket not found'; end if;
  if t.status <> 'Resolved' then raise exception 'Only resolved tickets can be confirmed or reopened'; end if;
  if p_fixed is null then raise exception 'Choose whether the problem is fixed'; end if;
  if p_fixed then update public.tickets set status='Closed' where id=p_ticket_id;
  else
    update public.tickets set status='In Progress',reopen_count=reopen_count+1 where id=p_ticket_id;
    insert into public.ticket_comments(ticket_id,author_id,message)
      values(p_ticket_id,auth.uid(),'Reopened: ' || coalesce(nullif(btrim(p_reason),''),'The problem is not fixed.'));
  end if;
end;
$$;
revoke all on function public.respond_to_resolution(bigint,boolean,text),public.current_role_name(),public.handle_new_user() from public,anon;
grant execute on function public.respond_to_resolution(bigint,boolean,text),public.current_role_name() to authenticated;
revoke all on function helpdesk_private.route_and_guard_ticket(),helpdesk_private.release_incompatible_assignments() from public,anon,authenticated;
alter function public.set_updated_at() set search_path='';
alter function public.track_resolution() set search_path='';

revoke execute on function public.current_role_name(), public.handle_new_user() from authenticated;
