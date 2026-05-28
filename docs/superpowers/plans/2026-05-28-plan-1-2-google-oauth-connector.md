# Plan 1.2 — Connector Framework + Google OAuth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a workspace connect a Google account once and grant Hireling access to Search Console, Business Profile, and Gmail-send — storing the OAuth tokens encrypted at rest, refreshing them automatically, and exposing connection status in a settings page.

**Architecture:** A generic connector layer keyed by `(workspace_id, provider)`. Google is the first (and only, this plan) provider. OAuth uses the standard authorization-code flow with `access_type=offline` to obtain a refresh token. Tokens are encrypted with AES-256-GCM (key from env, never in the DB) and written only by trusted server contexts (the callback route + disconnect route) via the service-role client. A `getValidAccessToken()` helper transparently refreshes expired access tokens. The Google OAuth app stays in **Testing mode** (≤100 test users, no Google verification / CASA assessment needed) for this plan; production verification is a separate pre-launch task.

**Tech Stack:** Next.js 16 (App Router, route handlers), Supabase Postgres + RLS, Node `crypto` (AES-256-GCM), Google OAuth 2.0 (`accounts.google.com` + `oauth2.googleapis.com`), Vitest, Playwright, Zod.

**Depends on:** Plan 1.1 (shipped — `e76889b`, tag `v0.1.0-scaffold`). Builds on: `workspaces` table, `src/lib/supabase/{server,admin}.ts`, `src/lib/config/env.ts`, the `(app)/settings/` route group, and the `proxy.ts` auth gate.

**Spec reference:** `docs/superpowers/specs/2026-05-27-hireling-design.md` §5 (Connectors), §8 (token encryption at rest).

**Definition of done:**
1. A logged-in user can click "Connect Google" on `/settings/connections`, complete Google consent for GSC+GBP+Gmail scopes, and return to a page showing "Connected as <email>".
2. Tokens are stored encrypted (cipher/iv/tag columns) — the plaintext never touches the DB.
3. `getValidAccessToken(workspaceId, "google")` returns a usable access token, auto-refreshing when expired.
4. A user can disconnect, which revokes the grant at Google and deletes the row.
5. RLS proves a non-member cannot read another workspace's connection row (test).
6. The build deploys to Vercel with the 3 new env vars and the connections page works in production.

---

## File Structure

**Database**
- `supabase/migrations/<ts>_connections.sql` — `connections` table, `connection_provider` enum, RLS policies, `updated_at` trigger

**Config**
- `src/lib/config/env.ts` — MODIFY: add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `CONNECTION_ENCRYPTION_KEY`

**Crypto**
- `src/lib/crypto/tokens.ts` — `encryptSecret()` / `decryptSecret()` (AES-256-GCM)

**Connector core**
- `src/lib/connectors/types.ts` — `Provider`, `ConnectionRecord`, `StoredTokens`, `OAuthTokenResponse` types
- `src/lib/connectors/store.ts` — `saveGoogleConnection()`, `getConnection()`, `deleteConnection()`, `getValidAccessToken()`
- `src/lib/connectors/google/scopes.ts` — scope constants + combined list
- `src/lib/connectors/google/oauth.ts` — `buildAuthUrl()`, `exchangeCodeForTokens()`, `refreshAccessToken()`, `revokeToken()`, `fetchGoogleEmail()`

**Routes**
- `src/app/api/connections/google/start/route.ts` — set state cookie, redirect to Google
- `src/app/api/connections/google/callback/route.ts` — verify state, exchange code, store tokens
- `src/app/api/connections/google/disconnect/route.ts` — revoke + delete

**UI**
- `src/app/(app)/settings/connections/page.tsx` — connection status + actions
- `src/components/connections/connect-button.tsx` — client component (links to start route)
- `src/components/connections/disconnect-button.tsx` — client component (POSTs to disconnect)

**Tests**
- `tests/integration/crypto-tokens.test.ts`
- `tests/integration/connections-rls.test.ts`
- `tests/integration/google-oauth.test.ts`
- `tests/e2e/connections-page.spec.ts`

---

## Pre-flight

- [ ] On branch off `main`. Create the feature branch:
  ```bash
  cd /Users/stevensmith/Documents/SEO
  git checkout main && git pull
  git checkout -b feat/plan-1-2-google-oauth
  ```
- [ ] Supabase local running (`docker ps | grep supabase_db_SEO`; else `supabase start`).
- [ ] `.env.local` has working Supabase + Stripe + Sentry values from Plan 1.1.

---

## Task 1: Google Cloud OAuth app setup (USER-INTERACTIVE)

This task is performed by the user in the Google Cloud Console; the agent cannot click through Google's UI. The agent should pause and present these steps, then collect the resulting Client ID + Client Secret.

**No files. Produces:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and a configured OAuth app in Testing mode.

- [ ] **Step 1: Create / select a Google Cloud project**

Go to https://console.cloud.google.com/projectcreate — create a project named `hireling` (or reuse one).

- [ ] **Step 2: Enable the three APIs**

