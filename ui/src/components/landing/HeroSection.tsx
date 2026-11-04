'use client';

import { Activity, ArrowRight, PhoneCall, Play, ShieldCheck, Zap } from 'lucide-react';
import Link from 'next/link';
import React from 'react';

import { Button } from '@/components/ui/button';

export function HeroSection() {
  return (
    <section className="relative overflow-hidden pt-16 pb-24 md:pt-24 md:pb-32">
      {/* Background ambient lighting and subtle radial spotlight */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-gradient-to-tr from-indigo-500/20 via-violet-500/15 to-transparent blur-3xl pointer-events-none rounded-full" />
      <div className="absolute top-1/3 right-10 w-[400px] h-[300px] bg-emerald-500/10 blur-3xl pointer-events-none rounded-full" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
        {/* Top Feature Pill */}
        <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-background/80 backdrop-blur-md px-4 py-1.5 text-xs font-medium text-foreground shadow-xs mb-8 hover:border-indigo-500/40 transition-all cursor-default">
          <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          <span className="text-muted-foreground font-mono tracking-wider text-[11px] font-semibold">
            PRODUCTION PLATFORM
          </span>
          <span className="text-border">|</span>
          <span className="text-indigo-400 font-medium">Sub-Second Conversational Voice AI</span>
        </div>

        {/* Main Headline */}
        <h1 className="mx-auto max-w-5xl text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight text-foreground leading-[1.12]">
          The Enterprise Operating System for{' '}
          <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400 bg-clip-text text-transparent">
            Autonomous Voice Agents
          </span>
        </h1>

        {/* Subtitle */}
        <p className="mx-auto mt-6 max-w-3xl text-base sm:text-lg md:text-xl text-muted-foreground leading-relaxed">
          Deploy conversational voice agents with sub-second turn latency, native SIP telephony, bi-directional CRM lead capture, autonomous appointment scheduling, and role-restricted mathematical intelligence dashboards.
        </p>

        {/* Action Buttons */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Button
            size="lg"
            asChild
            className="h-12 px-8 text-base font-semibold bg-gradient-to-r from-indigo-500 via-indigo-600 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white shadow-lg shadow-indigo-500/25 group transition-all"
          >
            <Link href="/auth/signup" className="flex items-center gap-2">
              <span>Start Free Deployment</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </Button>

          <Button
            size="lg"
            variant="outline"
            asChild
            className="h-12 px-6 text-base font-medium border-border/80 hover:bg-muted/60 backdrop-blur-sm"
          >
            <a href="#dashboards" className="flex items-center gap-2">
              <Play className="h-4 w-4 text-indigo-400 fill-indigo-400/20" />
              <span>Explore Live Dashboards</span>
            </a>
          </Button>
        </div>

        {/* Live Operational Metrics Ticker */}
        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
          <div className="rounded-2xl border border-border/70 bg-card/40 backdrop-blur-xl p-5 text-left transition-all hover:border-indigo-500/40 hover:shadow-lg">
            <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold mb-1 uppercase tracking-wider">
              <Zap className="h-3.5 w-3.5" />
              <span>P95 Turn Latency</span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground font-mono">&lt; 850 ms</div>
            <p className="text-xs text-muted-foreground mt-1">Real-time voice interruption</p>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/40 backdrop-blur-xl p-5 text-left transition-all hover:border-emerald-500/40 hover:shadow-lg">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold mb-1 uppercase tracking-wider">
              <PhoneCall className="h-3.5 w-3.5" />
              <span>Carrier Uptime</span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground font-mono">99.98%</div>
            <p className="text-xs text-muted-foreground mt-1">SIP trunking & WebRTC</p>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/40 backdrop-blur-xl p-5 text-left transition-all hover:border-cyan-500/40 hover:shadow-lg">
            <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold mb-1 uppercase tracking-wider">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Tenant Isolation</span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground font-mono">100% Strict</div>
            <p className="text-xs text-muted-foreground mt-1">HMAC-SHA256 bound assertions</p>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/40 backdrop-blur-xl p-5 text-left transition-all hover:border-violet-500/40 hover:shadow-lg">
            <div className="flex items-center gap-2 text-violet-400 text-xs font-semibold mb-1 uppercase tracking-wider">
              <Activity className="h-3.5 w-3.5" />
              <span>Autonomous ROI</span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground font-mono">84% Lower</div>
            <p className="text-xs text-muted-foreground mt-1">Versus human staff overhead</p>
          </div>
        </div>
      </div>
    </section>
  );
}
