create type public.connection_provider as enum ('google');

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider public.connection_provider not null,
  google_email text,
  scopes text[] not null default '{}',
  -- AES-256-GCM encrypted token material (plaintext never stored)
  access_token_cipher text not null,
  access_token_iv text not null,
  access_token_tag text not null,
  refresh_token_cipher text,
  refresh_token_iv text,
  refresh_token_tag text,
  access_token_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider)
);

create index connections_workspace_idx on public.connections(workspace_id);

create trigger connections_updated_at before update on public.connections
  for each row execute function public.set_updated_at();

alter table public.connections enable row level security;

-- Members may read their workspace's connection rows (status display).
-- Token columns are AES-encrypted; the key is server-only, so ciphertext exposure is inert.
create policy "members read connections"
  on public.connections for select
  using (public.is_workspace_member(workspace_id));

-- No insert/update/delete policies for anon/authenticated.
-- Writes happen only via the service-role client (OAuth callback + disconnect route).
