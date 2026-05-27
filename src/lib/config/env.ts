import { z } from "zod";

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // Stripe
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1),
  // Stripe price IDs (per tier)
  STRIPE_PRICE_SOLO: z.string().min(1),
  STRIPE_PRICE_BUSINESS: z.string().min(1),
  STRIPE_PRICE_SCALE: z.string().min(1),
  // Sentry (optional in dev)
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().or(z.literal("")).optional(),
  // App
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

const clientSchema = serverSchema.pick({
  NEXT_PUBLIC_SUPABASE_URL: true,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: true,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: true,
  NEXT_PUBLIC_SENTRY_DSN: true,
  NEXT_PUBLIC_APP_URL: true,
});

type ServerEnv = z.infer<typeof serverSchema>;
type ClientEnv = z.infer<typeof clientSchema>;

function parseServer(): ServerEnv {
  const result = serverSchema.safeParse(process.env);
  if (!result.success) {
    console.error("❌ Invalid environment:", result.error.flatten().fieldErrors);
    throw new Error("Invalid environment configuration");
  }
  return result.data;
}

function parseClient(): ClientEnv {
  const result = clientSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
  if (!result.success) {
    throw new Error("Invalid client environment");
  }
  return result.data;
}

// Lazy: importing in client code doesn't try to read server-only vars.
export const serverEnv = (typeof window === "undefined" ? parseServer() : null) as ServerEnv;
export const clientEnv = parseClient();
