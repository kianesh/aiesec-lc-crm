create or replace function public.is_lc_member(target_lc_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.lc_members
    where lc_id = target_lc_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.is_lc_admin(target_lc_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.lc_members
    where lc_id = target_lc_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

create policy "users can read their own profile"
on users for select
to authenticated
using (id = auth.uid());

create policy "users can insert their own profile"
on users for insert
to authenticated
with check (id = auth.uid());

create policy "users can update their own profile"
on users for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "members can read their local committees"
on local_committees for select
to authenticated
using (public.is_lc_member(id));

create policy "authenticated users can create local committees"
on local_committees for insert
to authenticated
with check (true);

create policy "admins can update local committees"
on local_committees for update
to authenticated
using (public.is_lc_admin(id))
with check (public.is_lc_admin(id));

create policy "members can read lc membership"
on lc_members for select
to authenticated
using (user_id = auth.uid() or public.is_lc_member(lc_id));

create policy "admins can manage lc membership"
on lc_members for all
to authenticated
using (public.is_lc_admin(lc_id))
with check (public.is_lc_admin(lc_id));

create policy "admins can manage invitations"
on invitations for all
to authenticated
using (public.is_lc_admin(lc_id))
with check (public.is_lc_admin(lc_id));

create policy "members can read contacts"
on contacts for select
to authenticated
using (public.is_lc_member(lc_id));

create policy "members can manage contacts"
on contacts for all
to authenticated
using (public.is_lc_member(lc_id))
with check (public.is_lc_member(lc_id));

create policy "members can manage contact tags"
on contact_tags for all
to authenticated
using (
  exists (
    select 1 from contacts
    where contacts.id = contact_tags.contact_id
      and public.is_lc_member(contacts.lc_id)
  )
)
with check (
  exists (
    select 1 from contacts
    where contacts.id = contact_tags.contact_id
      and public.is_lc_member(contacts.lc_id)
  )
);

create policy "members can manage conversations"
on conversations for all
to authenticated
using (public.is_lc_member(lc_id))
with check (public.is_lc_member(lc_id));

create policy "members can manage messages"
on messages for all
to authenticated
using (
  exists (
    select 1 from conversations
    where conversations.id = messages.conversation_id
      and public.is_lc_member(conversations.lc_id)
  )
)
with check (
  exists (
    select 1 from conversations
    where conversations.id = messages.conversation_id
      and public.is_lc_member(conversations.lc_id)
  )
);

create policy "members can manage social posts"
on social_posts for all
to authenticated
using (public.is_lc_member(lc_id))
with check (public.is_lc_member(lc_id));

create policy "members can manage email campaigns"
on email_campaigns for all
to authenticated
using (public.is_lc_member(lc_id))
with check (public.is_lc_member(lc_id));

create policy "admins can manage integrations"
on integrations for all
to authenticated
using (public.is_lc_admin(lc_id))
with check (public.is_lc_admin(lc_id));

create policy "members can read expa sync state"
on expa_sync_state for select
to authenticated
using (public.is_lc_member(lc_id));

create policy "admins can manage expa sync state"
on expa_sync_state for all
to authenticated
using (public.is_lc_admin(lc_id))
with check (public.is_lc_admin(lc_id));

create policy "members can read audit log"
on audit_log for select
to authenticated
using (public.is_lc_member(lc_id));

create policy "members can write audit log"
on audit_log for insert
to authenticated
with check (public.is_lc_member(lc_id));
