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
