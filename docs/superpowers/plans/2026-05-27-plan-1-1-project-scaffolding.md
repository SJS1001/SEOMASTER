# Plan 1.1 — Project Scaffolding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Hireling web app shell — a deployable Next.js application with Supabase Auth, a multi-tenant workspace model with RLS, Stripe subscription checkout (test mode), and CI/CD pipelines — so subsequent plans (connectors, crawler, agent runner) have a foundation to build on.

**Architecture:** Next.js 15 App Router with route groups separating `(auth)` and `(app)`. Supabase provides Postgres + Auth in one. Workspace isolation enforced at the DB layer via Postgres RLS, not at the application layer. Stripe subscriptions in test mode for V1.1; webhook syncs subscription state into our DB. Tests are mostly integration/E2E because the value of scaffolding is end-to-end correctness, not unit purity.

**Tech Stack:**
- Next.js 15.x (App Router, React Server Components, TypeScript strict)
- Supabase (Postgres 16 + Auth + local CLI for migrations)
- Tailwind CSS v4 + shadcn/ui
- Stripe (test mode; subscriptions API + webhook)
- Zod (env validation)
- Vitest (unit/integration) + Playwright (E2E)
- pnpm + Node.js 20+
- GitHub Actions (CI)
- Vercel (host) + Sentry (errors)

**Spec reference:** [`docs/superpowers/specs/2026-05-27-hireling-design.md`](../specs/2026-05-27-hireling-design.md) §5 Architecture, §9 Tech stack.

**Definition of done for this plan:**
1. A new user can sign up, complete onboarding, see a workspace dashboard, and complete a test-mode Stripe checkout.
2. RLS policies prove (via tests) that user A cannot see user B's workspace data even with a forged `workspace_id`.
3. The app deploys to Vercel and CI passes on `main`.

---

## File Structure

Files created or modified in this plan, grouped by responsibility:

**Project root**
- `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `next.config.ts`
- `.env.example`, `.env.local` (gitignored), `.gitignore` (extend existing)
- `eslint.config.mjs`, `.prettierrc.json`
- `vitest.config.ts`, `playwright.config.ts`
- `README.md` (extend existing)

**Env + config (`src/lib/config/`)**
- `src/lib/config/env.ts` — Zod-validated typed env

**Supabase client helpers (`src/lib/supabase/`)**
- `src/lib/supabase/client.ts` — browser client (anon key)
- `src/lib/supabase/server.ts` — server client with cookies
- `src/lib/supabase/admin.ts` — service-role client (server only, for webhooks)

**Database schema (`supabase/`)**
- `supabase/config.toml` — local dev config
- `supabase/migrations/0001_init.sql` — users, workspaces, workspace_members, subscriptions
- `supabase/migrations/0002_rls.sql` — RLS policies on all tenant tables
- `supabase/seed.sql` — minimal seed for local dev

**Stripe (`src/lib/stripe/`)**
- `src/lib/stripe/server.ts` — server-side Stripe SDK init
- `src/lib/stripe/products.ts` — typed product/price catalog

**Auth + middleware**
- `src/middleware.ts` — auth-gate `(app)` routes

**App routes (App Router)**
- `src/app/layout.tsx`, `src/app/page.tsx` — root layout + landing
- `src/app/(auth)/layout.tsx`, `src/app/(auth)/login/page.tsx`, `src/app/(auth)/signup/page.tsx`
- `src/app/(app)/layout.tsx` — authed layout w/ workspace switcher
- `src/app/(app)/onboarding/page.tsx` — first-workspace creation
- `src/app/(app)/dashboard/page.tsx` — empty shell w/ workspace context
- `src/app/(app)/settings/billing/page.tsx` — Stripe portal entry
- `src/app/api/stripe/checkout/route.ts` — POST creates checkout session
- `src/app/api/stripe/webhook/route.ts` — POST receives Stripe events
- `src/app/api/auth/callback/route.ts` — Supabase OAuth callback

**Domain logic (`src/lib/workspace/`)**
- `src/lib/workspace/create.ts` — create-workspace mutation
- `src/lib/workspace/get.ts` — fetch current workspace

**UI components (`src/components/`)**
- `src/components/workspace/switcher.tsx`
- `src/components/billing/checkout-button.tsx`
- shadcn/ui auto-generated components in `src/components/ui/`

**Observability**
- `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`

**Tests**
- `tests/integration/rls.test.ts` — RLS isolation invariants
- `tests/integration/stripe-webhook.test.ts` — webhook signature + handler
- `tests/e2e/signup-and-checkout.spec.ts` — full happy path
- `tests/e2e/auth-gate.spec.ts` — unauthed redirect behavior

**CI**
- `.github/workflows/ci.yml`

---

## Pre-flight (one-time, before Task 1)

These are the prerequisites you confirm exist before starting. None are tasks themselves.

- [ ] Node 20+ installed: `node --version` → `v20.x.x` or higher
- [ ] pnpm installed: `pnpm --version` → `9.x` or higher (`corepack enable && corepack prepare pnpm@latest --activate` if missing)
- [ ] Supabase CLI installed: `supabase --version` (install via `brew install supabase/tap/supabase`)
- [ ] Stripe CLI installed: `stripe --version` (`brew install stripe/stripe-cli/stripe`)
- [ ] Stripe account created + logged in: `stripe login`
- [ ] Supabase free-tier account created (web): https://supabase.com/dashboard
- [ ] Vercel account created (web)
- [ ] Sentry account created (web), project created with type "Next.js"
- [ ] Working dir is `/Users/stevensmith/Documents/SEO`, git initialized (already done in prior commit)

---

## Task 1: Initialize Next.js + TypeScript project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `eslint.config.mjs`
- Modify: `.gitignore`, `README.md`

- [ ] **Step 1: Scaffold Next.js app into existing directory**

Run:

```bash
pnpm create next-app@latest . --typescript --tailwind --eslint --app --src-dir --use-pnpm --import-alias "@/*"
```

When prompted "Would you like to use Turbopack for next dev?" → **Yes**.

When asked to overwrite the existing `README.md` → **No** (we keep the one from the spec commit).

- [ ] **Step 2: Verify the app boots**

Run:

```bash
pnpm dev
```

Expected: console shows `▲ Next.js 15.x.x  - Local: http://localhost:3000`. Open the URL in a browser and confirm the default Next.js landing page renders. Stop dev server with `Ctrl-C`.

