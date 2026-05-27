import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";
import { TIERS, TIER_PRICE_IDS } from "@/lib/stripe/products";
import { serverEnv } from "@/lib/config/env";

const BodySchema = z.object({
  tier: z.enum(TIERS),
  workspaceId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
  const { tier, workspaceId } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { data: ws } = await supabase
    .from("workspaces")
    .select("id, name, owner_id")
    .eq("id", workspaceId)
    .single();
  if (!ws || ws.owner_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: existingSub } = await admin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const isFirstCheckout = !existingSub;
  let customerId: string | undefined = existingSub?.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { workspace_id: workspaceId, user_id: user.id },
    });
    customerId = customer.id;
    await admin.from("subscriptions").upsert({
      workspace_id: workspaceId,
      stripe_customer_id: customerId,
      status: "incomplete",
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: TIER_PRICE_IDS[tier], quantity: 1 }],
    subscription_data: {
      ...(isFirstCheckout ? { trial_period_days: 14 } : {}),
      metadata: { workspace_id: workspaceId, tier },
    },
    success_url: `${serverEnv.NEXT_PUBLIC_APP_URL}/dashboard?checkout=success`,
    cancel_url: `${serverEnv.NEXT_PUBLIC_APP_URL}/settings/billing?checkout=cancel`,
  });

  return NextResponse.json({ url: session.url });
}
