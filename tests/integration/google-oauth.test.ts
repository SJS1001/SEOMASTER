import { describe, it, expect } from "vitest";
import { buildAuthUrl } from "@/lib/connectors/google/oauth";

describe("google oauth url builder", () => {
  it("includes required params, offline access, and all scopes", () => {
    const url = new URL(buildAuthUrl({ state: "abc123", redirectUri: "http://localhost:3000/api/connections/google/callback" }));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBe("abc123");
    expect(url.searchParams.get("include_granted_scopes")).toBe("true");
    const scope = url.searchParams.get("scope") ?? "";
    expect(scope).toContain("webmasters.readonly");
    expect(scope).toContain("business.manage");
    expect(scope).toContain("gmail.send");
  });
});
