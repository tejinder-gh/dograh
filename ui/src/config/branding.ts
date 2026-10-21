/**
 * Centralized branding configuration for AI Calling Agent OS.
 * Update these values to customize the application branding without modifying multiple UI files.
 */

export interface BrandingConfig {
  readonly productName: string;
  readonly productShortName: string;
  readonly productDescription: string;
  readonly logo: {
    readonly lightUrl: string;
    readonly darkUrl: string;
    readonly markUrl: string;
    readonly showTypographicLogo: boolean;
  };
  readonly links: {
    readonly supportUrl?: string;
    readonly docsUrl?: string;
    readonly privacyUrl?: string;
    readonly termsUrl?: string;
  };
  readonly features: {
    readonly showCommunityBadge: boolean;
    readonly showSaaSUpsells: boolean;
    readonly showEventBanner: boolean;
  };
}

export const branding: BrandingConfig = {
  productName: process.env.NEXT_PUBLIC_PRODUCT_NAME || "AI Calling Agent OS",
  productShortName: process.env.NEXT_PUBLIC_PRODUCT_SHORT_NAME || "AI Calling",
  productDescription:
    process.env.NEXT_PUBLIC_PRODUCT_DESCRIPTION ||
    "AI-powered business calling and automation platform",
  logo: {
    lightUrl: "/dograh-logo.png",
    darkUrl: "/dograh-logo-inverse.png",
    markUrl: "/dograh-mark.png",
    // When true, renders a clean, accessible typographic badge alongside/in place of the image
    showTypographicLogo: true,
  },
  links: {
    supportUrl: process.env.NEXT_PUBLIC_SUPPORT_URL,
    docsUrl: process.env.NEXT_PUBLIC_DOCS_URL || "/docs",
  },
  features: {
    // Hide public Dograh SaaS community prompts and GitHub star badges on customer product UI
    showCommunityBadge: false,
    showSaaSUpsells: false,
    showEventBanner: false,
  },
};