- [ ] **Step 3: Replace default landing with a Hireling placeholder**

Overwrite `src/app/page.tsx` with:

```tsx
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-4xl font-semibold">Hireling</h1>
      <p className="text-muted-foreground max-w-md text-center">
        Your SEO hireling. Audits, writing, GBP, and outreach — drafted weekly,
        approved by you.
      </p>
      <div className="flex gap-3">
        <a className="rounded-md border px-4 py-2" href="/login">
          Log in
        </a>
        <a className="bg-foreground text-background rounded-md px-4 py-2" href="/signup">
          Start free trial
        </a>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Verify the placeholder renders**

Run `pnpm dev`. Browser shows the "Hireling" headline + two buttons (login/signup links return 404 — expected, we build those later). Stop dev server.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(scaffold): initialize Next.js 15 + TypeScript + Tailwind"
```

---

## Task 2: Install Tailwind v4 + shadcn/ui base components

**Files:**
- Create: `components.json`, `src/components/ui/button.tsx`, `src/components/ui/input.tsx`, `src/components/ui/label.tsx`, `src/components/ui/card.tsx`
- Modify: `src/app/globals.css`, `src/app/page.tsx`

- [ ] **Step 1: Initialize shadcn/ui**

Run:

```bash
pnpm dlx shadcn@latest init
```

Prompts:
- "Which color would you like to use as the base color?" → **Neutral**
- Accept defaults for remaining prompts (uses our existing `globals.css`).

- [ ] **Step 2: Add the components we need for auth + onboarding UIs**

Run:

```bash
pnpm dlx shadcn@latest add button input label card form sonner
```

Confirm `src/components/ui/button.tsx` and friends now exist.

- [ ] **Step 3: Update landing page to use shadcn `<Button>`**

Replace `src/app/page.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-semibold tracking-tight">Hireling</h1>
      <p className="text-muted-foreground max-w-md text-center">
        Your SEO hireling. Audits, writing, GBP, and outreach — drafted weekly,
        approved by you.
      </p>
      <div className="flex gap-3">
        <Button variant="outline" asChild>
          <Link href="/login">Log in</Link>
        </Button>
        <Button asChild>
          <Link href="/signup">Start free trial</Link>
        </Button>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Verify**

`pnpm dev`. Landing page renders, buttons use shadcn styling. Stop server.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(scaffold): add shadcn/ui base components"
```

---

## Task 3: Typed environment config with Zod validation

**Files:**
- Create: `src/lib/config/env.ts`, `.env.example`
- Modify: `package.json` (add `zod`)

- [ ] **Step 1: Install Zod**

```bash
pnpm add zod
```

- [ ] **Step 2: Write the env contract**

Create `src/lib/config/env.ts`:

```ts
import { z } from "zod";

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // Stripe
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1),
  // Sentry (optional in dev)
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  // App
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

const clientSchema = serverSchema.pick({
  NEXT_PUBLIC_SUPABASE_URL: true,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: true,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: true,
  NEXT_PUBLIC_SENTRY_DSN: true,
  NEXT_PUBLIC_APP_URL: true,
});

type ServerEnv = z.infer<typeof serverSchema>;
type ClientEnv = z.infer<typeof clientSchema>;

function parseServer(): ServerEnv {
  const result = serverSchema.safeParse(process.env);
  if (!result.success) {
    console.error("❌ Invalid environment:", result.error.flatten().fieldErrors);
    throw new Error("Invalid environment configuration");
  }
  return result.data;
}

function parseClient(): ClientEnv {
  const result = clientSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
  if (!result.success) {
    throw new Error("Invalid client environment");
  }
  return result.data;
}

// Lazy so importing in client code doesn't try to read server-only vars.
export const serverEnv = (typeof window === "undefined" ? parseServer() : null) as ServerEnv;
export const clientEnv = parseClient();
```

- [ ] **Step 3: Create `.env.example`**

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ... (from `supabase status`)
SUPABASE_SERVICE_ROLE_KEY=eyJ... (from `supabase status`)

# Stripe (test mode)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Sentry (optional in dev)
NEXT_PUBLIC_SENTRY_DSN=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 4: Verify parse fails on missing required vars**

