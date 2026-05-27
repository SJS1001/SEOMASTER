import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SignupForm } from "@/components/auth/signup-form";

export default function SignupPage() {
  return (
    <Card>
      <CardHeader><h1 className="font-heading text-base leading-snug font-medium">Sign up</h1></CardHeader>
      <CardContent><SignupForm /></CardContent>
    </Card>
  );
}
