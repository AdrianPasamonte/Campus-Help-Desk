create table helpdesk_private.article_concerns(topic text not null,concern text not null,primary key(topic,concern));
insert into helpdesk_private.article_concerns(topic,concern) values ('account','Forgot my school account password'),
('account','Cannot use Microsoft Authenticator'),
('account','No access to my registered phone or number'),
('account','Not receiving a verification code'),
('account','Another sign-in issue'),
('portals','Website not loading or showing an error'),
('portals','Cannot open or download a handout'),
('portals','Cannot upload an assignment'),
('portals','Page content or information is missing'),
('portals','Another eLMS or SIMS issue'),
('lab','Computer will not turn on'),
('lab','Computer freezes or restarts unexpectedly'),
('lab','Monitor, keyboard, or mouse not working'),
('lab','Application is not working or is missing'),
('lab','Computer cannot connect to the internet'),
('records','Request a school document'),
('records','Need help with enrollment'),
('records','Student record is missing or incorrect'),
('fees','Payment is not showing in my account'),
('fees','Question about my fees or balance'),
('other','Concern not listed');
revoke all on helpdesk_private.article_concerns from public,anon,authenticated;
alter table helpdesk_private.article_concerns enable row level security;
create table public.help_articles (
 id text primary key default gen_random_uuid()::text,
 title text not null check(length(btrim(title)) between 1 and 160),
 topic text not null check(topic in ('account','portals','lab','records','fees','other')),
 concern text,
 steps jsonb not null default '[]'::jsonb check(jsonb_typeof(steps)='array'),
 contact_guidance text not null default '',
 source_url text check(source_url is null or source_url ~ '^https://[^[:space:]]+$'),
 portal_hint text check(portal_hint is null or (topic='portals' and portal_hint in ('eLMS','SIMS'))),
 status text not null default 'draft' check(status in ('draft','published','archived')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by uuid references public.profiles(id) on delete set null,
 revision integer not null default 1,
 foreign key(topic,concern) references helpdesk_private.article_concerns(topic,concern),
 check(status <> 'published' or (jsonb_array_length(steps)>0 and length(btrim(contact_guidance))>0))
);
alter table public.help_articles enable row level security;
revoke all on public.help_articles from public,anon,authenticated;
grant select on public.help_articles to authenticated;
grant insert(title,topic,concern,steps,contact_guidance,source_url,portal_hint,status) on public.help_articles to authenticated;
grant update(title,topic,concern,steps,contact_guidance,source_url,portal_hint,status) on public.help_articles to authenticated;
create policy "read published articles or admin drafts" on public.help_articles for select to authenticated
 using (status='published' or (select helpdesk_private.actor_role())='admin');
create policy "admins create articles" on public.help_articles for insert to authenticated
 with check ((select helpdesk_private.actor_role())='admin');
create policy "admins edit articles" on public.help_articles for update to authenticated
 using ((select helpdesk_private.actor_role())='admin')
 with check ((select helpdesk_private.actor_role())='admin');
create index help_articles_status_topic_idx on public.help_articles(status,topic);
create index help_articles_editor_idx on public.help_articles(updated_by);
create function helpdesk_private.stamp_help_article() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from jsonb_array_elements(new.steps) x where jsonb_typeof(x) <> 'string' or length(btrim(x #>> '{}'))=0) then
   raise exception 'Each instruction must be a nonempty text step';
 end if;
 new.updated_at=now();
 if auth.uid() is not null then new.updated_by=auth.uid(); end if;
 if tg_op='UPDATE' then new.revision=old.revision+1; end if;
 return new;
end $$;
revoke all on function helpdesk_private.stamp_help_article() from public,anon,authenticated;
create trigger help_articles_stamp before insert or update on public.help_articles for each row execute function helpdesk_private.stamp_help_article();
insert into public.help_articles(id,title,topic,concern,steps,contact_guidance,source_url,portal_hint,status) values ('password','Forgot your school account password?','account','Forgot my school account password','["Use the Forgot password option on the school account sign-in page.","Follow the recovery prompts. If recovery does not work, contact support using an email you can still access."]'::jsonb,'Create a ticket if you cannot complete recovery. Include your school account email and the error shown, but never your password or verification codes.','https://elms.sti.edu/page/show/495374',null,'published'),
('authenticator','Cannot use Microsoft Authenticator?','account','Cannot use Microsoft Authenticator','["Describe whether the app is missing, the sign-in request does not appear, or you are using a different phone.","If the sign-in screen offers another verification method you can access, try that option."]'::jsonb,'If you cannot verify your sign-in, request assistance. Account recovery must be handled by authorized staff after identity verification.',null,null,'published'),
('phone','Lost access to your registered phone or number?','account','No access to my registered phone or number','["If another verification method is offered and you can use it, try that method.","Prepare your school account email and an alternative email where support can reach you."]'::jsonb,'Create a ticket if you cannot complete verification. Explain what changed; never share an OTP or ask someone to approve a sign-in for you.',null,null,'published'),
('website','eLMS or SIMS is not loading','portals','Website not loading or showing an error','["Check your internet connection and try loading another website.","Reload the page or try another up-to-date browser. Save the exact error message and note when it happened."]'::jsonb,'If the error continues, include the website name and affected page. For password or verification problems, choose Account access instead.',null,null,'published'),
('handout','Cannot open or download an eLMS handout?','portals','Cannot open or download a handout','["Check whether the issue affects one handout or several.","Try downloading the file again and opening it with an application that supports its file type."]'::jsonb,'Include the subject, handout name, and any error message if it still fails.',null,'eLMS','published'),
('assignment','Your assignment will not upload','portals','Cannot upload an assignment','["Check the file type, file size, and submission instructions shown for the activity.","Keep a copy of your work and record the error and the time of your attempt."]'::jsonb,'Create a ticket for a technical upload problem and inform your teacher if a deadline is affected. A ticket does not automatically extend the deadline.',null,'eLMS','published'),
('computer','A lab computer will not turn on','lab','Computer will not turn on','["Note the lab or room number and the computer number or asset tag, if visible.","Tell your teacher or lab supervisor so they know the computer cannot be used. Do not open the computer case or alter shared equipment."]'::jsonb,'Create a ticket with the location and describe whether any lights, fan sounds, or error messages appear.',null,null,'published'),
('application','A lab application is not working or is missing','lab','Application is not working or is missing','["Note the application name, lab or room, and computer number if known.","Describe whether the application is missing, will not open, or displays an error. Tell your teacher if it affects the activity."]'::jsonb,'Create a ticket with these details. Ask authorized staff to handle installations or changes to lab software.',null,null,'published'),
('records','Need help with student records or enrollment?','records','Student record is missing or incorrect','["Identify the document, record, or enrollment step you need help with.","Include the relevant school year or term and clearly describe your request. For a document request, state the document type and purpose."]'::jsonb,'Use Student records & enrollment to submit your concern. If a page simply will not load, choose eLMS & SIMS. Requirements and processing times must be confirmed with the responsible office.',null,null,'published'),
('payments','A payment is not showing in your account','fees','Payment is not showing in my account','["Check the payment date and keep your payment reference or receipt available.","Describe which payment or balance you are asking about. Include the relevant school year or term if applicable."]'::jsonb,'Create a ticket under Fees & payments. The responsible office must verify the transaction; submitting a ticket does not change your balance.',null,null,'published');

create index help_articles_topic_concern_idx on public.help_articles(topic,concern);