```bash
NODE_ENV=production node -e "require('./src/lib/config/env.ts')"
```

Expected: errors about missing keys. (Don't actually need `tsx`; this is illustrative — skip if cumbersome, the real verification happens next task when Supabase starts.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(scaffold): add Zod-validated env config"
```

---

## Task 4: Initialize Supabase locally and define the data model

**Files:**
- Create: `supabase/config.toml` (auto), `supabase/migrations/0001_init.sql`, `supabase/seed.sql`
- Modify: `.env.local` (copy from `.env.example` + paste output of `supabase status`)

- [ ] **Step 1: Initialize Supabase**

```bash
supabase init
```

This creates `supabase/` directory with `config.toml`.

- [ ] **Step 2: Start Supabase locally**

```bash
supabase start
```

Wait until you see `started supabase local development setup.` and a list of URLs/keys.

- [ ] **Step 3: Capture credentials into `.env.local`**

```bash
cp .env.example .env.local
```

Run `supabase status` and paste the corresponding values into `.env.local`:
- `API URL` → `NEXT_PUBLIC_SUPABASE_URL`
- `anon key` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role key` → `SUPABASE_SERVICE_ROLE_KEY`

Leave Stripe values blank for now; we set them in Task 13.

- [ ] **Step 4: Create the initial migration**

```bash
supabase migration new init
```

This creates `supabase/migrations/<timestamp>_init.sql`. Replace its contents with:

```sql
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
```

- [ ] **Step 5: Apply the migration**

```bash
supabase db reset
```

This drops and re-applies all migrations. Expected: `Finished supabase db reset on branch main.`

- [ ] **Step 6: Verify the tables exist**

```bash
supabase db diff
```

Expected: no diff (schema matches migration).

You can also inspect at Supabase Studio: http://127.0.0.1:54323 → Database → Tables.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(db): initial schema — workspaces, members, subscriptions"
```

---

## Task 5: Row-Level Security policies + isolation test

**Files:**
- Create: `supabase/migrations/0002_rls.sql`, `tests/integration/rls.test.ts`, `vitest.config.ts`
- Modify: `package.json` (add `vitest`, `@vitest/ui`, `tsx`, `@supabase/supabase-js`)

This task is the single most important security boundary in the system. We TDD it.

- [ ] **Step 1: Install Vitest + Supabase JS**

```bash
pnpm add -D vitest @vitest/ui tsx
pnpm add @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: Configure Vitest**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: [],
    globals: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

Add to `package.json` scripts:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 3: Write the failing RLS test**

Create `tests/integration/rls.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function makeUser(email: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "test-password-123",
    email_confirm: true,
  });
  if (error || !data.user) throw error;
  return data.user;
}

function clientFor(userJwt: string) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${userJwt}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function jwtFor(email: string) {
  const c = createClient(SUPABASE_URL, ANON_KEY);
  const { data, error } = await c.auth.signInWithPassword({ email, password: "test-password-123" });
  if (error || !data.session) throw error;
  return data.session.access_token;
}

describe("RLS isolation between workspaces", () => {
  let aliceWs: string;
  let bobJwt: string;

  beforeAll(async () => {
    // Clean slate
    await admin.from("workspaces").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    const alice = await makeUser(`alice+${Date.now()}@test.local`);
    const bob = await makeUser(`bob+${Date.now()}@test.local`);

    // Alice creates a workspace
    const { data: ws, error } = await admin
      .from("workspaces")
      .insert({ name: "Alice Co", owner_id: alice.id })
      .select("id")
      .single();
    if (error || !ws) throw error;
    aliceWs = ws.id;

    bobJwt = await jwtFor(bob.email!);
  });

  it("Bob cannot see Alice's workspace", async () => {
    const bob = clientFor(bobJwt);
    const { data, error } = await bob.from("workspaces").select("*").eq("id", aliceWs);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("Bob cannot insert a row claiming Alice's workspace", async () => {
    const bob = clientFor(bobJwt);
    // Try to insert a subscription pointing to Alice's workspace
    const { error } = await bob.from("subscriptions").insert({
      workspace_id: aliceWs,
      stripe_customer_id: "cus_evil",
    });
    expect(error).not.toBeNull(); // RLS rejects
  });

  it("Bob cannot list workspace_members for Alice's workspace", async () => {
    const bob = clientFor(bobJwt);
    const { data, error } = await bob
      .from("workspace_members")
      .select("*")
      .eq("workspace_id", aliceWs);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

```bash
pnpm test tests/integration/rls.test.ts
```

Expected: all three tests fail (the table is currently world-readable because RLS is not enabled).

- [ ] **Step 5: Write the RLS migration**

```bash
supabase migration new rls
```

Replace contents with:

```sql
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
```

- [ ] **Step 6: Apply migration and re-run tests**

```bash
supabase db reset
pnpm test tests/integration/rls.test.ts
```

Expected: all three tests PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(db): enable RLS with workspace isolation policies + tests"
```

---

## Task 6: Supabase client helpers (browser, server, admin)

**Files:**
- Create: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts`

- [ ] **Step 1: Browser client (for client components)**

Create `src/lib/supabase/client.ts`:

```ts
import { createBrowserClient } from "@supabase/ssr";
import { clientEnv } from "@/lib/config/env";

export function createClient() {
  return createBrowserClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
```

- [ ] **Step 2: Server client (for Server Components, Route Handlers, Server Actions)**

Create `src/lib/supabase/server.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { serverEnv } from "@/lib/config/env";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — safe to ignore if middleware refreshes sessions.
          }
        },
      },
    },
  );
}
```

- [ ] **Step 3: Admin client (service_role, server-only)**

Create `src/lib/supabase/admin.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/config/env";

