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
