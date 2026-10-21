import { describe, expect,it } from "vitest";

import { branding } from "./branding";

describe("Branding Configuration", () => {
  it("defines centralized Acuity product details", () => {
    expect(branding.productName).toBe("Acuity");
    expect(branding.productShortName).toBe("Acuity");
    expect(branding.productDescription).toContain("Acuity Voice AI Platform");
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
