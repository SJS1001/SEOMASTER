import { redirect } from "next/navigation";
import { getCurrentWorkspace } from "@/lib/workspace/get";
import { getConnectionStatus } from "@/lib/connectors/status";
import { ConnectGoogleButton } from "@/components/connections/connect-button";
import { DisconnectGoogleButton } from "@/components/connections/disconnect-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>;
}) {
  const ws = await getCurrentWorkspace();
  if (!ws) redirect("/onboarding");

  const status = await getConnectionStatus(ws.id, "google");
  const { google: googleResult } = await searchParams;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Connections</h1>

      {googleResult && googleResult !== "connected" && (
        <p className="text-destructive text-sm">
          Google connection failed ({googleResult}). Please try again.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Google</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground text-sm">
            Search Console, Business Profile, and Gmail send. One sign-in covers all three.
          </p>
          {status.state === "connected" ? (
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm">
                Connected{status.email ? ` as ${status.email}` : ""}
              </span>
              <DisconnectGoogleButton />
            </div>
          ) : (
            <ConnectGoogleButton />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