In https://console.cloud.google.com/apis/library enable, one at a time:
- "Google Search Console API"
- "Google Business Profile API" (if not visible, it must be requested via the GBP API access form: https://developers.google.com/my-business/content/prereqs — note this can take days; GSC + Gmail work immediately)
- "Gmail API"

- [ ] **Step 3: Configure the OAuth consent screen**

https://console.cloud.google.com/apis/credentials/consent
- User type: **External**
- App name: `Hireling`, support email: your email
- Scopes: add these (Add or Remove Scopes → paste under "Manually add scopes"):
  - `https://www.googleapis.com/auth/webmasters.readonly`
  - `https://www.googleapis.com/auth/business.manage`
  - `https://www.googleapis.com/auth/gmail.send`
  - `openid`, `https://www.googleapis.com/auth/userinfo.email`
- Publishing status: leave as **Testing**.
- Test users: add the email(s) you'll test with (e.g., `steven@digitalrain.ai`). Only these accounts can complete OAuth while in Testing mode.

- [ ] **Step 4: Create the OAuth client ID**

https://console.cloud.google.com/apis/credentials → Create Credentials → OAuth client ID
- Application type: **Web application**
- Name: `Hireling Web`
- Authorized redirect URIs — add BOTH:
  - `http://localhost:3000/api/connections/google/callback`
  - `https://seomaster-mocha.vercel.app/api/connections/google/callback`
- Create → copy the **Client ID** and **Client Secret**.

- [ ] **Step 5: Hand the agent the credentials**

Provide `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` so the agent can populate `.env.local` (Task 2). Do not paste them into committed files.

---

## Task 2: Environment additions + encryption key

**Files:**
- Modify: `src/lib/config/env.ts`
- Modify: `.env.example`, `.env.local` (gitignored)

- [ ] **Step 1: Generate a 32-byte encryption key**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Copy the output — this is `CONNECTION_ENCRYPTION_KEY`. AES-256 needs exactly 32 bytes; base64 of 32 bytes is 44 chars ending in `=`.

- [ ] **Step 2: Add the three vars to the server schema in `src/lib/config/env.ts`**

Insert these lines into the `serverSchema` object, after the `STRIPE_PRICE_SCALE` line and before the Sentry comment:

```ts
  // Google OAuth (connector layer)
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  // 32-byte base64 key for AES-256-GCM token encryption
  CONNECTION_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "must be 32 bytes (base64)"),
```

Do NOT add them to `clientSchema` — they are server-only secrets.

- [ ] **Step 3: Add them to `.env.example`**

Append:

```
# Google OAuth (connector layer) — from Google Cloud Console (Task 1)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
# 32-byte base64 key: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
CONNECTION_ENCRYPTION_KEY=
```

- [ ] **Step 4: Populate `.env.local`** with the real Client ID, Client Secret (from Task 1), and the generated key (from Step 1).

- [ ] **Step 5: Verify typecheck**

```bash
pnpm tsc --noEmit
```
Expected: exit 0. (The runtime parse will now require these three vars; `pnpm dev` will fail to boot until `.env.local` has them — that's intended.)

- [ ] **Step 6: Commit** (note: `.env.local` is gitignored, only `env.ts` + `.env.example` are committed)

```bash
git add src/lib/config/env.ts .env.example
git commit -m "feat(connectors): add Google OAuth + encryption key env vars"
```

---

## Task 3: Token encryption module

**Files:**
- Create: `src/lib/crypto/tokens.ts`
- Test: `tests/integration/crypto-tokens.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/crypto-tokens.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret } from "@/lib/crypto/tokens";

describe("token encryption (AES-256-GCM)", () => {
  it("round-trips a secret", () => {
    const plain = "ya29.a0AfH6SMexample-access-token";
    const enc = encryptSecret(plain);
    expect(enc.cipher).not.toContain(plain);
    expect(enc.iv).toBeTruthy();
    expect(enc.tag).toBeTruthy();
    expect(decryptSecret(enc)).toBe(plain);
  });

  it("produces a different ciphertext each call (random IV)", () => {
    const a = encryptSecret("same-value");
    const b = encryptSecret("same-value");
    expect(a.cipher).not.toBe(b.cipher);
    expect(a.iv).not.toBe(b.iv);
  });

  it("rejects a tampered ciphertext (auth tag mismatch)", () => {
    const enc = encryptSecret("sensitive");
    const tampered = { ...enc, cipher: Buffer.from("00".repeat(8), "hex").toString("base64") };
    expect(() => decryptSecret(tampered)).toThrow();
  });
});
```

- [ ] **Step 2: Run it — expect failure (module missing)**

```bash
pnpm test tests/integration/crypto-tokens.test.ts
```
Expected: FAIL — cannot resolve `@/lib/crypto/tokens`.

- [ ] **Step 3: Implement `src/lib/crypto/tokens.ts`**

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { serverEnv } from "@/lib/config/env";

export type EncryptedSecret = {
  cipher: string; // base64 ciphertext
  iv: string; // base64 12-byte nonce
  tag: string; // base64 16-byte GCM auth tag
};

function key(): Buffer {
  return Buffer.from(serverEnv.CONNECTION_ENCRYPTION_KEY, "base64");
}

export function encryptSecret(plaintext: string): EncryptedSecret {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plaintext, "utf8"), c.final()]);
  return {
    cipher: enc.toString("base64"),
    iv: iv.toString("base64"),
    tag: c.getAuthTag().toString("base64"),
  };
}

