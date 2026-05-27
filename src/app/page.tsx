export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-4xl font-semibold">Hireling</h1>
      <p className="text-muted-foreground max-w-md text-center">
        Your SEO hireling. Audits, writing, GBP, and outreach — drafted weekly,
        approved by you.
      </p>
      <div className="flex gap-3">
        <a className="rounded-md border px-4 py-2" href="/login">
          Log in
        </a>
        <a className="bg-foreground text-background rounded-md px-4 py-2" href="/signup">
          Start free trial
        </a>
      </div>
    </main>
  );
}
