import { describe, it, expect } from "vitest";
import Stripe from "stripe";

const APP_URL = "http://localhost:3000";

describe("stripe webhook", () => {
  it("rejects requests with no signature", async () => {
    const res = await fetch(`${APP_URL}/api/stripe/webhook`, {
      method: "POST",
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  it("rejects requests with bad signature", async () => {
    const res = await fetch(`${APP_URL}/api/stripe/webhook`, {
      method: "POST",
      headers: { "stripe-signature": "t=1,v1=deadbeef" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  it("accepts a signed customer.subscription.created event", async () => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET!;
    const payload = JSON.stringify({
      id: "evt_test",
      object: "event",
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_test",
          customer: "cus_test_nobody",
          status: "incomplete",
          current_period_end: 0,
          items: { data: [] },
          metadata: {},
        },
      },
    });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    const res = await fetch(`${APP_URL}/api/stripe/webhook`, {
      method: "POST",
      headers: { "stripe-signature": header },
      body: payload,
    });
    // Handler accepts signature even if it no-ops on missing workspace_id metadata.
    expect([200, 202]).toContain(res.status);
  });
});
