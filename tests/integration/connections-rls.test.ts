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
