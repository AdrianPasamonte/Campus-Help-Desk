begin;
insert into auth.users(id,email,raw_user_meta_data) values
('d1000000-0000-4000-8000-000000000001','kb-student@example.invalid','{"full_name":"KB Student"}'),
('d1000000-0000-4000-8000-000000000002','kb-staff@example.invalid','{"full_name":"KB Staff"}'),
('d1000000-0000-4000-8000-000000000003','kb-admin@example.invalid','{"full_name":"KB Admin"}');
update public.profiles set role='staff',department='it' where id='d1000000-0000-4000-8000-000000000002';
update public.profiles set role='admin' where id='d1000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000003',true);
insert into public.help_articles(title,topic) values('KB_TEST_DRAFT','account');
insert into public.help_articles(title,topic,status) values('KB_TEST_ARCHIVE','other','archived');
do $$ begin
 if not exists(select 1 from public.help_articles where title='KB_TEST_DRAFT' and updated_by=auth.uid() and revision=1) then raise exception 'Audit stamp failed'; end if;
 begin
  update public.help_articles set status='published' where title='KB_TEST_DRAFT';
  raise exception 'Empty draft publication allowed';
 exception when check_violation then null; end;
 begin
  update public.help_articles set revision=9 where title='KB_TEST_DRAFT';
  raise exception 'Audit tampering allowed';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.help_articles(title,topic,concern) values('KB_BAD','lab','Forgot my school account password');
  raise exception 'Invalid concern allowed';
 exception when foreign_key_violation then null; end;
end $$;
update public.help_articles set steps='["Try this"]',contact_guidance='Contact support',status='published' where title='KB_TEST_DRAFT';
do $$ begin
 if not exists(select 1 from public.help_articles where title='KB_TEST_DRAFT' and revision=2) then raise exception 'Revision increment failed'; end if;
end $$;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
do $$ declare n integer; begin
 if not exists(select 1 from public.help_articles where title='KB_TEST_DRAFT') then raise exception 'Published invisible'; end if;
 if exists(select 1 from public.help_articles where title='KB_TEST_ARCHIVE') then raise exception 'Archive leaked'; end if;
 begin
  insert into public.help_articles(title,topic) values('KB_BAD','account');
  raise exception 'Student create allowed';
 exception when insufficient_privilege then null; end;
 update public.help_articles set title='KB_BAD' where title='KB_TEST_DRAFT';
 get diagnostics n=row_count; if n<>0 then raise exception 'Student edit allowed'; end if;
 begin
  delete from public.help_articles where title='KB_TEST_DRAFT';
  raise exception 'Delete allowed';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000003',true);
update public.help_articles set status='draft' where title='KB_TEST_DRAFT';
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000002',true);
do $$ declare n integer; begin
 if exists(select 1 from public.help_articles where title like 'KB_TEST_%') then raise exception 'Staff private article leak'; end if;
 begin
  insert into public.help_articles(title,topic) values('KB_BAD','account');
  raise exception 'Staff create allowed';
 exception when insufficient_privilege then null; end;
 update public.help_articles set title='KB_BAD' where status='published';
 get diagnostics n=row_count; if n<>0 then raise exception 'Staff edit allowed'; end if;
end $$;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000003',true);
update public.help_articles set status='archived' where title='KB_TEST_DRAFT';
update public.help_articles set status='draft' where title='KB_TEST_DRAFT';
do $$ begin
 if not exists(select 1 from public.help_articles where title='KB_TEST_DRAFT' and revision=5 and status='draft') then raise exception 'Restore lifecycle failed'; end if;
end $$;
reset role;
select 'PASS: article lifecycle, validation, audit stamps, revisions, and student/staff permissions' as result;
rollback;
