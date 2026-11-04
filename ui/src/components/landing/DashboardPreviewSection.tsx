'use client';

import {
  ArrowUpRight,
  BarChart3,
  CalendarCheck,
  Clock,
  DollarSign,
  Lock,
  PhoneCall,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import React, { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function DashboardPreviewSection() {
  const [activeTab, setActiveTab] = useState<'client' | 'admin'>('client');

  return (
    <section id="dashboards" className="relative py-24 border-t border-border/40 bg-card/20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <Badge
            variant="outline"
            className="border-indigo-500/30 bg-indigo-500/10 text-indigo-400 mb-3 px-3 py-1 font-medium inline-flex items-center gap-1.5"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Twin Intelligence Cockpits</span>
          </Badge>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-foreground">
            Role-Restricted Telemetry & Analytics
          </h2>
          <p className="mt-4 text-base sm:text-lg text-muted-foreground leading-relaxed">
            Two distinct, role-restricted dashboards powered by a unified metric registry and parameterized PostgreSQL aggregations.
          </p>

          {/* Tab Switcher */}
          <div className="mt-8 inline-flex p-1.5 rounded-2xl border border-border/70 bg-muted/40 backdrop-blur-xl">
            <button
              type="button"
              onClick={() => setActiveTab('client')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === 'client'
                  ? 'bg-background text-foreground shadow-md ring-1 ring-border/80'
                  : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              <BarChart3 className="h-4 w-4 text-indigo-400" />
              <span>Client Intelligence (/dashboard)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('admin')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === 'admin'
                  ? 'bg-background text-foreground shadow-md ring-1 ring-border/80'
                  : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              <ShieldAlert className="h-4 w-4 text-violet-400" />
              <span>Platform Command (/admin/dashboard)</span>
            </button>
          </div>
        </div>

        {/* Dashboard Preview Window */}
        <div className="relative rounded-2xl border border-border/80 bg-background/90 shadow-2xl overflow-hidden backdrop-blur-2xl">
          {/* Mock Browser Top Bar */}
          <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-5 py-3">
            <div className="flex items-center gap-2.5">
              <div className="h-3 w-3 rounded-full bg-rose-500/80 shadow-xs" />
              <div className="h-3 w-3 rounded-full bg-amber-500/80 shadow-xs" />
              <div className="h-3 w-3 rounded-full bg-emerald-500/80 shadow-xs" />
              <span className="ml-3 font-mono text-xs text-muted-foreground">
                https://Acuity.app{activeTab === 'client' ? '/dashboard' : '/admin/dashboard'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
              <Lock className="h-3.5 w-3.5 text-emerald-400" />
              <span>{activeTab === 'client' ? 'Tenant Member Scoped' : 'Platform Superuser Restricted'}</span>
            </div>
          </div>

          <div className="p-6 sm:p-8">
            {activeTab === 'client' ? (
              /* Client Intelligence Preview */
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/40">
                  <div>
                    <h3 className="text-xl font-bold text-foreground">Client Intelligence Dashboard</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Automated telemetry for Acuity Organization #1</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-border text-xs bg-muted/30 font-mono">
                      Last 30 Days
                    </Badge>
                    <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400 text-xs font-medium">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse mr-1" />
                      Live Stream
                    </Badge>
                  </div>
                </div>

                {/* KPI Card Grid Preview */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 rounded-xl border border-border/70 bg-card/40 backdrop-blur-md">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>Total Calls</span>
                      <PhoneCall className="h-3.5 w-3.5 text-indigo-400" />
                    </div>
                    <div className="text-2xl sm:text-3xl font-extrabold text-foreground font-mono">656</div>
                    <div className="text-xs text-emerald-400 font-medium mt-1 flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" /> +12.4% vs prev
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-border/70 bg-card/40 backdrop-blur-md">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>Answer Rate</span>
                      <PhoneCall className="h-3.5 w-3.5 text-emerald-400" />
                    </div>
                    <div className="text-2xl sm:text-3xl font-extrabold text-foreground font-mono">88.4%</div>
                    <div className="text-xs text-emerald-400 font-medium mt-1 flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" /> +4.2% vs prev
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-border/70 bg-card/40 backdrop-blur-md">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>Staff Hours Saved</span>
                      <Clock className="h-3.5 w-3.5 text-cyan-400" />
                    </div>
                    <div className="text-2xl sm:text-3xl font-extrabold text-foreground font-mono">145 hrs</div>
                    <div className="text-xs text-muted-foreground mt-1">15 min/call baseline</div>
                  </div>

                  <div className="p-4 rounded-xl border border-border/70 bg-card/40 backdrop-blur-md">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>Net Value Created</span>
                      <DollarSign className="h-3.5 w-3.5 text-violet-400" />
                    </div>
                    <div className="text-2xl sm:text-3xl font-extrabold text-foreground font-mono">$3,567</div>
                    <div className="text-xs text-emerald-400 font-medium mt-1 flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" /> ROI Verified
                    </div>
                  </div>
                </div>

                {/* Sub-features Preview Banner */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
                  <div className="p-4 rounded-xl border border-border/50 bg-muted/20">
                    <div className="font-semibold text-sm text-foreground flex items-center gap-1.5 mb-1">
                      <TrendingUp className="h-4 w-4 text-indigo-400" />
                      <span>24x7 Call Density Heatmap</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Identifies peak call density hours across timezones to dynamically allocate concurrent agent pipelines.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border border-border/50 bg-muted/20">
                    <div className="font-semibold text-sm text-foreground flex items-center gap-1.5 mb-1">
                      <Users className="h-4 w-4 text-cyan-400" />
                      <span>Lead Funnel & CRM Attribution</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Tracks Inbound/Outbound &rarr; Connected &rarr; Qualified &rarr; Booked lifecycle conversions.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border border-border/50 bg-muted/20">
                    <div className="font-semibold text-sm text-foreground flex items-center gap-1.5 mb-1">
                      <CalendarCheck className="h-4 w-4 text-emerald-400" />
                      <span>Autonomous Calendar Sync</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Direct Google / Outlook calendar scheduling with collision checks and zero human agent intervention.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              /* Platform Command Center Preview */
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/40">
                  <div>
                    <h3 className="text-xl font-bold text-foreground">Platform Command Center</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Macro fleet health and unit economics across all tenants</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-violet-500/40 bg-violet-500/10 text-violet-400 text-xs font-semibold">
                      Platform Superuser
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 rounded-xl border border-border/70 bg-card/40 backdrop-blur-md">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>Total Clients</span>
                      <Users className="h-3.5 w-3.5 text-violet-400" />
                    </div>
                    <div className="text-2xl sm:text-3xl font-extrabold text-foreground font-mono">13</div>
                    <div className="text-xs text-muted-foreground mt-1">Multi-tenant portfolio</div>
                  </div>

                  <div className="p-4 rounded-xl border border-border/70 bg-card/40 backdrop-blur-md">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>Platform Calls</span>
                      <PhoneCall className="h-3.5 w-3.5 text-indigo-400" />
                    </div>
                    <div className="text-2xl sm:text-3xl font-extrabold text-foreground font-mono">658</div>
                    <div className="text-xs text-muted-foreground mt-1">Cross-tenant aggregate</div>
                  </div>

                  <div className="p-4 rounded-xl border border-border/70 bg-card/40 backdrop-blur-md">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>Provider AI Spend</span>
                      <DollarSign className="h-3.5 w-3.5 text-amber-400" />
                    </div>
                    <div className="text-2xl sm:text-3xl font-extrabold text-foreground font-mono">$58.33</div>
                    <div className="text-xs text-muted-foreground mt-1">LLM + TTS + STT spend</div>
                  </div>

                  <div className="p-4 rounded-xl border border-border/70 bg-card/40 backdrop-blur-md">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>Avg Cost / Call</span>
                      <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                    </div>
                    <div className="text-2xl sm:text-3xl font-extrabold text-foreground font-mono">$0.088</div>
                    <div className="text-xs text-emerald-400 font-medium mt-1">Predictable unit economics</div>
                  </div>
                </div>

                <div className="p-5 rounded-xl border border-border/50 bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">Granular Client Drill-Down Modal</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">Inspect tenant status, assigned telephony lines, agent fleet, and spend.</p>
                  </div>
                  <Button size="sm" variant="outline" asChild className="shrink-0 text-xs">
                    <Link href="/auth/login" className="flex items-center gap-1.5">
                      <span>Access Command Console</span>
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
