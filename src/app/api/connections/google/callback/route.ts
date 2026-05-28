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
