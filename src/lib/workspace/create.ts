"use server";

import { createClient } from "@/lib/supabase/server";

export async function createWorkspace(name: string) {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) throw new Error("Unauthenticated");

  const { data, error } = await supabase
    .from("workspaces")
    .insert({ name, owner_id: user.id })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("Insert failed");
  return data.id as string;
}
