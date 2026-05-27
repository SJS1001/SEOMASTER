import { redirect } from "next/navigation";
import { getCurrentWorkspace } from "@/lib/workspace/get";
import { createWorkspace } from "@/lib/workspace/create";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function OnboardingPage() {
  const existing = await getCurrentWorkspace();
  if (existing) redirect("/dashboard");

  async function action(formData: FormData) {
    "use server";
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;
    await createWorkspace(name);
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader><CardTitle>Name your workspace</CardTitle></CardHeader>
        <CardContent>
          <form action={action} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Workspace name</Label>
              <Input id="name" name="name" required placeholder="e.g., Acme Co" />
            </div>
            <Button type="submit" className="w-full">Continue</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
