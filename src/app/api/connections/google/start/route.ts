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
