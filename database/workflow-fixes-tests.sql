begin;
insert into auth.users(id,email,raw_user_meta_data) values
('d2000000-0000-4000-8000-000000000001','fix-student@example.invalid','{"full_name":"Fix Student"}'),
('d2000000-0000-4000-8000-000000000002','fix-staff@example.invalid','{"full_name":"Fix Staff"}'),
('d2000000-0000-4000-8000-000000000003','fix-admin@example.invalid','{"full_name":"Fix Admin"}');
update public.profiles set role='staff',department='it' where id='d2000000-0000-4000-8000-000000000002';
update public.profiles set role='admin' where id='d2000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000001',true);
insert into public.tickets(subject,description,category,support_area) values('FIX_TEST','Description','Account','account');
update public.profiles set full_name='Saved Student' where id=auth.uid();
do $$ declare n integer; begin
 if not exists(select 1 from public.profiles where id=auth.uid() and full_name='Saved Student') then raise exception 'Profile save failed'; end if;
 update public.profiles set full_name='Tampered' where id='d2000000-0000-4000-8000-000000000002';
 get diagnostics n=row_count; if n<>0 then raise exception 'Other profile changed'; end if;
 begin
  update public.profiles set department='it' where id=auth.uid();
  raise exception 'Department escalation allowed';
 exception when raise_exception then if sqlerrm='Department escalation allowed' then raise; end if; end;
 begin
  update public.profiles set email='fake@example.invalid' where id=auth.uid();
  raise exception 'Email spoofing allowed';
 exception when insufficient_privilege then null; end;
 begin
  update public.profiles set role='admin' where id=auth.uid();
  raise exception 'Role escalation allowed';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000002',true);
do $$ begin
 begin
  update public.tickets set status='Closed' where subject='FIX_TEST';
  raise exception 'Staff closure bypass allowed';
 exception when raise_exception then if sqlerrm='Staff closure bypass allowed' then raise; end if; end;
 begin
  update public.tickets set status='Resolved' where subject='FIX_TEST';
  raise exception 'Missing resolution allowed';
 exception when raise_exception then if sqlerrm='Missing resolution allowed' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000003',true);
do $$ begin
 begin
  update public.tickets set status='Closed' where subject='FIX_TEST';
  raise exception 'Admin closure bypass allowed';
 exception when raise_exception then if sqlerrm='Admin closure bypass allowed' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000002',true);
update public.tickets set status='Resolved',resolution_note='Fixed problem' where subject='FIX_TEST';
select set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000001',true);
do $$ declare tid bigint; begin
 select id into tid from public.tickets where subject='FIX_TEST';
 perform public.respond_to_resolution(tid,false,'Still broken');
 if not exists(select 1 from public.tickets where id=tid and status='In Progress') then raise exception 'Reopen failed'; end if;
end $$;
select set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000002',true);
update public.tickets set status='Resolved',resolution_note='Fixed again' where subject='FIX_TEST';
select set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000001',true);
do $$ declare tid bigint; begin
 select id into tid from public.tickets where subject='FIX_TEST';
 perform public.respond_to_resolution(tid,true,null);
 if not exists(select 1 from public.tickets where id=tid and status='Closed') then raise exception 'Student confirmation failed'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
update auth.users set email='confirmed@example.invalid' where id='d2000000-0000-4000-8000-000000000001';
do $$ begin
 if not exists(select 1 from public.profiles where id='d2000000-0000-4000-8000-000000000001' and email='confirmed@example.invalid' and full_name='Saved Student') then raise exception 'Email sync or persisted name failed'; end if;
end $$;
select 'PASS: staff/admin cannot close, resolution required, student reopen/confirm, own-name persistence, role/department/email protections, confirmed email sync' as result;
rollback;
