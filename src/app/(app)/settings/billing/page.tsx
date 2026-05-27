import { redirect } from "next/navigation";
import { getCurrentWorkspace } from "@/lib/workspace/get";
import { CheckoutButton } from "@/components/billing/checkout-button";
import { TIERS, TIER_DISPLAY } from "@/lib/stripe/products";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function BillingPage() {
  const ws = await getCurrentWorkspace();
  if (!ws) redirect("/onboarding");

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Billing</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        {TIERS.map((tier) => (
          <Card key={tier}>
            <CardHeader>
              <CardTitle>{TIER_DISPLAY[tier].name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-2xl">
                ${TIER_DISPLAY[tier].priceUsdPerMo}
                <span className="text-muted-foreground text-sm">/mo</span>
              </p>
              <CheckoutButton tier={tier} workspaceId={ws.id}>
                Start 14-day trial
              </CheckoutButton>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
