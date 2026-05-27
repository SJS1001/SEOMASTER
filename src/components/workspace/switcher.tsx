import { createClient } from "@/lib/supabase/server";

export async function WorkspaceSwitcher() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: workspaces } = await supabase
    .from("workspaces")
    .select("id, name")
    .order("created_at", { ascending: true });

  if (!workspaces || workspaces.length === 0) return null;

  return (
    <div className="text-muted-foreground text-xs">
      Workspace: <span className="text-foreground font-medium">{workspaces[0].name}</span>
      {workspaces.length > 1 && <span> (+{workspaces.length - 1} more)</span>}
    </div>
  );
}
