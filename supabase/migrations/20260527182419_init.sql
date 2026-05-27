-- Workspaces table: one per "company" buying Hireling
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index workspaces_owner_id_idx on public.workspaces(owner_id);

-- Workspace members: users with access to a workspace
create type public.workspace_role as enum ('owner', 'admin', 'member');

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index workspace_members_user_id_idx on public.workspace_members(user_id);

-- Subscriptions: Stripe-backed billing state for each workspace
create type public.subscription_tier as enum ('solo', 'business', 'scale');
create type public.subscription_status as enum (
  'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired'
);

create table public.subscriptions (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  stripe_customer_id text not null unique,
  stripe_subscription_id text unique,
  tier public.subscription_tier,
  status public.subscription_status not null default 'incomplete',
  current_period_end timestamptz,
  trial_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger to keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger workspaces_updated_at before update on public.workspaces
  for each row execute function public.set_updated_at();

create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- When a workspace is created, automatically add the owner as a member with 'owner' role
create or replace function public.add_owner_as_member()
returns trigger language plpgsql security definer as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

create trigger workspaces_add_owner after insert on public.workspaces
  for each row execute function public.add_owner_as_member();
