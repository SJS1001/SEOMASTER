"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Tier } from "@/lib/stripe/products";

export function CheckoutButton({
  tier,
  workspaceId,
  children,
}: {
  tier: Tier;
  workspaceId: string;
  children: React.ReactNode;
}) {
  const [loading, setLoading] = useState(false);

  async function onClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tier, workspaceId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        alert(body.error ?? `Request failed (${res.status})`);
        return;
      }
      const { url } = (await res.json()) as { url?: string };
      if (!url) {
        alert("Missing checkout URL");
        return;
      }
      window.location.href = url;
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={onClick} disabled={loading}>
      {loading ? "Loading…" : children}
    </Button>
  );
}