export function decryptSecret(e: EncryptedSecret): string {
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(e.iv, "base64"));
  d.setAuthTag(Buffer.from(e.tag, "base64"));
  const dec = Buffer.concat([d.update(Buffer.from(e.cipher, "base64")), d.final()]);
  return dec.toString("utf8");
}
```

- [ ] **Step 4: Run the test — expect pass**

```bash
pnpm test tests/integration/crypto-tokens.test.ts
```
Expected: 3 passed. (Vitest loads `.env.local` via the existing `vitest.config.ts` dotenv setup, so `CONNECTION_ENCRYPTION_KEY` is available.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/crypto/tokens.ts tests/integration/crypto-tokens.test.ts
git commit -m "feat(crypto): AES-256-GCM secret encryption with tamper detection"
```

---

## Task 4: `connections` table + RLS

**Files:**
- Create: `supabase/migrations/<ts>_connections.sql`
- Test: `tests/integration/connections-rls.test.ts`

- [ ] **Step 1: Write the failing RLS isolation test**

Create `tests/integration/connections-rls.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

async function makeUser(email: string) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: "pw-123456", email_confirm: true });
  if (error || !data.user) throw error;
  return data.user;
}
async function jwtFor(email: string) {
  const c = createClient(URL, ANON);
  const { data, error } = await c.auth.signInWithPassword({ email, password: "pw-123456" });
  if (error || !data.session) throw error;
  return data.session.access_token;
}
function clientFor(jwt: string) {
  return createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

describe("connections RLS isolation", () => {
  let aliceWs: string;
  let bobJwt: string;

  beforeAll(async () => {
    await admin.from("connections").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await admin.from("workspaces").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    const alice = await makeUser(`alice+${Date.now()}@test.local`);
    const bob = await makeUser(`bob+${Date.now()}@test.local`);
    const { data: ws } = await admin
      .from("workspaces").insert({ name: "Alice Co", owner_id: alice.id }).select("id").single();
    aliceWs = ws!.id;
    // Seed a connection for Alice's workspace (service role bypasses RLS)
    await admin.from("connections").insert({
      workspace_id: aliceWs, provider: "google", google_email: "alice@gmail.com",
      scopes: ["gmail.send"], access_token_cipher: "x", access_token_iv: "y", access_token_tag: "z",
      access_token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
    });
    bobJwt = await jwtFor(bob.email!);
  });

  it("Bob cannot read Alice's connection", async () => {
    const bob = clientFor(bobJwt);
    const { data } = await bob.from("connections").select("*").eq("workspace_id", aliceWs);
    expect(data).toEqual([]);
  });

  it("Bob cannot insert a connection into Alice's workspace", async () => {
    const bob = clientFor(bobJwt);
    const { error } = await bob.from("connections").insert({
      workspace_id: aliceWs, provider: "google",
      access_token_cipher: "x", access_token_iv: "y", access_token_tag: "z",
      access_token_expires_at: new Date().toISOString(),
    });
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run it — expect failure (table missing)**

```bash
pnpm test tests/integration/connections-rls.test.ts
```
Expected: FAIL — relation "connections" does not exist.

- [ ] **Step 3: Create the migration**

```bash
supabase migration new connections
```

Replace the new file's contents with:

```sql
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
```

(`set_updated_at()` and `is_workspace_member()` already exist from Plan 1.1 migrations.)

- [ ] **Step 4: Apply + re-run test**

```bash
supabase db reset
pnpm test tests/integration/connections-rls.test.ts
```
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations tests/integration/connections-rls.test.ts
git commit -m "feat(db): connections table with RLS member-read, service-role-write"
```

---

## Task 5: Connector types

**Files:**
- Create: `src/lib/connectors/types.ts`

- [ ] **Step 1: Create the types module**

```ts
export type Provider = "google";

/** Raw token response from Google's token endpoint. */
export type OAuthTokenResponse = {
  access_token: string;
  expires_in: number; // seconds
  refresh_token?: string; // present only on first consent (prompt=consent + access_type=offline)
  scope: string; // space-delimited
  token_type: string; // "Bearer"
  id_token?: string;
};

/** A connection row as read from the DB (token ciphers included but opaque). */
export type ConnectionRecord = {
  id: string;
  workspace_id: string;
  provider: Provider;
  google_email: string | null;
  scopes: string[];
  access_token_cipher: string;
  access_token_iv: string;
  access_token_tag: string;
  refresh_token_cipher: string | null;
  refresh_token_iv: string | null;
  refresh_token_tag: string | null;
  access_token_expires_at: string; // ISO timestamp
};

/** Connection status surfaced to the UI. */
export type ConnectionStatus =
  | { state: "disconnected" }
  | { state: "connected"; email: string | null; scopes: string[] };
```

