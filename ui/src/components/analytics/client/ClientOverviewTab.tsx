import {
  CalendarCheck,
  Clock,
  Hourglass,
  PhoneCall,
  PhoneForwarded,
  Smile,
  Sparkles,
  UserCheck,
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
import type { ClientOverviewDashboardData } from '../types';

interface ClientOverviewTabProps {
  data: ClientOverviewDashboardData;
}

export function ClientOverviewTab({ data }: ClientOverviewTabProps) {
  const { kpis, callVolumeSeries, dispositions } = data;

  return (
    <div className="space-y-6">
      {/* Primary Executive KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <KpiCard
          title="Total Calls"
          metric={kpis.totalCalls}
          icon={PhoneCall}
          format="number"
        />
        <KpiCard
          title="Answer Rate"
          metric={kpis.answerRate}
          icon={PhoneForwarded}
          format="percentage"
        />
        <KpiCard
          title="Avg Call Duration"
          metric={kpis.avgDurationSeconds}
          icon={Clock}
          format="duration_seconds"
        />
        <KpiCard
          title="Qualified Leads"
          metric={kpis.qualifiedLeads}
          icon={UserCheck}
          format="number"
        />
        <KpiCard
          title="Confirmed Bookings"
          metric={kpis.confirmedAppointments}
          icon={CalendarCheck}
          format="number"
        />
        <KpiCard
          title="Avg Sentiment"
          metric={kpis.avgSentimentScore}
          icon={Smile}
          format="number"
          subtitle="Score range (-1.0 to +1.0)"
        />
        <KpiCard
          title="Staff Hours Saved"
          metric={kpis.staffHoursSaved}
          icon={Hourglass}
          format="hours"
        />
        <KpiCard
          title="Net ROI Generated"
          metric={kpis.netValueUsd}
          icon={Sparkles}
          format="currency"
        />
      </div>

      {/* Visual Volume & Disposition Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend Area Chart */}
        <Card className="lg:col-span-2 border-border/60">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center justify-between">
              <span>Call Volume Trend</span>
              <span className="text-xs text-muted-foreground font-normal">
                {callVolumeSeries.length} recorded daily data points
              </span>
            </CardTitle>
            <CardDescription>Daily total and answered calls over the selected timeframe</CardDescription>
          </CardHeader>
          <CardContent>
            {callVolumeSeries.length === 0 ? (
              <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
                No call volume recorded for the selected window.
              </div>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={callVolumeSeries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="callGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="answeredGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
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
                      name="Total Attempts"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#callGradient)"
                    />
                    <Area
                      type="monotone"
                      dataKey="answeredCalls"
                      name="Connected Calls"
                      stroke="#10b981"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#answeredGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Disposition Breakdown */}
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Call Dispositions</CardTitle>
            <CardDescription>Categorization of call attempts</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {dispositions.map((item) => (
              <div key={item.disposition} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">{item.disposition}</span>
                  <span className="text-muted-foreground font-mono">
                    {item.count} ({item.percentage !== null ? `${item.percentage}%` : 'N/A'})
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      item.disposition === 'Completed'
                        ? 'bg-emerald-500'
                        : item.disposition === 'Missed'
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                    }`}
                    style={{ width: `${Math.min(100, item.percentage || 0)}%` }}
                  />
                </div>
              </div>
            ))}

            <div className="pt-3 border-t border-border/60 text-xs text-muted-foreground">
              Total AI cost consumed: <span className="font-semibold text-foreground">${kpis.totalAiCostUsd.value ?? 0}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
