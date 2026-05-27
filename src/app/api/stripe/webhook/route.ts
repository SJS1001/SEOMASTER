import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe/server";
import { TIERS, type Tier } from "@/lib/stripe/products";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/config/env";

export const runtime = "nodejs";

const RELEVANT_EVENTS = new Set<Stripe.Event["type"]>([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.trial_will_end",
]);

const KNOWN_STATUSES = new Set<string>([
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "incomplete",
  "incomplete_expired",
]);
type KnownStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired";

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  if (!sig) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, serverEnv.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return NextResponse.json(
      { error: `signature error: ${(err as Error).message}` },
      { status: 400 },
    );
  }

  if (!RELEVANT_EVENTS.has(event.type)) {
    return NextResponse.json({ received: true });
  }

  const sub = event.data.object as Stripe.Subscription;
  const workspaceId = sub.metadata?.workspace_id;
  if (!workspaceId) {
    return NextResponse.json({ received: true, skipped: "no workspace_id" });
  }

  const rawTier = sub.metadata?.tier;
  const tier: Tier | null =
    rawTier && (TIERS as readonly string[]).includes(rawTier) ? (rawTier as Tier) : null;

  if (!KNOWN_STATUSES.has(sub.status)) {
    console.warn("[stripe webhook] unknown subscription status, skipping", {
      eventId: event.id,
      status: sub.status,
    });
    return NextResponse.json({ received: true, skipped: `unknown status: ${sub.status}` });
  }
  const status = sub.status as KnownStatus;

  // current_period_end moved from Subscription to SubscriptionItem in Stripe API
  // version 2026-04-22.dahlia. See node_modules/stripe/esm/resources/SubscriptionItems.d.ts:50.
  const periodEndUnix = sub.items?.data?.[0]?.current_period_end ?? null;

  const admin = createAdminClient();
  const { error } = await admin.from("subscriptions").upsert({
    workspace_id: workspaceId,
    stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    stripe_subscription_id: sub.id,
    tier,
    status,
    current_period_end: periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null,
    trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
  });
  if (error) {
    // TODO(task-15): Sentry.captureException(error)
    console.error("[stripe webhook] db upsert failed", error);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
