import { describe, expect,it } from "vitest";

import { branding } from "./branding";

describe("Branding Configuration", () => {
  it("defines centralized AI Calling Agent OS product details", () => {
    expect(branding.productName).toBe("AI Calling Agent OS");
    expect(branding.productShortName).toBe("AI Calling");
    expect(branding.productDescription).toContain("AI-powered business calling");
  });

  it("disables upstream SaaS badges and community upsells by default", () => {
    expect(branding.features.showCommunityBadge).toBe(false);
    expect(branding.features.showSaaSUpsells).toBe(false);
    expect(branding.features.showEventBanner).toBe(false);
  });

  it("provides valid documentation link", () => {
    expect(branding.links.docsUrl).toBe("/docs");
  });
});