- [ ] **Step 2: Typecheck**

```bash
pnpm tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/connectors/types.ts
git commit -m "feat(connectors): shared connector types"
```

---

## Task 6: Google scopes + OAuth URL builder

**Files:**
- Create: `src/lib/connectors/google/scopes.ts`, `src/lib/connectors/google/oauth.ts`
- Test: `tests/integration/google-oauth.test.ts`

- [ ] **Step 1: Create the scopes module**

`src/lib/connectors/google/scopes.ts`:

```ts
export const GOOGLE_SCOPES = {
  openid: "openid",
  email: "https://www.googleapis.com/auth/userinfo.email",
  searchConsole: "https://www.googleapis.com/auth/webmasters.readonly",
  businessProfile: "https://www.googleapis.com/auth/business.manage",
  gmailSend: "https://www.googleapis.com/auth/gmail.send",
} as const;

export const GOOGLE_SCOPE_LIST: string[] = [
  GOOGLE_SCOPES.openid,
  GOOGLE_SCOPES.email,
  GOOGLE_SCOPES.searchConsole,
  GOOGLE_SCOPES.businessProfile,
  GOOGLE_SCOPES.gmailSend,
];
```

- [ ] **Step 2: Write the failing test for `buildAuthUrl`**

Create `tests/integration/google-oauth.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildAuthUrl } from "@/lib/connectors/google/oauth";

describe("google oauth url builder", () => {
  it("includes required params, offline access, and all scopes", () => {
    const url = new URL(buildAuthUrl({ state: "abc123", redirectUri: "http://localhost:3000/api/connections/google/callback" }));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBe("abc123");
    expect(url.searchParams.get("include_granted_scopes")).toBe("true");
    const scope = url.searchParams.get("scope") ?? "";
    expect(scope).toContain("webmasters.readonly");
    expect(scope).toContain("business.manage");
    expect(scope).toContain("gmail.send");
  });
});
```

- [ ] **Step 3: Run — expect failure**

```bash
pnpm test tests/integration/google-oauth.test.ts
```
Expected: FAIL — cannot resolve `buildAuthUrl`.

- [ ] **Step 4: Implement `src/lib/connectors/google/oauth.ts`**

```ts
import { serverEnv } from "@/lib/config/env";
import { GOOGLE_SCOPE_LIST } from "@/lib/connectors/google/scopes";
import type { OAuthTokenResponse } from "@/lib/connectors/types";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

export function buildAuthUrl(opts: { state: string; redirectUri: string }): string {
  const params = new URLSearchParams({
    client_id: serverEnv.GOOGLE_CLIENT_ID,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: opts.state,
    scope: GOOGLE_SCOPE_LIST.join(" "),
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export async function exchangeCodeForTokens(opts: {
  code: string;
  redirectUri: string;
}): Promise<OAuthTokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: opts.code,
      client_id: serverEnv.GOOGLE_CLIENT_ID,
      client_secret: serverEnv.GOOGLE_CLIENT_SECRET,
      redirect_uri: opts.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as OAuthTokenResponse;
}

export async function refreshAccessToken(refreshToken: string): Promise<OAuthTokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: serverEnv.GOOGLE_CLIENT_ID,
      client_secret: serverEnv.GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`token refresh failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as OAuthTokenResponse;
}

export async function revokeToken(token: string): Promise<void> {
  await fetch(REVOKE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  });
}

export async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { email?: string };
  return data.email ?? null;
}
```

- [ ] **Step 5: Run the test — expect pass**

```bash
pnpm test tests/integration/google-oauth.test.ts
```
Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add src/lib/connectors/google tests/integration/google-oauth.test.ts
git commit -m "feat(connectors): google scopes + oauth url/token/refresh/revoke helpers"
```

---

## Task 7: Connection store (save / get / delete / getValidAccessToken)

**Files:**
- Create: `src/lib/connectors/store.ts`
- Test: extend `tests/integration/google-oauth.test.ts` with refresh-on-expiry behavior

- [ ] **Step 1: Write the failing test for refresh-on-expiry**

Append to `tests/integration/google-oauth.test.ts`:

```ts
import { describe as describe2, it as it2, expect as expect2, vi, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { saveGoogleConnection, getValidAccessToken, deleteConnection } from "@/lib/connectors/store";
import * as oauth from "@/lib/connectors/google/oauth";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

describe2("connection store getValidAccessToken", () => {
  let wsId: string;

  beforeEach(async () => {
    await admin.from("connections").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await admin.from("workspaces").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    const { data: u } = await admin.auth.admin.createUser({
      email: `store+${Date.now()}@test.local`, password: "pw-123456", email_confirm: true,
    });
    const { data: ws } = await admin
      .from("workspaces").insert({ name: "Store Co", owner_id: u!.user!.id }).select("id").single();
    wsId = ws!.id;
  });

  it2("returns the stored token when not expired", async () => {
    await saveGoogleConnection(wsId, {
      access_token: "valid-token", expires_in: 3600, refresh_token: "refresh-1",
      scope: "openid", token_type: "Bearer",
    }, "user@gmail.com");
    const tok = await getValidAccessToken(wsId, "google");
    expect2(tok).toBe("valid-token");
  });

  it2("refreshes when the access token is expired", async () => {
    await saveGoogleConnection(wsId, {
      access_token: "old-token", expires_in: -10, refresh_token: "refresh-1",
      scope: "openid", token_type: "Bearer",
    }, "user@gmail.com");
    const spy = vi.spyOn(oauth, "refreshAccessToken").mockResolvedValue({
      access_token: "new-token", expires_in: 3600, scope: "openid", token_type: "Bearer",
    });
    const tok = await getValidAccessToken(wsId, "google");
    expect2(spy).toHaveBeenCalledWith("refresh-1");
    expect2(tok).toBe("new-token");
    spy.mockRestore();
    await deleteConnection(wsId, "google");
  });
});
```

