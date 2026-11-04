'use client';

import React from 'react';

import { DashboardPreviewSection } from './DashboardPreviewSection';
import { EnterpriseTrustSection } from './EnterpriseTrustSection';
import { FeaturesGrid } from './FeaturesGrid';
import { HeroSection } from './HeroSection';
import { LandingFooter } from './LandingFooter';
import { LandingNav } from './LandingNav';
import { RoiCalculatorSection } from './RoiCalculatorSection';

export function LandingPageView() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-indigo-500/30 selection:text-indigo-200">
      <LandingNav />
      <main className="flex-1">
        <HeroSection />
        <DashboardPreviewSection />
        <FeaturesGrid />
        <RoiCalculatorSection />
        <EnterpriseTrustSection />
      </main>
      <LandingFooter />
    </div>
  );
}
