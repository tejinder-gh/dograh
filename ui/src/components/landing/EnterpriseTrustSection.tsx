'use client';

import { CheckCircle2, Lock, Radio, Server, ShieldCheck } from 'lucide-react';
import React from 'react';

import { Badge } from '@/components/ui/badge';

const ECOSYSTEM_PROVIDERS = [
  'Twilio SIP Trunking',
  'Telnyx High-Concurrency',
  'Pipecat WebRTC Engine',
  'Anthropic Claude 3.7',
  'OpenAI GPT-4o Realtime',
  'Cartesia Sonic TTS',
  'ElevenLabs Turbo v2.5',
  'Deepgram Nova-2 STT',
  'PostgreSQL Neon Serverless',
  'Redis ARQ Task Pipeline',
] as const;

export function EnterpriseTrustSection() {
  return (
    <section id="enterprise" className="py-24 border-t border-border/40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <Badge
            variant="outline"
            className="border-indigo-500/30 bg-indigo-500/10 text-indigo-400 mb-3 px-3 py-1 font-medium inline-flex items-center gap-1.5"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Carrier-Grade & SOC-2 Ready</span>
          </Badge>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-foreground">
            Enterprise Security & Carrier Architecture
          </h2>
          <p className="mt-4 text-base sm:text-lg text-muted-foreground leading-relaxed">
            Engineered from bare-metal voice streaming up to cryptographic multi-tenant boundaries and automated compliance verification.
          </p>
        </div>

        {/* Security Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          <div className="p-7 rounded-2xl border border-border/70 bg-card/40 backdrop-blur-xl transition-all hover:border-indigo-500/40 hover:shadow-lg">
            <div className="inline-flex p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 mb-4">
              <Lock className="h-6 w-6" />
            </div>
            <h3 className="text-base font-bold text-foreground mb-2">Cryptographic Assertions</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Every internal request across proxy and domain microservices carries short-lived HMAC-SHA256 tokens binding user ID, tenant ID, request method, and body SHA-256 hash.
            </p>
          </div>

          <div className="p-7 rounded-2xl border border-border/70 bg-card/40 backdrop-blur-xl transition-all hover:border-cyan-500/40 hover:shadow-lg">
            <div className="inline-flex p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 mb-4">
              <Server className="h-6 w-6" />
            </div>
            <h3 className="text-base font-bold text-foreground mb-2">Database Layer Defense</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Strict least-privilege PostgreSQL roles. Runtime services operate under sandboxed schemas without schema modification permissions or cross-organization query capabilities.
            </p>
          </div>

          <div className="p-7 rounded-2xl border border-border/70 bg-card/40 backdrop-blur-xl transition-all hover:border-emerald-500/40 hover:shadow-lg">
            <div className="inline-flex p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-4">
              <Radio className="h-6 w-6" />
            </div>
            <h3 className="text-base font-bold text-foreground mb-2">Carrier Trunk Redundancy</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Automated multi-carrier failover across Twilio, Telnyx, Plivo, and native FreeSWITCH trunks. Preserves active session states on network fluctuations.
            </p>
          </div>
        </div>

        {/* Provider Ecosystem Badges */}
        <div className="rounded-2xl border border-border/70 bg-card/30 p-8 sm:p-10 text-center backdrop-blur-xl">
          <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-6">
            Supported Enterprise Model & Telephony Infrastructure
          </h4>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {ECOSYSTEM_PROVIDERS.map((name, i) => (
              <Badge
                key={i}
                variant="outline"
                className="border-border/80 bg-background/60 text-foreground/80 px-3.5 py-2 text-xs font-medium flex items-center gap-2 hover:border-indigo-500/30 transition-colors"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-indigo-400" />
                <span>{name}</span>
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