- [ ] **Step 2: Run — expect failure (store missing)**

```bash
pnpm test tests/integration/google-oauth.test.ts
```
Expected: FAIL — cannot resolve `@/lib/connectors/store`.

- [ ] **Step 3: Implement `src/lib/connectors/store.ts`**

```ts
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret, decryptSecret } from "@/lib/crypto/tokens";
import { refreshAccessToken } from "@/lib/connectors/google/oauth";
import type { ConnectionRecord, OAuthTokenResponse, Provider } from "@/lib/connectors/types";

const EXPIRY_BUFFER_MS = 60_000; // refresh if within 60s of expiry

function expiryFrom(expiresIn: number): string {
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

/** Upsert a Google connection for a workspace, encrypting token material. */
export async function saveGoogleConnection(
  workspaceId: string,
  tokens: OAuthTokenResponse,
  email: string | null,
): Promise<void> {
  const admin = createAdminClient();
  const accessEnc = encryptSecret(tokens.access_token);

  const row: Record<string, unknown> = {
    workspace_id: workspaceId,
    provider: "google" as Provider,
    google_email: email,
    scopes: tokens.scope ? tokens.scope.split(" ") : [],
    access_token_cipher: accessEnc.cipher,
    access_token_iv: accessEnc.iv,
    access_token_tag: accessEnc.tag,
    access_token_expires_at: expiryFrom(tokens.expires_in),
  };

  // Only overwrite the refresh token when Google returns a new one.
  if (tokens.refresh_token) {
    const refreshEnc = encryptSecret(tokens.refresh_token);
    row.refresh_token_cipher = refreshEnc.cipher;
    row.refresh_token_iv = refreshEnc.iv;
    row.refresh_token_tag = refreshEnc.tag;
  }

  const { error } = await admin.from("connections").upsert(row, { onConflict: "workspace_id,provider" });
  if (error) throw new Error(`saveGoogleConnection failed: ${error.message}`);
}

export async function getConnection(
  workspaceId: string,
  provider: Provider,
): Promise<ConnectionRecord | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("connections")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("provider", provider)
    .maybeSingle();
  return (data as ConnectionRecord | null) ?? null;
}

export async function deleteConnection(workspaceId: string, provider: Provider): Promise<void> {
  const admin = createAdminClient();
  await admin.from("connections").delete().eq("workspace_id", workspaceId).eq("provider", provider);
}

/**
 * Returns a usable access token, refreshing transparently if expired.
 * Throws if there is no connection or no refresh token available when one is needed.
 */
export async function getValidAccessToken(workspaceId: string, provider: Provider): Promise<string> {
  const conn = await getConnection(workspaceId, provider);
  if (!conn) throw new Error(`no ${provider} connection for workspace ${workspaceId}`);

  const expiresAt = new Date(conn.access_token_expires_at).getTime();
  if (Date.now() < expiresAt - EXPIRY_BUFFER_MS) {
    return decryptSecret({
      cipher: conn.access_token_cipher,
      iv: conn.access_token_iv,
      tag: conn.access_token_tag,
    });
  }

  // Expired (or near it) — refresh.
  if (!conn.refresh_token_cipher || !conn.refresh_token_iv || !conn.refresh_token_tag) {
    throw new Error(`${provider} access token expired and no refresh token stored`);
  }
  const refreshToken = decryptSecret({
    cipher: conn.refresh_token_cipher,
    iv: conn.refresh_token_iv,
    tag: conn.refresh_token_tag,
  });
  const refreshed = await refreshAccessToken(refreshToken);
  await saveGoogleConnection(workspaceId, { ...refreshed, refresh_token: undefined }, conn.google_email);
  return refreshed.access_token;
}
```

- [ ] **Step 4: Run the test — expect pass**

```bash
pnpm test tests/integration/google-oauth.test.ts
```
Expected: all passed (url builder + 2 store tests). Note the `vi.spyOn` on the `oauth` module — Vitest can spy on ESM exports because the store imports the named function from the module; if the spy fails to intercept, change the store import to `import * as googleOAuth from "@/lib/connectors/google/oauth"` and call `googleOAuth.refreshAccessToken(...)`, which makes the binding interceptable.

- [ ] **Step 5: Commit**

