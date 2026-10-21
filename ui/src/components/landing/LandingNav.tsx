'use client';

import { ArrowRight, Menu, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import React, { useState } from 'react';

import { BrandLogo } from '@/components/BrandLogo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function LandingNav() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8 h-16">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2">
            <BrandLogo />
          </Link>
          <Badge
            variant="outline"
            className="hidden sm:inline-flex items-center gap-1.5 border-indigo-500/30 bg-indigo-500/10 text-indigo-400 text-xs px-2.5 py-0.5 font-medium"
          >
            <Sparkles className="h-3 w-3" />
            AI Calling Agent OS
          </Badge>
        </div>

        {/* Desktop Navigation Links */}
        <div className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
          <a href="#dashboards" className="transition-colors hover:text-foreground">
            Intelligence Dashboards
          </a>
          <a href="#features" className="transition-colors hover:text-foreground">
            Core Architecture
          </a>
          <a href="#roi-calculator" className="transition-colors hover:text-foreground">
            ROI Calculator
          </a>
          <a href="#enterprise" className="transition-colors hover:text-foreground">
            Enterprise Security
          </a>
        </div>

        {/* Action CTAs */}
        <div className="hidden sm:flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <Link href="/auth/login">Sign In</Link>
          </Button>
          <Button
            size="sm"
            asChild
            className="bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white shadow-sm font-semibold group transition-all"
          >
            <Link href="/auth/signup" className="flex items-center gap-1.5">
              <span>Get Started</span>
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
        </div>

        {/* Mobile menu button */}
        <div className="flex sm:hidden items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="sm:hidden border-b border-border/50 bg-background/95 px-4 pt-2 pb-6 space-y-3 backdrop-blur-xl">
          <a
            href="#dashboards"
            onClick={() => setMobileOpen(false)}
            className="block py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Intelligence Dashboards
          </a>
          <a
            href="#features"
            onClick={() => setMobileOpen(false)}
            className="block py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Core Architecture
          </a>
          <a
            href="#roi-calculator"
            onClick={() => setMobileOpen(false)}
            className="block py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            ROI Calculator
          </a>
          <a
            href="#enterprise"
            onClick={() => setMobileOpen(false)}
            className="block py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Enterprise Security
          </a>
          <div className="pt-2 flex flex-col gap-2">
            <Button variant="outline" asChild className="w-full justify-center">
              <Link href="/auth/login">Sign In</Link>
            </Button>
            <Button asChild className="w-full justify-center bg-gradient-to-r from-indigo-500 to-violet-600 text-white">
              <Link href="/auth/signup">Get Started Free</Link>
            </Button>
          </div>
        </div>
      )}
    </nav>
  );
}
