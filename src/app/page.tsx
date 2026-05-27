import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-semibold tracking-tight">Hireling</h1>
      <p className="text-muted-foreground max-w-md text-center">
        Your SEO hireling. Audits, writing, GBP, and outreach — drafted weekly,
        approved by you.
      </p>
      <div className="flex gap-3">
        <Link href="/login" className={cn(buttonVariants({ variant: "outline" }))}>
          Log in
        </Link>
        <Link href="/signup" className={cn(buttonVariants({ variant: "default" }))}>
          Start free trial
        </Link>
      </div>
    </main>
  );
}
