import Stripe from "stripe";
import { serverEnv } from "@/lib/config/env";

export const stripe = new Stripe(serverEnv.STRIPE_SECRET_KEY, {
  apiVersion: "2026-04-22.dahlia",
  typescript: true,
});