```bash
git add src/lib/connectors/store.ts tests/integration/google-oauth.test.ts
git commit -m "feat(connectors): connection store with refresh-on-expiry"
```

---

## Task 8: OAuth start route

**Files:**
- Create: `src/app/api/connections/google/start/route.ts`

- [ ] **Step 1: Implement the start route**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { buildAuthUrl } from "@/lib/connectors/google/oauth";
import { serverEnv } from "@/lib/config/env";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login?next=/settings/connections", req.url));
  }

  // Resolve the user's workspace (single-workspace model in V1).
  const { data: ws } = await supabase
    .from("workspaces")
    .select("id, owner_id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!ws) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  const state = randomBytes(16).toString("hex");
  const redirectUri = `${serverEnv.NEXT_PUBLIC_APP_URL}/api/connections/google/callback`;
  const authUrl = buildAuthUrl({ state, redirectUri });

  const res = NextResponse.redirect(authUrl);
  // CSRF protection: bind state + workspace to httpOnly cookies, verified on callback.
  const cookieOpts = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: 600 };
  res.cookies.set("g_oauth_state", state, cookieOpts);
  res.cookies.set("g_oauth_ws", ws.id, cookieOpts);
  return res;
}
```

- [ ] **Step 2: Typecheck + lint**

```bash
pnpm tsc --noEmit && pnpm lint
```
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/connections/google/start/route.ts
git commit -m "feat(connectors): google oauth start route with CSRF state cookie"
```

---

## Task 9: OAuth callback route

**Files:**
- Create: `src/app/api/connections/google/callback/route.ts`

- [ ] **Step 1: Implement the callback route**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeCodeForTokens, fetchGoogleEmail } from "@/lib/connectors/google/oauth";
import { saveGoogleConnection } from "@/lib/connectors/store";
import { serverEnv } from "@/lib/config/env";

export const runtime = "nodejs";

function back(req: NextRequest, status: string) {
  return NextResponse.redirect(new URL(`/settings/connections?google=${status}`, req.url));
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) return back(req, "denied");
  if (!code || !state) return back(req, "invalid");

  // Verify CSRF state + recover workspace id from cookies.
  const cookieState = req.cookies.get("g_oauth_state")?.value;
  const workspaceId = req.cookies.get("g_oauth_ws")?.value;
  if (!cookieState || cookieState !== state || !workspaceId) {
    return back(req, "state_mismatch");
  }

  // Confirm the caller is still authenticated and owns this workspace.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const { data: ws } = await supabase
    .from("workspaces")
    .select("id, owner_id")
    .eq("id", workspaceId)
    .single();
  if (!ws || ws.owner_id !== user.id) return back(req, "forbidden");

  try {
    const redirectUri = `${serverEnv.NEXT_PUBLIC_APP_URL}/api/connections/google/callback`;
    const tokens = await exchangeCodeForTokens({ code, redirectUri });
    const email = await fetchGoogleEmail(tokens.access_token);
    await saveGoogleConnection(workspaceId, tokens, email);
  } catch {
    return back(req, "exchange_failed");
  }

  const res = back(req, "connected");
  res.cookies.delete("g_oauth_state");
  res.cookies.delete("g_oauth_ws");
  return res;
}
```

- [ ] **Step 2: Verify the proxy allows the callback through**

Open `src/proxy.ts` and confirm the `config.matcher` does not block `/api/connections/...`. The matcher excludes static assets and `api/stripe/webhook`. API routes are not in the `isAppRoute` redirect list, so authenticated users pass through and the route self-checks auth. No change needed — but verify by reading the file.

- [ ] **Step 3: Typecheck + lint**

```bash
pnpm tsc --noEmit && pnpm lint
```
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/connections/google/callback/route.ts
git commit -m "feat(connectors): google oauth callback — verify state, store tokens"
```

---

## Task 10: Disconnect route

**Files:**
- Create: `src/app/api/connections/google/disconnect/route.ts`

