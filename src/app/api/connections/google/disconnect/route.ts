import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getConnection, deleteConnection } from "@/lib/connectors/store";
import { decryptSecret } from "@/lib/crypto/tokens";
import { revokeToken } from "@/lib/connectors/google/oauth";

export const runtime = "nodejs";

export async function POST() {
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
