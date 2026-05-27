import type { ReactNode } from "react";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b px-6 py-3 text-sm font-medium">Hireling</header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
