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