- [ ] **Step 1: Implement the disconnect route**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getConnection, deleteConnection } from "@/lib/connectors/store";
import { decryptSecret } from "@/lib/crypto/tokens";
import { revokeToken } from "@/lib/connectors/google/oauth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { data: ws } = await supabase
    .from("workspaces")
    .select("id, owner_id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!ws || ws.owner_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Best-effort revoke at Google before deleting locally.
  const conn = await getConnection(ws.id, "google");
  if (conn) {
    try {
      const access = decryptSecret({
        cipher: conn.access_token_cipher,
        iv: conn.access_token_iv,
        tag: conn.access_token_tag,
      });
      await revokeToken(access);
    } catch {
      // ignore revoke failure; we still delete the local record
    }
    await deleteConnection(ws.id, "google");
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Typecheck + lint**

```bash
pnpm tsc --noEmit && pnpm lint
```
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/connections/google/disconnect/route.ts
git commit -m "feat(connectors): google disconnect — revoke at Google + delete row"
```

---

## Task 11: Connection status helper

**Files:**
- Create: `src/lib/connectors/status.ts`

- [ ] **Step 1: Implement the status helper**

```ts
import { getConnection } from "@/lib/connectors/store";
import type { ConnectionStatus, Provider } from "@/lib/connectors/types";

/** Server-side: resolve a connection's status for UI display (no token material returned). */
export async function getConnectionStatus(
  workspaceId: string,
  provider: Provider,
): Promise<ConnectionStatus> {
  const conn = await getConnection(workspaceId, provider);
  if (!conn) return { state: "disconnected" };
  return { state: "connected", email: conn.google_email, scopes: conn.scopes };
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/connectors/status.ts
git commit -m "feat(connectors): connection status helper for UI"
```

---

## Task 12: Connect / disconnect UI components

**Files:**
- Create: `src/components/connections/connect-button.tsx`, `src/components/connections/disconnect-button.tsx`

- [ ] **Step 1: Connect button (client component, links to start route)**

`src/components/connections/connect-button.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";

export function ConnectGoogleButton() {
  return (
    <Button onClick={() => (window.location.href = "/api/connections/google/start")}>
      Connect Google
    </Button>
  );
}
```

- [ ] **Step 2: Disconnect button (client component, POSTs then refreshes)**

`src/components/connections/disconnect-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function DisconnectGoogleButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function disconnect() {
    setLoading(true);
    await fetch("/api/connections/google/disconnect", { method: "POST" });
    setLoading(false);
    router.refresh();
  }

  return (
    <Button variant="outline" onClick={disconnect} disabled={loading}>
      {loading ? "Disconnecting…" : "Disconnect"}
    </Button>
  );
}
```

- [ ] **Step 3: Typecheck + lint**

```bash
pnpm tsc --noEmit && pnpm lint
```
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/connections
git commit -m "feat(connectors): connect/disconnect UI buttons"
```

---

## Task 13: Connections settings page

**Files:**
- Create: `src/app/(app)/settings/connections/page.tsx`

- [ ] **Step 1: Build the page**

```tsx
import { redirect } from "next/navigation";
import { getCurrentWorkspace } from "@/lib/workspace/get";
import { getConnectionStatus } from "@/lib/connectors/status";
import { ConnectGoogleButton } from "@/components/connections/connect-button";
import { DisconnectGoogleButton } from "@/components/connections/disconnect-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>;
}) {
  const ws = await getCurrentWorkspace();
  if (!ws) redirect("/onboarding");

  const status = await getConnectionStatus(ws.id, "google");
  const { google: googleResult } = await searchParams;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Connections</h1>

      {googleResult && googleResult !== "connected" && (
        <p className="text-destructive text-sm">
          Google connection failed ({googleResult}). Please try again.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Google</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground text-sm">
            Search Console, Business Profile, and Gmail send. One sign-in covers all three.
          </p>
          {status.state === "connected" ? (
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm">
                Connected{status.email ? ` as ${status.email}` : ""}
              </span>
              <DisconnectGoogleButton />
            </div>
          ) : (
            <ConnectGoogleButton />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

```bash
pnpm tsc --noEmit && pnpm lint
```
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/settings/connections/page.tsx"
git commit -m "feat(connectors): connections settings page"
```

---

## Task 14: E2E gate test + manual OAuth smoke

**Files:**
- Create: `tests/e2e/connections-page.spec.ts`

- [ ] **Step 1: Write the E2E auth-gate test**

`tests/e2e/connections-page.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("connections page is auth-gated", async ({ page }) => {
  await page.goto("/settings/connections");
  await expect(page).toHaveURL(/\/login(\?.*)?$/);
});
```

- [ ] **Step 2: Run it**

```bash
pnpm e2e tests/e2e/connections-page.spec.ts
```
Expected: PASS (redirects to /login because the proxy gates `/settings`).

- [ ] **Step 3: Manual OAuth smoke (local, USER + agent)**

Ensure `.env.local` has the Google creds + encryption key. Start dev:

```bash
pnpm dev
```

In a browser logged into a Hireling account (sign up if needed) whose Google test-user email was added in Task 1:
1. Go to http://localhost:3000/settings/connections
2. Click "Connect Google"
3. Complete Google consent (you'll see the unverified-app warning — expected in Testing mode; click "Continue")
4. Land back on `/settings/connections?google=connected` showing "Connected as <email>"

Verify the token row exists and is encrypted (no plaintext):

```bash
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')" \
  -c "select provider, google_email, scopes, length(access_token_cipher) as cipher_len, access_token_expires_at from public.connections;"
```
Expected: one row, `google_email` set, `scopes` lists the 3+2 scopes, `cipher_len` > 0.

5. Click "Disconnect" → row disappears; re-query returns 0 rows.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/connections-page.spec.ts
git commit -m "test(connectors): connections page auth-gate e2e"
```

---

## Task 15: Deploy — add env vars to Vercel + production OAuth smoke

**Files:** none (configuration + deploy)

- [ ] **Step 1: Add the 3 new env vars to Vercel (all environments)**

The production app URL is `https://seomaster-mocha.vercel.app`. Use the same Google Client ID/Secret (the OAuth client already lists the prod redirect URI from Task 1 Step 4) and the SAME `CONNECTION_ENCRYPTION_KEY` as local (so tokens encrypted anywhere can be decrypted everywhere).

```bash
cd /Users/stevensmith/Documents/SEO
set -a; source .env.local; set +a
setenv () {
  local name="$1" val="$2"
  for e in production preview development; do
    pnpm dlx vercel env rm "$name" "$e" --yes >/dev/null 2>&1
    printf '%s' "$val" | pnpm dlx vercel env add "$name" "$e" >/dev/null 2>&1
  done
  echo "  set $name"
}
setenv GOOGLE_CLIENT_ID "$GOOGLE_CLIENT_ID"
setenv GOOGLE_CLIENT_SECRET "$GOOGLE_CLIENT_SECRET"
setenv CONNECTION_ENCRYPTION_KEY "$CONNECTION_ENCRYPTION_KEY"
```

- [ ] **Step 2: Push migrations to production Supabase**

```bash
supabase db push
```
Expected: applies the `connections` migration to the remote project (`ufxqgaucskiraczhnldh`). Confirm with `supabase migration list` (Local and Remote columns match).

- [ ] **Step 3: Merge to main and deploy**

```bash
git checkout main
git merge --no-ff feat/plan-1-2-google-oauth -m "Plan 1.2 — Connector framework + Google OAuth"
git push origin main
```

The push triggers Vercel's git auto-deploy on `seomaster`. Wait for it, or deploy explicitly:

```bash
pnpm dlx vercel --prod --yes
```

- [ ] **Step 4: Production OAuth smoke**

1. Visit `https://seomaster-mocha.vercel.app/settings/connections` (log in first).
2. Connect Google with the test-user account → confirm "Connected as <email>".
3. Verify the row landed in prod:
   ```bash
   PGURL="postgresql://postgres.ufxqgaucskiraczhnldh:[DB_PASSWORD]@aws-0-[region].pooler.supabase.com:5432/postgres"
   # Or read connection rows via the Supabase dashboard SQL editor:
   #   select provider, google_email, scopes, access_token_expires_at from public.connections;
   ```
   (Use the Supabase dashboard SQL editor if the pooler URL/password isn't handy — simpler than reconstructing the connection string.)
4. Disconnect → row removed.

- [ ] **Step 5: Tag**

```bash
git tag -a v0.2.0-google-connector -m "Plan 1.2 — Google OAuth connector shipped"
git push origin v0.2.0-google-connector
```

---

## Done

When all tasks are checked, Plan 1.2 is complete. Next plan (1.3 — Shopify connector, or the GSC data-pull that consumes `getValidAccessToken`) builds on:
- `getValidAccessToken(workspaceId, "google")` — the single entry point for authenticated Google API calls
- The `connections` table + `connection_provider` enum (extend the enum for `shopify`, `wordpress`)
- The OAuth start/callback route pattern (reuse for other providers)

## Self-Review Notes

**Spec coverage (design doc §5 Connectors, §8 token encryption):**
- ✅ Single Google OAuth covering GSC + GBP + Gmail — Tasks 1, 6 (scopes), 8/9 (flow)
- ✅ Tokens encrypted at rest — Tasks 3 (AES-256-GCM), 4 (cipher columns), 7 (encrypt on save)
- ✅ Token refresh — Task 7 (`getValidAccessToken`)
- ✅ Multi-tenant isolation — Task 4 (RLS member-read, service-role-write) with proof test
- ✅ Connection status UI + connect/disconnect — Tasks 11, 12, 13
- ✅ Production deploy — Task 15
- ⏭️ Google production verification / CASA assessment — explicitly deferred (Testing mode), noted in plan header. Correct per user decision.
- ⏭️ Shopify / WordPress connectors — out of scope (later plans). Correct.

**Placeholder scan:** No "TBD"/"TODO"/"handle errors appropriately". One bracketed `[DB_PASSWORD]`/`[region]` in Task 15 Step 4 is an intentional user-supplied value with a documented dashboard alternative — not a code placeholder. All code steps contain complete code.

**Type consistency:**
- `OAuthTokenResponse`, `ConnectionRecord`, `ConnectionStatus`, `Provider` defined in Task 5, used consistently in Tasks 6/7/11.
- `EncryptedSecret` shape `{cipher, iv, tag}` (Task 3) matches the column names `access_token_{cipher,iv,tag}` (Task 4) and the object passed to `decryptSecret` in Tasks 7/10. ✓
- `saveGoogleConnection(workspaceId, tokens, email)` signature consistent across Tasks 7 (def), 9 (callback), 7-internal (refresh re-save). ✓
- `getValidAccessToken(workspaceId, provider)` / `getConnection` / `deleteConnection` signatures consistent across Tasks 7, 10, 11. ✓
- Cookie names `g_oauth_state` / `g_oauth_ws` consistent across Tasks 8 (set) and 9 (read/verify/delete). ✓
- Scope constant `GOOGLE_SCOPE_LIST` defined Task 6, consumed by `buildAuthUrl` same task. ✓

No issues found.