/**
 * Service-role client that bypasses RLS. Use only in trusted server contexts
 * (webhook handlers, scheduled jobs). NEVER import in a client component.
 */
export function createAdminClient() {
  return createClient(serverEnv.NEXT_PUBLIC_SUPABASE_URL, serverEnv.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
```

- [ ] **Step 4: Verify the project still type-checks**

```bash
pnpm tsc --noEmit
```

Expected: no errors. (If `cookies()` complains, you're on an older `@supabase/ssr` version — bump to latest.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(supabase): browser/server/admin client helpers"
```

---

## Task 7: Auth middleware + auth-gated route group

**Files:**
- Create: `src/middleware.ts`, `src/app/(auth)/layout.tsx`, `src/app/(app)/layout.tsx`, `tests/e2e/auth-gate.spec.ts`, `playwright.config.ts`

- [ ] **Step 1: Install Playwright**

```bash
pnpm add -D @playwright/test
pnpm exec playwright install --with-deps chromium
```

- [ ] **Step 2: Configure Playwright**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
```

Add scripts to `package.json`:

```json
{
  "scripts": {
    "e2e": "playwright test",
    "e2e:ui": "playwright test --ui"
  }
}
```

- [ ] **Step 3: Write the failing auth-gate test**

Create `tests/e2e/auth-gate.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("unauthenticated user is redirected from /dashboard to /login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login(\?.*)?$/);
});

test("unauthenticated user can reach /login and /signup", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /log in/i })).toBeVisible();

  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: /sign up/i })).toBeVisible();
});
```

- [ ] **Step 4: Run the test (expect failure — no routes yet)**

```bash
pnpm e2e tests/e2e/auth-gate.spec.ts
```

Expected: FAIL — `/dashboard`, `/login`, `/signup` all 404.

- [ ] **Step 5: Build the auth route group layout**

Create `src/app/(auth)/layout.tsx`:

```tsx
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
```

Create `src/app/(auth)/login/page.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Log in</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">Login form coming in Task 8.</p>
      </CardContent>
    </Card>
  );
}
```

Create `src/app/(auth)/signup/page.tsx` (identical structure, heading "Sign up"):

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SignupPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign up</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">Signup form coming in Task 8.</p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: Build the app route group + dashboard stub**

Create `src/app/(app)/layout.tsx`:

```tsx
import type { ReactNode } from "react";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b px-6 py-3 text-sm font-medium">Hireling</header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
```

Create `src/app/(app)/dashboard/page.tsx`:

```tsx
export default function DashboardPage() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-muted-foreground">Empty for now.</p>
    </div>
  );
}
```

- [ ] **Step 7: Build the middleware that gates `(app)` routes**

Create `src/middleware.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();

  const isAppRoute =
    req.nextUrl.pathname.startsWith("/dashboard") ||
    req.nextUrl.pathname.startsWith("/onboarding") ||
    req.nextUrl.pathname.startsWith("/settings");

  if (isAppRoute && !data.user) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/stripe/webhook).*)"],
};
```

- [ ] **Step 8: Re-run the E2E test**

```bash
pnpm e2e tests/e2e/auth-gate.spec.ts
```

Expected: PASS — `/dashboard` redirects to `/login`, and the auth pages render.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(auth): middleware gates app routes, auth route group with stubs"
```

---

## Task 8: Email/password signup + login forms

**Files:**
- Create: `src/components/auth/signup-form.tsx`, `src/components/auth/login-form.tsx`, `src/app/api/auth/callback/route.ts`
- Modify: `src/app/(auth)/login/page.tsx`, `src/app/(auth)/signup/page.tsx`

- [ ] **Step 1: Build the signup form (client component)**

Create `src/components/auth/signup-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignupForm() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/api/auth/callback` },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/onboarding");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Build the login form (mirror of signup)**

Create `src/components/auth/login-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(params.get("next") ?? "/dashboard");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Logging in…" : "Log in"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Wire the forms into the pages**

Update `src/app/(auth)/login/page.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <Card>
      <CardHeader><CardTitle>Log in</CardTitle></CardHeader>
      <CardContent><LoginForm /></CardContent>
    </Card>
  );
}
```

Update `src/app/(auth)/signup/page.tsx` analogously, importing `SignupForm`.

- [ ] **Step 4: Build the email-confirmation callback handler**

Create `src/app/api/auth/callback/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/onboarding";

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
```

- [ ] **Step 5: Manual smoke test**

```bash
pnpm dev
```

In a fresh incognito window:
1. Go to http://localhost:3000/signup
2. Sign up with `you@test.local` + an 8-char password
3. (Supabase local dev auto-confirms emails by default.)
4. You should land on `/onboarding` (404 for now — that's Task 9).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(auth): email+password signup & login forms"
```

---

## Task 9: Onboarding — create first workspace

**Files:**
- Create: `src/app/(app)/onboarding/page.tsx`, `src/lib/workspace/create.ts`, `src/lib/workspace/get.ts`

