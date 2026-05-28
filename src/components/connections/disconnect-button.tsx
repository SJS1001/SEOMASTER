"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function DisconnectGoogleButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function disconnect() {
    setLoading(true);
    await fetch("/api/connections/google/disconnect", { method: "POST" });
    setLoading(false);
    router.refresh();
  }

  return (
    <Button variant="outline" onClick={disconnect} disabled={loading}>
      {loading ? "Disconnecting…" : "Disconnect"}
    </Button>
  );
}
