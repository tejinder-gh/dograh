'use client';

import {
  Calculator,
  Calendar,
  Layers,
  ShieldCheck,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import React from 'react';

import { Badge } from '@/components/ui/badge';

const features = [
  {
    icon: Zap,
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    title: 'Sub-Second Voice Pipeline',
    description:
      'Engineered with Pipecat WebRTC and native SIP trunking. Supports real-time human speech interruption, ultra-low-latency neural TTS streaming, and noise cancellation.',
  },
  {
    icon: Users,
    color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    title: 'Autonomous CRM Lead Engine',
    description:
      'Bi-directional contact qualification with automated CRM syncing. Classifies lifecycle status from Inbound/Outbound Call into Qualified Lead with recorded sentiment.',
  },
  {
    icon: Calendar,
    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    title: 'Intelligent Calendar Booking',
    description:
      'Autonomous scheduling agent negotiates appointment times with callers, validates availability, and writes confirmed bookings directly to your business calendar.',
  },
  {
    icon: Calculator,
    color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    title: 'Unified Metric Registry',
    description:
      'Production-grade mathematical engine with zero-denominator safe handlers. Never outputs misleading 0% or NaN—returns honest, auditable telemetry.',
  },
  {
    icon: ShieldCheck,
    color: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    title: 'Cryptographic Multi-Tenancy',
    description:
      'Request-bound HMAC-SHA256 assertions with path, method, and payload hash verification. Guarantees zero cross-tenant data leakage across all layers.',
  },
  {
    icon: TrendingUp,
    color: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    title: 'Unit Economics & Fleet Margins',
    description:
      'Automated reconciliation of LLM tokens, TTS audio synthesis, and carrier telephony minutes. Tracks true cost-per-call and gross profit margins.',
  },
] as const;

export function FeaturesGrid() {
  return (
    <section id="features" className="py-24 border-t border-border/40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <Badge
            variant="outline"
            className="border-indigo-500/30 bg-indigo-500/10 text-indigo-400 mb-3 px-3 py-1 font-medium inline-flex items-center gap-1.5"
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Core Architecture</span>
          </Badge>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-foreground">
            Engineered for High-Concurrency Fleet Scale
          </h2>
          <p className="mt-4 text-base sm:text-lg text-muted-foreground leading-relaxed">
            A comprehensive voice architecture spanning bare-metal audio streaming to bidirectional CRM synchronization and real-time margin tracking.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, idx) => {
            const Icon = f.icon;
            return (
              <div
                key={idx}
                className="group relative rounded-2xl border border-border/70 bg-card/40 p-7 backdrop-blur-xl transition-all duration-300 hover:border-indigo-500/50 hover:bg-card/70 hover:shadow-xl hover:-translate-y-0.5"
              >
                <div className={`inline-flex p-3 rounded-xl border ${f.color} mb-5 shadow-xs`}>
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2 group-hover:text-indigo-400 transition-colors">
                  {f.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {f.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