- [ ] **Step 1: Create-workspace mutation**

Create `src/lib/workspace/create.ts`:

```ts
"use server";

import { createClient } from "@/lib/supabase/server";

export async function createWorkspace(name: string) {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) throw new Error("Unauthenticated");

  const { data, error } = await supabase
    .from("workspaces")
    .insert({ name, owner_id: user.id })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("Insert failed");
  return data.id as string;
}
```

- [ ] **Step 2: Fetch-current-workspace helper**

Create `src/lib/workspace/get.ts`:

```ts
import { createClient } from "@/lib/supabase/server";

export async function getCurrentWorkspace() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("workspaces")
    .select("id, name, owner_id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data;
}
```

- [ ] **Step 3: Build the onboarding page**

Create `src/app/(app)/onboarding/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getCurrentWorkspace } from "@/lib/workspace/get";
import { createWorkspace } from "@/lib/workspace/create";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function OnboardingPage() {
  const existing = await getCurrentWorkspace();
  if (existing) redirect("/dashboard");

  async function action(formData: FormData) {
    "use server";
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;
    await createWorkspace(name);
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader><CardTitle>Name your workspace</CardTitle></CardHeader>
        <CardContent>
          <form action={action} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Workspace name</Label>
              <Input id="name" name="name" required placeholder="e.g., Acme Co" />
            </div>
            <Button type="submit" className="w-full">Continue</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Smoke test the full flow**

`pnpm dev`. Incognito → /signup → submit → land on /onboarding → enter a name → submit → land on /dashboard.

Verify in Supabase Studio (http://127.0.0.1:54323 → Tables → workspaces) that the row exists with your user as `owner_id`, and `workspace_members` has a matching row with `role='owner'`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(onboarding): create first workspace flow"
```

---

## Task 10: Workspace switcher component

**Files:**
- Create: `src/components/workspace/switcher.tsx`
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Server component that lists user's workspaces and renders a switcher**

Create `src/components/workspace/switcher.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";

export async function WorkspaceSwitcher() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: workspaces } = await supabase
    .from("workspaces")
    .select("id, name")
    .order("created_at", { ascending: true });

  if (!workspaces || workspaces.length === 0) return null;

  return (
    <div className="text-muted-foreground text-xs">
      Workspace: <span className="text-foreground font-medium">{workspaces[0].name}</span>
      {workspaces.length > 1 && <span> (+{workspaces.length - 1} more)</span>}
    </div>
  );
}
```

V1.1 only shows current workspace. Real switcher dropdown comes in a later plan when multi-workspace UX matters.

- [ ] **Step 2: Wire into the app layout**

Update `src/app/(app)/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { WorkspaceSwitcher } from "@/components/workspace/switcher";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <span className="text-sm font-medium">Hireling</span>
        <WorkspaceSwitcher />
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Smoke test**

`pnpm dev` → log in → /dashboard → header shows "Workspace: Acme Co".

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(workspace): header switcher"
```

---

## Task 11: Stripe SDK + product catalog

**Files:**
- Create: `src/lib/stripe/server.ts`, `src/lib/stripe/products.ts`
- Modify: `.env.local` (add Stripe keys), `package.json` (add `stripe`)

- [ ] **Step 1: Install Stripe SDK**

```bash
pnpm add stripe
```

- [ ] **Step 2: Get test-mode API keys**

In Stripe dashboard (test mode), Developers → API keys, copy:
- Secret key (sk_test_…) → `STRIPE_SECRET_KEY`
- Publishable key (pk_test_…) → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

Paste into `.env.local`.

- [ ] **Step 3: Create the three products in Stripe**

Run (replace values from your account once if you prefer dashboard creation):

```bash
stripe products create --name "Hireling Solo"
stripe prices create --product=<solo_product_id> --unit-amount=14900 --currency=usd --recurring[interval]=month

stripe products create --name "Hireling Business"
stripe prices create --product=<business_product_id> --unit-amount=34900 --currency=usd --recurring[interval]=month

stripe products create --name "Hireling Scale"
stripe prices create --product=<scale_product_id> --unit-amount=74900 --currency=usd --recurring[interval]=month
```

Record the three resulting price IDs (`price_…`).

- [ ] **Step 4: Server-side Stripe init**

Create `src/lib/stripe/server.ts`:

```ts
import Stripe from "stripe";
import { serverEnv } from "@/lib/config/env";

export const stripe = new Stripe(serverEnv.STRIPE_SECRET_KEY, {
  apiVersion: "2024-12-18.acacia",
  typescript: true,
});
```

- [ ] **Step 5: Typed product catalog**

Create `src/lib/stripe/products.ts`:

```ts
export type Tier = "solo" | "business" | "scale";

// Paste your real price IDs here (from Task 11 Step 3) or read from env in prod.
export const TIER_PRICE_IDS: Record<Tier, string> = {
  solo: process.env.STRIPE_PRICE_SOLO ?? "price_REPLACE_ME_SOLO",
  business: process.env.STRIPE_PRICE_BUSINESS ?? "price_REPLACE_ME_BUSINESS",
  scale: process.env.STRIPE_PRICE_SCALE ?? "price_REPLACE_ME_SCALE",
};

export const TIER_DISPLAY: Record<Tier, { name: string; priceUsdPerMo: number }> = {
  solo: { name: "Solo", priceUsdPerMo: 149 },
  business: { name: "Business", priceUsdPerMo: 349 },
  scale: { name: "Scale", priceUsdPerMo: 749 },
};
```

