-- Row Level Security. admin = everything; owner = own org, mostly read-only.
-- There are deliberately NO policies for the anon role: nothing is publicly readable.
-- Public widget endpoints use the service role on the server (bypasses RLS)
-- only after validating the bot public_key and Origin.

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships where user_id = auth.uid() and role = 'admin');
$$;

create or replace function public.user_org_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select org_id from public.memberships where user_id = auth.uid() and org_id is not null;
$$;

create or replace function public.user_bot_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select b.id from public.bots b
  where b.org_id in (select org_id from public.memberships where user_id = auth.uid() and org_id is not null);
$$;

revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.user_org_ids() from public, anon;
revoke execute on function public.user_bot_ids() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.user_org_ids() to authenticated;
grant execute on function public.user_bot_ids() to authenticated;

-- ─── organizations ──────────────────────────────────────────────────────────
create policy org_admin_all on public.organizations for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy org_owner_read on public.organizations for select to authenticated
  using (id in (select public.user_org_ids()));

-- ─── memberships ────────────────────────────────────────────────────────────
create policy mem_admin_all on public.memberships for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy mem_self_read on public.memberships for select to authenticated
  using (user_id = auth.uid());

-- ─── bots ───────────────────────────────────────────────────────────────────
create policy bots_admin_all on public.bots for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy bots_owner_read on public.bots for select to authenticated
  using (org_id in (select public.user_org_ids()));

-- ─── bot-scoped tables: admin all, owner read ───────────────────────────────
create policy ks_admin_all on public.knowledge_sources for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy ks_owner_read on public.knowledge_sources for select to authenticated
  using (bot_id in (select public.user_bot_ids()));

create policy conv_admin_all on public.conversations for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy conv_owner_read on public.conversations for select to authenticated
  using (bot_id in (select public.user_bot_ids()));

create policy msg_admin_all on public.messages for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy msg_owner_read on public.messages for select to authenticated
  using (conversation_id in (select c.id from public.conversations c where c.bot_id in (select public.user_bot_ids())));

create policy leads_admin_all on public.leads for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy leads_owner_read on public.leads for select to authenticated
  using (bot_id in (select public.user_bot_ids()));
-- Owners can move a lead through the pipeline (status only; enforced by column grant below).
create policy leads_owner_update on public.leads for update to authenticated
  using (bot_id in (select public.user_bot_ids())) with check (bot_id in (select public.user_bot_ids()));

create policy unanswered_admin_all on public.unanswered_questions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy unanswered_owner_read on public.unanswered_questions for select to authenticated
  using (bot_id in (select public.user_bot_ids()));

create policy usage_admin_all on public.usage_monthly for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- No owner policy on usage_monthly: it holds cost, which owners must not see.
-- Phase 2 owner reports read a cost-free view.

-- Internal tables: admin only.
create policy notif_admin_all on public.notifications for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy eval_admin_all on public.eval_runs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- rate_limits: no policies → only the service role can touch it.

-- Owners may only change a lead's status column.
revoke update on public.leads from authenticated;
grant update (status) on public.leads to authenticated;
-- Admins update other lead columns through server actions that use the same
-- column set; if you need more, grant them here.
