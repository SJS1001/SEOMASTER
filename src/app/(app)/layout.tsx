import type { ReactNode } from "react";
import { WorkspaceSwitcher } from "@/components/workspace/switcher";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <span className="text-sm font-medium">Hireling</span>
        <WorkspaceSwitcher />
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
