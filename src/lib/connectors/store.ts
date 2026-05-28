import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret, decryptSecret } from "@/lib/crypto/tokens";
import * as googleOAuth from "@/lib/connectors/google/oauth";
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
  const refreshed = await googleOAuth.refreshAccessToken(refreshToken);
  await saveGoogleConnection(workspaceId, { ...refreshed, refresh_token: undefined }, conn.google_email);
  return refreshed.access_token;
}