Add the three `STRIPE_PRICE_*` keys to `.env.example` and `.env.local`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(billing): Stripe SDK + typed product catalog"
```

---

## Task 12: Checkout session API route

**Files:**
- Create: `src/app/api/stripe/checkout/route.ts`, `src/components/billing/checkout-button.tsx`
- Modify: `src/app/(app)/settings/billing/page.tsx`

- [ ] **Step 1: Build the API route**

Create `src/app/api/stripe/checkout/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";
import { TIER_PRICE_IDS, type Tier } from "@/lib/stripe/products";
import { serverEnv } from "@/lib/config/env";

export async function POST(req: NextRequest) {
  const { tier, workspaceId } = (await req.json()) as { tier: Tier; workspaceId: string };
  if (!tier || !workspaceId) {
    return NextResponse.json({ error: "missing tier or workspaceId" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  // Verify the user is an owner of the requested workspace via RLS-safe query.
  const { data: ws } = await supabase
    .from("workspaces")
    .select("id, name, owner_id")
    .eq("id", workspaceId)
    .single();
  if (!ws || ws.owner_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Reuse or create a Stripe customer. Use admin client because subscriptions table
  // is write-protected by RLS.
  const admin = createAdminClient();
  const { data: existingSub } = await admin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  let customerId = existingSub?.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { workspace_id: workspaceId, user_id: user.id },
    });
    customerId = customer.id;
    await admin.from("subscriptions").upsert({
      workspace_id: workspaceId,
      stripe_customer_id: customerId,
      status: "incomplete",
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: TIER_PRICE_IDS[tier], quantity: 1 }],
    subscription_data: {
      trial_period_days: 14,
      metadata: { workspace_id: workspaceId, tier },
    },
    success_url: `${serverEnv.NEXT_PUBLIC_APP_URL}/dashboard?checkout=success`,
    cancel_url: `${serverEnv.NEXT_PUBLIC_APP_URL}/settings/billing?checkout=cancel`,
  });

  return NextResponse.json({ url: session.url });
}
```

- [ ] **Step 2: Checkout button component**

Create `src/components/billing/checkout-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Tier } from "@/lib/stripe/products";

