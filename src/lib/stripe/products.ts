import { serverEnv } from "@/lib/config/env";

export const TIERS = ["solo", "business", "scale"] as const;
export type Tier = (typeof TIERS)[number];

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
