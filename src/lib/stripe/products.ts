import { serverEnv } from "@/lib/config/env";

export type Tier = "solo" | "business" | "scale";

export const TIER_PRICE_IDS: Record<Tier, string> = {
  solo: serverEnv.STRIPE_PRICE_SOLO,
  business: serverEnv.STRIPE_PRICE_BUSINESS,
  scale: serverEnv.STRIPE_PRICE_SCALE,
};

export const TIER_DISPLAY: Record<Tier, { name: string; priceUsdPerMo: number }> = {
  solo: { name: "Solo", priceUsdPerMo: 149 },
  business: { name: "Business", priceUsdPerMo: 349 },
  scale: { name: "Scale", priceUsdPerMo: 749 },
};
