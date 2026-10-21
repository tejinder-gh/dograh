import {
  Building2,
  Clock,
  Coins,
  Cpu,
  PhoneCall,
  PhoneForwarded,
  UserPlus,
  Users2,
} from 'lucide-react';
import React from 'react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Card, CardContent, CardDescription,CardHeader, CardTitle } from '@/components/ui/card';

import { KpiCard } from '../KpiCard';
import type { PlatformOverviewDashboardData } from '../types';

interface PlatformOverviewTabProps {
  data: PlatformOverviewDashboardData;
}

export function PlatformOverviewTab({ data }: PlatformOverviewTabProps) {
  const { kpis, usageTrend } = data;

  return (
    <div className="space-y-6">
      {/* Platform Executive KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <KpiCard
          title="Total Clients"
          metric={kpis.totalClients}
          icon={Building2}
          format="number"
        />
        <KpiCard
          title="Active Clients"
          metric={kpis.activeClients}
          icon={Users2}
          format="number"
        />
        <KpiCard
          title="Net Client Growth"
          metric={kpis.netClientGrowth}
          icon={UserPlus}
          format="number"
        />
        <KpiCard
          title="Platform Calls"
          metric={kpis.totalPlatformCalls}
          icon={PhoneCall}
          format="number"
        />
        <KpiCard
          title="Platform Answer Rate"
          metric={kpis.platformAnswerRate}
          icon={PhoneForwarded}
          format="percentage"
        />
        <KpiCard
          title="Total Handled Minutes"
          metric={kpis.totalPlatformMinutes}
          icon={Clock}
          format="number"
        />
        <KpiCard
          title="Total AI Provider Cost"
          metric={kpis.totalPlatformAiCostUsd}
          icon={Coins}
          format="currency"
        />
        <KpiCard
          title="Turn Latency (p95)"
          metric={kpis.turnLatencyP95Ms}
          icon={Cpu}
          format="number"
          subtitle="Target < 1000ms"
        />
      </div>

      {/* Cross-Tenant Macro Call Volume Trend */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center justify-between">
            <span>Macro Platform Call Activity</span>
            <span className="text-xs text-muted-foreground font-normal">
              Aggregated across all platform organizations
            </span>
          </CardTitle>
          <CardDescription>Daily platform-wide call volume and AI provider consumption</CardDescription>
        </CardHeader>
        <CardContent>
          {usageTrend.length === 0 ? (
            <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
              No platform call records found for this period.
            </div>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={usageTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="macroCalls" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="macroAnswered" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="timestamp"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(val) => {
                      const parts = String(val).split('-');
                      return parts.length >= 3 ? `${parts[1]}/${parts[2]}` : String(val);
                    }}
                  />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      borderColor: 'hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="totalCalls"
                    name="Total Platform Attempts"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#macroCalls)"
                  />
                  <Area
                    type="monotone"
                    dataKey="answeredCalls"
                    name="Connected Sessions"
                    stroke="#06b6d4"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#macroAnswered)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
