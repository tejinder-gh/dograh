'use client';

import Link from 'next/link';
import React from 'react';

import { BrandLogo } from '@/components/BrandLogo';
import { branding } from '@/config/branding';

export function LandingFooter() {
  return (
    <footer className="border-t border-border/40 bg-background/90 py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <BrandLogo />
            <span className="text-xs text-muted-foreground border-l border-border/60 pl-3 font-mono">
              AI Calling Agent OS
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-xs text-muted-foreground">
            <Link href="/auth/login" className="hover:text-foreground transition-colors">
              Client Portal
            </Link>
            <Link href="/auth/login" className="hover:text-foreground transition-colors">
              Platform Command Center
            </Link>
            <Link href="/auth/signup" className="hover:text-foreground transition-colors">
              Create Account
            </Link>
            <a
              href="https://github.com/Acuity-hq/Acuity"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              GitHub Open Source
            </a>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            <span>Voice Clusters Operational</span>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-border/30 flex flex-col sm:flex-row items-center justify-between text-[11px] text-muted-foreground gap-4">
          <p>&copy; {new Date().getFullYear()} {branding.productName}. All rights reserved. Enterprise Voice AI Infrastructure.</p>
          <div className="flex items-center gap-5">
            <span className="hover:text-foreground transition-colors cursor-pointer">Privacy Policy</span>
            <span className="hover:text-foreground transition-colors cursor-pointer">Terms of Service</span>
            <span className="hover:text-foreground transition-colors cursor-pointer">Security Whitepaper</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
