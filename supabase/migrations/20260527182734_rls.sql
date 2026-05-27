-- Enable RLS on all tenant tables
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.subscriptions enable row level security;

-- Helper: is the calling user a member of a given workspace?
create or replace function public.is_workspace_member(ws_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = ws_id and user_id = auth.uid()
  );
$$;

-- workspaces: members can see their workspaces. Only auth.users can insert their own.
create policy "members can read their workspaces"
  on public.workspaces for select
  using (public.is_workspace_member(id));

create policy "users insert workspaces they own"
  on public.workspaces for insert
  with check (owner_id = auth.uid());

create policy "owners update their workspaces"
  on public.workspaces for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "owners delete their workspaces"
  on public.workspaces for delete
  using (owner_id = auth.uid());

-- workspace_members: members can read peers in their workspaces; only owners modify
create policy "members read peers"
  on public.workspace_members for select
  using (public.is_workspace_member(workspace_id));

create policy "owners insert members"
  on public.workspace_members for insert
  with check (
    exists (
      select 1 from public.workspaces
      where id = workspace_id and owner_id = auth.uid()
    )
  );

create policy "owners delete members"
  on public.workspace_members for delete
  using (
    exists (
      select 1 from public.workspaces
      where id = workspace_id and owner_id = auth.uid()
    )
  );

-- subscriptions: members can read; only service_role (webhook) writes.
create policy "members read subscription"
  on public.subscriptions for select
  using (public.is_workspace_member(workspace_id));

-- No insert/update/delete policies on subscriptions for anon/authenticated roles.
-- service_role bypasses RLS automatically, so the webhook handler can write.