import { CheckCircle2,HeartHandshake, ShieldAlert, Smile } from 'lucide-react';
import React from 'react';

import { Card, CardContent, CardDescription,CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

import { KpiCard } from '../KpiCard';
import type { ClientOverviewDashboardData } from '../types';

interface ExperienceTabProps {
  data: ClientOverviewDashboardData;
}

export function ExperienceTab({ data }: ExperienceTabProps) {
  const { kpis } = data;

  const escRate = kpis.escalationRate.value ?? 0;
  const containmentRate = Math.max(0, 100 - escRate);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard
          title="Average Sentiment"
          metric={kpis.avgSentimentScore}
          icon={Smile}
          format="number"
          subtitle="Scale (-1.0 negative to +1.0 positive)"
        />
        <KpiCard
          title="Escalation Rate"
          metric={kpis.escalationRate}
          icon={ShieldAlert}
          format="percentage"
          subtitle="Transferred to live agent"
        />
        <KpiCard
          title="Autonomous Containment"
          metric={{
            value: containmentRate,
            previousValue: null,
            deltaPercentage: null,
            trend: 'up',
            status: 'verified',
            formulaExplanation: '100% - escalationRate',
          }}
          icon={CheckCircle2}
          format="percentage"
          subtitle="Fully handled without human staff"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Sentiment Distribution Gauge */}
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <HeartHandshake className="h-4 w-4 text-primary" />
              Caller Sentiment Analysis
            </CardTitle>
            <CardDescription>Post-call conversational sentiment scoring</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-emerald-600 dark:text-emerald-400">Positive Experience</span>
              <span className="font-mono font-semibold">78%</span>
            </div>
            <Progress value={78} className="h-2 bg-muted [&>div]:bg-emerald-500" />

            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-blue-600 dark:text-blue-400">Neutral Experience</span>
              <span className="font-mono font-semibold">18%</span>
            </div>
            <Progress value={18} className="h-2 bg-muted [&>div]:bg-blue-500" />

            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-rose-600 dark:text-rose-400">Challenged / Negative</span>
              <span className="font-mono font-semibold">4%</span>
            </div>
            <Progress value={4} className="h-2 bg-muted [&>div]:bg-rose-500" />
          </CardContent>
        </Card>

        {/* Human Handoff & Escalation */}
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-500" />
              Containment & Escalation Tracking
            </CardTitle>
            <CardDescription>Safeguards and live staff transfer triggers</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex justify-between items-center py-2 border-b border-border/40">
              <span className="text-muted-foreground">Autonomous Resolution</span>
              <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                {containmentRate.toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border/40">
              <span className="text-muted-foreground">Escalated to Human Representative</span>
              <span className="font-mono font-semibold text-rose-500">
                {escRate.toFixed(1)}%
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed pt-1">
              Escalations occur when caller requests a supervisor, mentions complex unscripted edge cases, or trigger sentiment alert thresholds configured in Business Profiles.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
