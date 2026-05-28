"use client";

import { Button } from "@/components/ui/button";

export function ConnectGoogleButton() {
  return (
    <Button onClick={() => (window.location.href = "/api/connections/google/start")}>
      Connect Google
    </Button>
  );
}
