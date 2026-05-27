-- Allow workspace owners to read their own workspaces directly, in addition
-- to via membership. Required so PostgREST `return=representation` after an
-- INSERT can see the new row (the add_owner_as_member trigger fires AFTER
-- INSERT, but the RETURNING SELECT check evaluates the row against the SELECT
-- policy before the planner re-runs the membership lookup, surfacing as a
-- 42501 RLS error on the insert). This is also a defensible design on its
-- own: an owner should always be able to read their workspace.
create policy "owners can read their workspaces"
  on public.workspaces for select
  using (owner_id = auth.uid());
