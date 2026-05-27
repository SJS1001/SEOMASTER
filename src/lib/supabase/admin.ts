import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/config/env";

/**
 * Service-role client that bypasses RLS. Use only in trusted server contexts
 * (webhook handlers, scheduled jobs). NEVER import in a client component.
 */
export function createAdminClient() {
  return createClient(serverEnv.NEXT_PUBLIC_SUPABASE_URL, serverEnv.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
