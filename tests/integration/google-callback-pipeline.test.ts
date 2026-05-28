/**
 * Full OAuth callback pipeline test with Google's HTTP endpoints mocked.
 * Proves: exchangeCodeForTokens → fetchGoogleEmail → saveGoogleConnection
 * (real AES-256-GCM encryption + real local DB) → getConnection (ciphertext,
 * no plaintext) → getValidAccessToken (decrypts) → refresh-on-expiry.
 * The only thing NOT exercised here is Google's literal consent redirect,
 * which depends solely on a real client_id.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { exchangeCodeForTokens, fetchGoogleEmail } from "@/lib/connectors/google/oauth";
import { saveGoogleConnection, getConnection, getValidAccessToken, deleteConnection } from "@/lib/connectors/store";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(SUPABASE_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

function mockGoogle(opts: { access: string; refresh?: string; expiresIn: number; email: string }) {
  // Capture the real fetch so non-Google calls (e.g. Supabase REST) pass through.
  const realFetch = globalThis.fetch;
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.startsWith(TOKEN_ENDPOINT)) {
      return new Response(
        JSON.stringify({
          access_token: opts.access,
          ...(opts.refresh ? { refresh_token: opts.refresh } : {}),
          expires_in: opts.expiresIn,
          scope: "openid https://www.googleapis.com/auth/gmail.send",
          token_type: "Bearer",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.startsWith(USERINFO_ENDPOINT)) {
      return new Response(JSON.stringify({ email: opts.email }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    // Everything else (Supabase REST/auth) → real network.
    return realFetch(input, init);
  });
}

describe("google oauth callback pipeline (HTTP mocked, real crypto + DB)", () => {
  let wsId: string;

  beforeEach(async () => {
    await admin.from("connections").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await admin.from("workspaces").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    const { data: u } = await admin.auth.admin.createUser({
      email: `pipe+${Date.now()}@test.local`, password: "pw-123456", email_confirm: true,
    });
    const { data: ws } = await admin
      .from("workspaces").insert({ name: "Pipe Co", owner_id: u!.user!.id }).select("id").single();
    wsId = ws!.id;
  });

  afterEach(() => vi.unstubAllGlobals());

  it("exchanges code, stores ENCRYPTED tokens, and reads back a usable access token", async () => {
    vi.stubGlobal("fetch", mockGoogle({ access: "real-access-xyz", refresh: "real-refresh-abc", expiresIn: 3600, email: "owner@example.com" }));

    const tokens = await exchangeCodeForTokens({ code: "auth-code-123", redirectUri: "http://localhost:3000/api/connections/google/callback" });
    const email = await fetchGoogleEmail(tokens.access_token);
    await saveGoogleConnection(wsId, tokens, email);

    // The stored row must contain ciphertext, NOT the plaintext token.
    const conn = await getConnection(wsId, "google");
    expect(conn).not.toBeNull();
    expect(conn!.google_email).toBe("owner@example.com");
    expect(conn!.scopes).toContain("https://www.googleapis.com/auth/gmail.send");
    expect(conn!.access_token_cipher).not.toContain("real-access-xyz");
    expect(conn!.refresh_token_cipher).not.toBeNull();

    // Decryption path returns the original token.
    const usable = await getValidAccessToken(wsId, "google");
    expect(usable).toBe("real-access-xyz");
  });

  it("auto-refreshes an expired access token through the full path", async () => {
    // Store an already-expired token first.
    vi.stubGlobal("fetch", mockGoogle({ access: "stale", refresh: "real-refresh-abc", expiresIn: -10, email: "owner@example.com" }));
    const t1 = await exchangeCodeForTokens({ code: "c", redirectUri: "http://localhost:3000/api/connections/google/callback" });
    await saveGoogleConnection(wsId, t1, "owner@example.com");

    // Now the refresh call should hit the token endpoint and yield a fresh token.
    vi.stubGlobal("fetch", mockGoogle({ access: "fresh-access-999", expiresIn: 3600, email: "owner@example.com" }));
    const usable = await getValidAccessToken(wsId, "google");
    expect(usable).toBe("fresh-access-999");

    await deleteConnection(wsId, "google");
  });
});
