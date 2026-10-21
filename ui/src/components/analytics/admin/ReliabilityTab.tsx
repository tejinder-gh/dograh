import { AlertTriangle, CheckCircle2,Cpu, Radio, ShieldCheck } from 'lucide-react';
import React from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription,CardHeader, CardTitle } from '@/components/ui/card';

import { KpiCard } from '../KpiCard';
import type { PlatformOverviewDashboardData } from '../types';

interface ReliabilityTabProps {
  data: PlatformOverviewDashboardData;
}

export function ReliabilityTab({ data }: ReliabilityTabProps) {
  const { kpis } = data;

  const errorRate = kpis.errorRatePercentage.value ?? 0;
  const successRate = Math.max(0, 100 - errorRate);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard
          title="Turn Latency (p95)"
          metric={kpis.turnLatencyP95Ms}
          icon={Cpu}
          format="number"
          subtitle="Target < 1000ms"
        />
        <KpiCard
          title="Platform Success Rate"
          metric={{
            value: successRate,
            previousValue: null,
            deltaPercentage: null,
            trend: 'up',
            status: 'verified',
            formulaExplanation: '100% - errorRate',
          }}
          icon={CheckCircle2}
          format="percentage"
          subtitle="Calls completing without technical failure"
        />
        <KpiCard
          title="Technical Error Rate"
          metric={kpis.errorRatePercentage}
          icon={AlertTriangle}
          format="percentage"
          subtitle="Failed or aborted workflow runs"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Voice Pipeline Health Card */}
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Radio className="h-4 w-4 text-primary" />
              Conversational Pipeline Latency Profile
            </CardTitle>
            <CardDescription>Streaming voice turn latency across pipeline components</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex justify-between items-center py-2 border-b border-border/40">
              <span className="text-muted-foreground">Speech-to-Text (Live STT)</span>
              <span className="font-mono text-xs text-muted-foreground">Telemetry Pending</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border/40">
              <span className="text-muted-foreground">LLM First-Token Time to First Byte</span>
              <span className="font-mono text-xs text-muted-foreground">Telemetry Pending</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border/40">
              <span className="text-muted-foreground">Text-to-Speech Streaming Synthesis</span>
              <span className="font-mono text-xs text-muted-foreground">Telemetry Pending</span>
            </div>
            <div className="flex justify-between items-center py-2 font-semibold">
              <span>Overall Conversational P95 Turn Latency</span>
              <span className="font-mono text-muted-foreground">
                {kpis.turnLatencyP95Ms.value !== null ? `${kpis.turnLatencyP95Ms.value}ms` : 'Unavailable'}
              </span>
            </div>
            <div className="pt-2 text-xs text-muted-foreground leading-relaxed">
              Real-time component turn latency metrics require end-to-end telemetry collection across STT, LLM inference, and audio synthesizer workers.
            </div>
          </CardContent>
        </Card>

        {/* Telephony Gateway & Carrier Health */}
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              Carrier Gateway & WebRTC Connectivity
            </CardTitle>
            <CardDescription>Real-time channel connectivity status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Twilio SIP Trunking Gateway</span>
              <Badge variant="secondary" className="border-border/60 text-muted-foreground text-xs font-normal">
                Telemetry Pending
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Telnyx Elastic Voice Pipeline</span>
              <Badge variant="secondary" className="border-border/60 text-muted-foreground text-xs font-normal">
                Telemetry Pending
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">WebRTC Fast-Audio Channel</span>
              <Badge variant="secondary" className="border-border/60 text-muted-foreground text-xs font-normal">
                Telemetry Pending
              </Badge>
            </div>
            <div className="pt-2 text-xs text-muted-foreground leading-relaxed">
              Carrier gateway health checks and automated carrier failover telemetry have not been connected to live probe reporting. Measured failover latency will display here when probe monitors are provisioned.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
