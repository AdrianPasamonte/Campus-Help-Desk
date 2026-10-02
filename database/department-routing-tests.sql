begin;

insert into auth.users(id,email,raw_user_meta_data) values
 ('d0000000-0000-4000-8000-000000000001','dept-student1@example.invalid','{"full_name":"Test Student"}'),
 ('d0000000-0000-4000-8000-000000000002','dept-student2@example.invalid','{"full_name":"Test Other Student"}'),
 ('d0000000-0000-4000-8000-000000000003','dept-it@example.invalid','{"full_name":"Test IT"}'),
 ('d0000000-0000-4000-8000-000000000004','dept-finance@example.invalid','{"full_name":"Test Finance"}'),
 ('d0000000-0000-4000-8000-000000000005','dept-admin@example.invalid','{"full_name":"Test Admin"}'),
 ('d0000000-0000-4000-8000-000000000006','dept-unassigned@example.invalid','{"full_name":"Test Unassigned"}');
update public.profiles set role='staff',department='it' where id='d0000000-0000-4000-8000-000000000003';
update public.profiles set role='staff',department='finance' where id='d0000000-0000-4000-8000-000000000004';
update public.profiles set role='admin' where id='d0000000-0000-4000-8000-000000000005';
update public.profiles set role='staff' where id='d0000000-0000-4000-8000-000000000006';
set local role authenticated;
select set_config('request.jwt.claim.sub','d0000000-0000-4000-8000-000000000001',true);
insert into public.tickets(subject,description,category,support_area,concern)
select 'DEPT_TEST_'||a,'Test concern','Other',a,'Test' from unnest(array['account','portals','lab','records','fees','other']) a;
do $$ declare n integer; begin
  if (select count(*) from public.tickets where subject like 'DEPT_TEST_%')<>6 then raise exception 'Student own-ticket visibility failed'; end if;
  if exists(select 1 from public.tickets where subject like 'DEPT_TEST_%' and department <> case support_area when 'account' then 'it' when 'portals' then 'it' when 'lab' then 'it' when 'records' then 'registrar' when 'fees' then 'finance' else 'review' end) then raise exception 'Routing failed'; end if;
  update public.tickets set department='finance' where subject='DEPT_TEST_account';
  get diagnostics n=row_count; if n<>0 then raise exception 'Student department tampering was allowed'; end if;
  begin
    insert into public.tickets(subject,description,category,assigned_to) values('BAD','BAD','Other','d0000000-0000-4000-8000-000000000003');
    raise exception 'Student assignment tampering was allowed';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','d0000000-0000-4000-8000-000000000002',true);
do $$ begin
 if exists(select 1 from public.tickets where subject like 'DEPT_TEST_%') then raise exception 'Other student leaked tickets'; end if;
end $$;
select set_config('request.jwt.claim.sub','d0000000-0000-4000-8000-000000000003',true);
do $$ declare n integer; begin
 if (select count(*) from public.tickets where subject like 'DEPT_TEST_%')<>3 then raise exception 'IT queue failed'; end if;
 update public.tickets set status='In Progress' where subject='DEPT_TEST_fees';
 get diagnostics n=row_count; if n<>0 then raise exception 'Cross-department update allowed'; end if;
 begin
  update public.profiles set role='admin' where id=auth.uid();
  raise exception 'Self promotion allowed';
 exception when insufficient_privilege then null; end;
 update public.tickets set assigned_to=auth.uid(),status='In Progress' where subject='DEPT_TEST_account';
 get diagnostics n=row_count; if n<>1 then raise exception 'Claim own department ticket failed'; end if;
 begin
  insert into public.ticket_comments(ticket_id,message) select id,'BAD' from public.tickets where subject='DEPT_TEST_fees';
  -- No visible parent produces zero insert rows; test direct known-ID below as postgres fixture.
 exception when insufficient_privilege then null; end;
 update public.tickets set status='Resolved',resolution_note='Fixed' where subject='DEPT_TEST_account';
end $$;
select set_config('request.jwt.claim.sub','d0000000-0000-4000-8000-000000000001',true);
do $$ declare tid bigint; begin
 select id into tid from public.tickets where subject='DEPT_TEST_account';
 perform public.respond_to_resolution(tid,false,'Still broken');
 if not exists(select 1 from public.tickets where id=tid and reopen_count=1 and status='In Progress') then raise exception 'Student reopen failed'; end if;
end $$;
select set_config('request.jwt.claim.sub','d0000000-0000-4000-8000-000000000004',true);
do $$ begin
 if (select count(*) from public.tickets where subject like 'DEPT_TEST_%')<>1 then raise exception 'Finance queue failed'; end if;
 if exists(select 1 from public.ticket_comments where message='Reopened: Still broken') then raise exception 'Cross-department comments leaked'; end if;
end $$;
select set_config('request.jwt.claim.sub','d0000000-0000-4000-8000-000000000006',true);
do $$ begin
 if exists(select 1 from public.tickets where subject like 'DEPT_TEST_%') then raise exception 'Staff with no department saw tickets'; end if;
end $$;
select set_config('request.jwt.claim.sub','d0000000-0000-4000-8000-000000000005',true);
do $$ declare tid bigint; begin
 if (select count(*) from public.tickets where subject like 'DEPT_TEST_%')<>6 then raise exception 'Admin visibility failed'; end if;
 begin
  update public.tickets set assigned_to='d0000000-0000-4000-8000-000000000004' where subject='DEPT_TEST_lab';
  raise exception 'Wrong-department assignment allowed';
 exception when raise_exception then if sqlerrm='Wrong-department assignment allowed' then raise; end if; end;
 update public.tickets set department='finance',assigned_to='d0000000-0000-4000-8000-000000000004' where subject='DEPT_TEST_other';
 update public.profiles set department='registrar' where id='d0000000-0000-4000-8000-000000000004';
 if exists(select 1 from public.tickets where subject='DEPT_TEST_other' and assigned_to is not null) then raise exception 'Department-change cleanup failed'; end if;
 select id into tid from public.tickets where subject='DEPT_TEST_account';
 perform set_config('dept_test.ticket_id',tid::text,true);
end $$;
select set_config('request.jwt.claim.sub','d0000000-0000-4000-8000-000000000004',true);
do $$ begin
 begin
  insert into public.ticket_comments(ticket_id,message) values(current_setting('dept_test.ticket_id')::bigint,'Unauthorized reply');
  raise exception 'Cross-department comment allowed';
 exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
 begin
  perform count(*) from public.tickets;
  raise exception 'Anonymous ticket access allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: department routing, own-ticket privacy, department queues, assignment validation, role protection, comments, unassigned staff, rerouting, cleanup, and resolution reopening' as result;

set local role authenticated;
select set_config('request.jwt.claim.sub','d0000000-0000-4000-8000-000000000005',true);
do $$ declare n integer; begin
 begin
  update public.profiles set role='staff',department='it' where id='d0000000-0000-4000-8000-000000000002';
  raise exception 'Admin could promote an existing student';
 exception when insufficient_privilege then null; end;
 update public.tickets set status='Resolved',resolution_note='Fixed' where subject='DEPT_TEST_account';
 update public.tickets set status='Open' where subject='DEPT_TEST_account';
 get diagnostics n=row_count;
 if n<>0 then raise exception 'Historical ticket was editable'; end if;
 begin
  insert into public.ticket_comments(ticket_id,message) select id,'Historical comment' from public.tickets where subject='DEPT_TEST_account';
  raise exception 'Historical comment allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: department tests, blocked admin promotion, and read-only history' as result;

rollback;