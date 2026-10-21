'use client';

import { ArrowRight, CheckCircle2, Sparkles, TrendingUp, Users, Zap } from 'lucide-react';
import Link from 'next/link';
import React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import type { RoiCalculationResult } from './roi-types';

interface RoiProjectionCardProps {
  calculation: RoiCalculationResult;
  callVolume: number;
}

export function RoiProjectionCard({ calculation, callVolume }: RoiProjectionCardProps) {
  const {
    staffHoursSaved,
    humanStaffCost,
    aiOperatingCost,
    netMonthlySavings,
    annualSavings,
    savingsPercent,
    equivalentFte,
    costPerHumanCall,
    costPerAiCall,
  } = calculation;

  // Proportional percentages for the comparative breakdown bar
  const totalBarCost = Math.max(1, humanStaffCost);
  const aiBarWidthPercent = Math.min(100, Math.max(4, (aiOperatingCost / totalBarCost) * 100));

  return (
    <div className="relative rounded-2xl border border-indigo-500/40 bg-gradient-to-b from-indigo-950/50 via-card/80 to-card p-6 sm:p-8 backdrop-blur-xl shadow-2xl overflow-hidden flex flex-col justify-between">
      {/* Ambient decorative glow */}
      <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      <div>
        {/* Header Pill */}
        <div className="flex items-center justify-between mb-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Economic Impact Model</span>
          </div>
          <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400 text-xs font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse mr-1.5" />
            Validated Model
          </Badge>
        </div>

        {/* Primary Savings Hero */}
        <div className="mt-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Net Monthly Operational Savings
          </div>
          <div className="text-4xl sm:text-5xl font-black text-foreground tracking-tight mt-1 flex items-baseline gap-2">
            <span>${netMonthlySavings.toLocaleString()}</span>
            <span className="text-sm font-normal text-muted-foreground">/ month</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold hover:bg-emerald-500/25">
              <TrendingUp className="h-3.5 w-3.5 mr-1" />
              {savingsPercent}% Direct Overhead Reduction
            </Badge>
            <span className="text-xs text-muted-foreground font-mono">
              ≈ ${(annualSavings).toLocaleString()} / yr run-rate
            </span>
          </div>
        </div>

        {/* Visual Comparative Cost Bar */}
        <div className="mt-6 pt-5 border-t border-border/50">
          <div className="flex justify-between items-center text-xs mb-2">
            <span className="text-muted-foreground font-medium">Cost Distribution Model</span>
            <span className="font-mono text-[11px] text-indigo-300">
              ${aiOperatingCost.toLocaleString()} AI vs ${humanStaffCost.toLocaleString()} Human
            </span>
          </div>

          <div className="h-3 w-full rounded-full bg-muted/60 overflow-hidden flex border border-border/60 p-0.5">
            <div
              style={{ width: `${aiBarWidthPercent}%` }}
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-400 transition-all duration-300"
              title={`Voice AI Operating Cost: $${aiOperatingCost.toLocaleString()}`}
            />
            <div
              style={{ width: `${100 - aiBarWidthPercent}%` }}
              className="h-full rounded-full bg-indigo-500/25 transition-all duration-300 ml-1"
              title={`Displaced Human Overhead: $${netMonthlySavings.toLocaleString()}`}
            />
          </div>

          <div className="flex justify-between text-[11px] text-muted-foreground mt-1.5">
            <span className="flex items-center gap-1 text-emerald-400 font-medium">
              <span className="h-2 w-2 rounded-full bg-emerald-400 inline-block" />
              AI Infra: ${(costPerAiCall).toFixed(2)} / call
            </span>
            <span className="flex items-center gap-1 text-muted-foreground font-medium">
              <span className="h-2 w-2 rounded-full bg-indigo-400/50 inline-block" />
              Manual: ${(costPerHumanCall).toFixed(2)} / call
            </span>
          </div>
        </div>

        {/* Operational Multipliers Grid */}
        <div className="mt-6 grid grid-cols-2 gap-3 pt-5 border-t border-border/50">
          <div className="p-3 rounded-xl border border-border/50 bg-background/50">
            <div className="text-[11px] text-muted-foreground flex items-center gap-1 font-medium">
              <Users className="h-3 w-3 text-cyan-400" />
              <span>Equivalent Capacity</span>
            </div>
            <div className="text-xl font-bold text-foreground mt-1 font-mono">
              {equivalentFte} <span className="text-xs font-normal text-muted-foreground">FTEs</span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              Reclaims {staffHoursSaved.toLocaleString()} hrs/mo
            </div>
          </div>

          <div className="p-3 rounded-xl border border-border/50 bg-background/50">
            <div className="text-[11px] text-muted-foreground flex items-center gap-1 font-medium">
              <Zap className="h-3 w-3 text-amber-400" />
              <span>Monthly Volume</span>
            </div>
            <div className="text-xl font-bold text-foreground mt-1 font-mono">
              {callVolume.toLocaleString()}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              Zero call queue abandonment
            </div>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="mt-8 pt-5 border-t border-border/50 space-y-3">
        <Button
          asChild
          size="lg"
          className="w-full bg-gradient-to-r from-indigo-500 via-indigo-600 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white font-semibold shadow-lg shadow-indigo-500/20 group h-12"
        >
          <Link href="/auth/signup" className="flex items-center justify-center gap-2">
            <span>Deploy Free Agent Fleet</span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </Button>

        <div className="flex items-center justify-center gap-4 text-[11px] text-muted-foreground text-center">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
            14-Day Free Trial
          </span>
          <span>•</span>
          <span>Sub-850ms Latency</span>
          <span>•</span>
          <span>Carrier-Ready</span>
        </div>
      </div>
    </div>
  );
}
