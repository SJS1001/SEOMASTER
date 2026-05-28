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

import { describe as describe2, it as it2, expect as expect2, vi, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { saveGoogleConnection, getValidAccessToken, deleteConnection } from "@/lib/connectors/store";
import * as oauth from "@/lib/connectors/google/oauth";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(SUPABASE_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

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