export function CheckoutButton({ tier, workspaceId, children }: {
  tier: Tier;
  workspaceId: string;
  children: React.ReactNode;
}) {
  const [loading, setLoading] = useState(false);
  async function onClick() {
    setLoading(true);
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tier, workspaceId }),
    });
    const { url, error } = await res.json();
    setLoading(false);
    if (error) {
      alert(error);
      return;
    }
    window.location.href = url;
  }
  return <Button onClick={onClick} disabled={loading}>{loading ? "Loading…" : children}</Button>;
}
```

- [ ] **Step 3: Build the billing settings page**

Create `src/app/(app)/settings/billing/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getCurrentWorkspace } from "@/lib/workspace/get";
import { CheckoutButton } from "@/components/billing/checkout-button";
import { TIER_DISPLAY } from "@/lib/stripe/products";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function BillingPage() {
  const ws = await getCurrentWorkspace();
  if (!ws) redirect("/onboarding");

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Billing</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        {(["solo", "business", "scale"] as const).map((tier) => (
          <Card key={tier}>
            <CardHeader><CardTitle>{TIER_DISPLAY[tier].name}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-2xl">${TIER_DISPLAY[tier].priceUsdPerMo}<span className="text-muted-foreground text-sm">/mo</span></p>
              <CheckoutButton tier={tier} workspaceId={ws.id}>Start 14-day trial</CheckoutButton>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Manual smoke test**

`pnpm dev` → log in → go to /settings/billing → click "Start 14-day trial" on Solo. You should be redirected to Stripe checkout. Use test card `4242 4242 4242 4242`, any future date, any CVC. On success, you land back on `/dashboard?checkout=success`.

The subscription **status will still be `incomplete` in our DB** — Task 13's webhook fixes that.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(billing): checkout session API + billing page"
```

---

## Task 13: Stripe webhook handler with signature verification + DB sync

**Files:**
- Create: `src/app/api/stripe/webhook/route.ts`, `tests/integration/stripe-webhook.test.ts`

- [ ] **Step 1: Get the local webhook secret**

In a new terminal:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

The first line of output contains the webhook signing secret (`whsec_...`). Paste it into `.env.local` as `STRIPE_WEBHOOK_SECRET`. Keep this terminal running while developing.

- [ ] **Step 2: Write the failing webhook test**

Create `tests/integration/stripe-webhook.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import Stripe from "stripe";

const APP_URL = "http://localhost:3000";

describe("stripe webhook", () => {
  it("rejects requests with no signature", async () => {
    const res = await fetch(`${APP_URL}/api/stripe/webhook`, {
      method: "POST",
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  it("rejects requests with bad signature", async () => {
    const res = await fetch(`${APP_URL}/api/stripe/webhook`, {
      method: "POST",
      headers: { "stripe-signature": "t=1,v1=deadbeef" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  it("accepts a signed customer.subscription.created event", async () => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET!;
    const payload = JSON.stringify({
      id: "evt_test",
      object: "event",
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_test",
          customer: "cus_test_nobody",
          status: "incomplete",
          current_period_end: 0,
          items: { data: [] },
          metadata: {},
        },
      },
    });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    const res = await fetch(`${APP_URL}/api/stripe/webhook`, {
      method: "POST",
      headers: { "stripe-signature": header },
      body: payload,
    });
    // Handler should accept signature even if it ultimately no-ops on a missing customer.
    expect([200, 202]).toContain(res.status);
  });
});
```

- [ ] **Step 3: Run the test (expect failure — route doesn't exist)**

```bash
pnpm dev   # in one terminal
# (keep stripe listen running in another)
pnpm test tests/integration/stripe-webhook.test.ts
```

Expected: all three tests fail (route returns 404).

- [ ] **Step 4: Build the webhook route**

Create `src/app/api/stripe/webhook/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/config/env";

export const runtime = "nodejs";

const RELEVANT_EVENTS = new Set<Stripe.Event["type"]>([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.trial_will_end",
]);

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  if (!sig) return NextResponse.json({ error: "missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, serverEnv.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return NextResponse.json({ error: `signature error: ${(err as Error).message}` }, { status: 400 });
  }

  if (!RELEVANT_EVENTS.has(event.type)) return NextResponse.json({ received: true });

  const admin = createAdminClient();
  const sub = event.data.object as Stripe.Subscription;
  const workspaceId = sub.metadata?.workspace_id;

  // No workspace_id in metadata = subscription we don't track. Acknowledge to stop retries.
  if (!workspaceId) return NextResponse.json({ received: true, skipped: "no workspace_id" });

  const tier = (sub.metadata?.tier ?? null) as "solo" | "business" | "scale" | null;

  const { error } = await admin.from("subscriptions").upsert({
    workspace_id: workspaceId,
    stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    stripe_subscription_id: sub.id,
    tier,
    status: sub.status as
      | "trialing" | "active" | "past_due" | "canceled"
      | "unpaid" | "incomplete" | "incomplete_expired",
    current_period_end: sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null,
    trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
  });
  if (error) {
    console.error("[stripe webhook] db upsert failed", error);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
```

- [ ] **Step 5: Re-run the integration test**

```bash
pnpm test tests/integration/stripe-webhook.test.ts
```

Expected: all three tests PASS.

- [ ] **Step 6: End-to-end manual verification**

With `pnpm dev` + `stripe listen` running:
1. Visit `/settings/billing`, start a Solo trial with `4242 4242 4242 4242`.
2. In `stripe listen` terminal, observe `customer.subscription.created` event forwarded.
3. In Supabase Studio → `subscriptions` table — row now has `tier='solo'`, `status='trialing'`, `trial_end` set.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(billing): Stripe webhook with signature verification + DB sync"
```

---

## Task 14: End-to-end happy-path test

**Files:**
- Create: `tests/e2e/signup-and-checkout.spec.ts`

- [ ] **Step 1: Write the E2E test**

```ts
import { test, expect } from "@playwright/test";

test("user can sign up, onboard, view dashboard, and reach Stripe checkout", async ({ page }) => {
  const email = `e2e+${Date.now()}@test.local`;
  const password = "test-password-123";

  // Sign up
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /create account/i }).click();

  // Onboarding
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Workspace name").fill("E2E Co");
  await page.getByRole("button", { name: /continue/i }).click();

  // Dashboard
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText("E2E Co")).toBeVisible();

  // Billing → Stripe checkout
  await page.goto("/settings/billing");
  await expect(page.getByText("Solo")).toBeVisible();

  // Clicking the trial button navigates to Stripe (external). We just confirm the
  // request fires and the redirect URL is on stripe.com.
  await Promise.all([
    page.waitForURL(/checkout\.stripe\.com/),
    page.getByRole("button", { name: /start 14-day trial/i }).first().click(),
  ]);
  expect(page.url()).toContain("checkout.stripe.com");
});
```

- [ ] **Step 2: Run it**

```bash
pnpm e2e tests/e2e/signup-and-checkout.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test(e2e): full signup → onboarding → checkout happy path"
```

---

## Task 15: Sentry error monitoring

**Files:**
- Create: `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation.ts`
- Modify: `next.config.ts`, `.env.local`

- [ ] **Step 1: Install Sentry**

```bash
pnpm dlx @sentry/wizard@latest -i nextjs --saas
```

The wizard prompts for your Sentry org/project and writes the config files for you. Choose "skip" if it asks about tracing for now.

- [ ] **Step 2: Confirm DSN is wired**

`.env.local` should now have `NEXT_PUBLIC_SENTRY_DSN`. Verify also in `sentry.*.config.ts` files.

- [ ] **Step 3: Smoke-test Sentry**

Add a temporary error route to verify wiring. Create `src/app/api/dev/throw/route.ts`:

```ts
export async function GET() {
  throw new Error("Sentry test from /api/dev/throw");
}
```

Run `pnpm dev`, visit http://localhost:3000/api/dev/throw, and check Sentry → Issues. You should see the captured error within ~30 seconds.

Delete the test route.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(observability): Sentry error monitoring"
```

---

## Task 16: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile

      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1
        with: { version: latest }
      - name: Start Supabase
        run: supabase start
      - name: Export Supabase env
        run: |
          echo "NEXT_PUBLIC_SUPABASE_URL=$(supabase status -o json | jq -r '.API_URL')" >> $GITHUB_ENV
          echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=$(supabase status -o json | jq -r '.ANON_KEY')" >> $GITHUB_ENV
          echo "SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o json | jq -r '.SERVICE_ROLE_KEY')" >> $GITHUB_ENV

      - name: Lint
        run: pnpm lint
      - name: Typecheck
        run: pnpm tsc --noEmit
      - name: Unit + integration tests
        env:
          STRIPE_SECRET_KEY: sk_test_dummy
          STRIPE_WEBHOOK_SECRET: whsec_dummy
          NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: pk_test_dummy
        run: pnpm test -- --reporter=verbose --exclude="**/stripe-webhook.test.ts"
        # webhook test needs a live dev server; run separately if/when needed
```

E2E tests are excluded from CI for V1.1 — they need a real Stripe checkout page which is flaky to test in CI. Re-enable in Plan 1.2+ behind a stripe-mock or self-hosted test page.

- [ ] **Step 2: Push to GitHub and verify**

Create the GitHub repo (`hireling` or whatever name), push:

```bash
gh repo create hireling --private --source=. --remote=origin --push
```

Watch CI run at github.com/<you>/hireling/actions. Lint + typecheck + unit/integration tests should all pass.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "ci: lint + typecheck + tests on PR and main"
```

---

## Task 17: Deploy to Vercel + production Supabase

**Files:**
- Modify: `next.config.ts` (if Sentry needs adjustments for prod)

- [ ] **Step 1: Create production Supabase project**

In Supabase dashboard → New project. Wait for provisioning.

- [ ] **Step 2: Apply migrations to prod**

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

- [ ] **Step 3: Connect Vercel**

```bash
pnpm dlx vercel
```

Follow prompts to link the project. When asked about settings, accept defaults.

- [ ] **Step 4: Configure Vercel env vars**

In Vercel dashboard → Project → Settings → Environment Variables, add each of the keys in `.env.example` for the **Production** environment, using the production Supabase keys and Stripe **test mode** keys (we stay in test mode for V1.1).

Set `NEXT_PUBLIC_APP_URL` to `https://<your-vercel-domain>.vercel.app`.

- [ ] **Step 5: Configure the Stripe webhook against the deployed URL**

Stripe dashboard → Developers → Webhooks → Add endpoint:
- URL: `https://<your-vercel-domain>.vercel.app/api/stripe/webhook`
- Events: select all four `customer.subscription.*` events listed in `RELEVANT_EVENTS`.

Copy the new signing secret → update Vercel env var `STRIPE_WEBHOOK_SECRET` for production → redeploy.

- [ ] **Step 6: Smoke test production**

Visit your Vercel URL. Sign up with a fresh email, complete onboarding, hit /settings/billing, run a test-mode checkout. Verify subscription row appears in production Supabase.

- [ ] **Step 7: Commit any prod-only adjustments and tag**

```bash
git add -A
git commit -m "deploy: production environment configured"
git tag v0.1.0-scaffold
git push origin main --tags
```

---

## Done

When all tasks above are checked, Plan 1.1 is complete. The next plan (Plan 1.2 — Connector framework + Google OAuth) builds on top of:
- `workspaces` table (extends with `connections` child table)
- `src/lib/supabase/admin.ts` (used to write OAuth tokens server-side)
- Middleware patterns (callback routes for OAuth flows)
- CI + deploy pipeline (just keep working)

## Self-Review Notes

**Spec coverage (against `2026-05-27-hireling-design.md` §5 + §9):**
- ✅ Next.js + Vercel — Tasks 1, 17
- ✅ Supabase Postgres + Auth — Tasks 4, 5, 6, 7, 8
- ✅ Workspace model + RLS isolation — Tasks 4, 5 (with proof tests)
- ✅ Stripe subscriptions — Tasks 11, 12, 13
- ✅ Three pricing tiers (Solo/Business/Scale) — Tasks 11, 12
- ✅ Sentry — Task 15
- ✅ CI/CD — Tasks 16, 17
- ❌ Inngest, Anthropic SDK, Playwright crawler, Helicone — out of scope for Plan 1.1, owned by later plans (1.5, 1.6, etc.). Correct.
- ❌ Connectors (Google/Shopify/WP/Gmail) — owned by Plan 1.2-1.4. Correct.

**Placeholder scan:** Searched for "TBD", "TODO", "implement later", "appropriate error handling", "similar to". One controlled use of `price_REPLACE_ME_*` in `src/lib/stripe/products.ts` — flagged inline as needing real IDs from Task 11 Step 3. No other placeholders. ✅

**Type consistency:**
- `subscription_tier` enum values `'solo'|'business'|'scale'` — matches `Tier` TS type in `src/lib/stripe/products.ts`. ✅
- `subscription_status` enum — matches the status union in webhook handler upsert. ✅
- `workspace_role` enum `'owner'|'admin'|'member'` — only `'owner'` used in V1.1 (admin/member reserved for V2). Acceptable. ✅
- `createWorkspace` returns `string` (workspace id), used as such in callers. ✅
- `getCurrentWorkspace` returns `{ id, name, owner_id } | null` — callers handle the null case. ✅

No issues to fix.
