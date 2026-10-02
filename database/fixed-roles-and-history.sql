
revoke update(role) on public.profiles from authenticated;
create policy "completed tickets are read only" on public.tickets as restrictive for update to authenticated
using (status in ('Open','In Progress')) with check (true);
drop policy "comments insert" on public.ticket_comments;
create policy "comments insert" on public.ticket_comments for insert to authenticated with check (
  author_id=(select auth.uid()) and exists(
    select 1 from public.tickets t where t.id=ticket_comments.ticket_id and t.status in ('Open','In Progress')
  )
);
