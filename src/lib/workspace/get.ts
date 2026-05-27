import { createClient } from "@/lib/supabase/server";

export async function getCurrentWorkspace() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("workspaces")
    .select("id, name, owner_id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data;
}
