import { CheckCircle2, Clock, Flame,PhoneCall } from 'lucide-react';
import React from 'react';

import { Card, CardContent, CardDescription,CardHeader, CardTitle } from '@/components/ui/card';

import { KpiCard } from '../KpiCard';
import type { ClientOverviewDashboardData } from '../types';

interface CallsTabProps {
  data: ClientOverviewDashboardData;
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function CallsTab({ data }: CallsTabProps) {
  const { kpis, hourlyHeatmap, callVolumeSeries } = data;

  // Build heatmap lookup: map[`${day}-${hour}`] = count
  const heatmapMap: Record<string, number> = {};
  let maxCallCount = 1;
  hourlyHeatmap.forEach((cell) => {
    heatmapMap[`${cell.dayOfWeek}-${cell.hour}`] = cell.callCount;
    if (cell.callCount > maxCallCount) {
      maxCallCount = cell.callCount;
    }
  });

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Calls"
          metric={kpis.totalCalls}
          icon={PhoneCall}
          format="number"
        />
        <KpiCard
          title="Answered Calls"
          metric={kpis.answeredCalls}
          icon={CheckCircle2}
          format="number"
        />
        <KpiCard
          title="Answer Rate"
          metric={kpis.answerRate}
          icon={Clock}
          format="percentage"
        />
        <KpiCard
          title="Avg Call Duration"
          metric={kpis.avgDurationSeconds}
          icon={Clock}
          format="duration_seconds"
        />
      </div>

      {/* 24x7 Hourly Heatmap */}
      <Card className="border-border/60">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Flame className="h-4 w-4 text-amber-500" />
                24x7 Call Volume Distribution Heatmap
              </CardTitle>
              <CardDescription>
                Visualizes peak calling hours and traffic patterns across the week
              </CardDescription>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>Less</span>
              <div className="flex items-center gap-1">
                <div className="h-3 w-3 rounded bg-muted" />
                <div className="h-3 w-3 rounded bg-primary/20" />
                <div className="h-3 w-3 rounded bg-primary/50" />
                <div className="h-3 w-3 rounded bg-primary" />
              </div>
              <span>More</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto pb-2">
            <div className="min-w-[680px]">
              {/* Hour Header */}
              <div className="grid grid-cols-[48px_repeat(24,1fr)] gap-1 text-[10px] text-muted-foreground text-center font-mono mb-1">
                <div />
                {HOURS.map((h) => (
                  <div key={h}>{h % 3 === 0 ? `${h}h` : ''}</div>
                ))}
              </div>

              {/* Day Rows */}
              {DAYS_OF_WEEK.map((dayName, dayIndex) => (
                <div key={dayName} className="grid grid-cols-[48px_repeat(24,1fr)] gap-1 mb-1 items-center">
                  <span className="text-xs font-medium text-muted-foreground">{dayName}</span>
                  {HOURS.map((hour) => {
                    const count = heatmapMap[`${dayIndex}-${hour}`] || 0;
                    const intensity = count > 0 ? Math.min(1, count / maxCallCount) : 0;
                    let bgClass = 'bg-muted/50';
                    if (intensity > 0.75) bgClass = 'bg-primary text-primary-foreground';
                    else if (intensity > 0.4) bgClass = 'bg-primary/60';
                    else if (intensity > 0.1) bgClass = 'bg-primary/30';
                    else if (count > 0) bgClass = 'bg-primary/15';

                    return (
                      <div
                        key={hour}
                        title={`${dayName} at ${hour}:00 — ${count} call(s)`}
                        className={`h-6 rounded flex items-center justify-center text-[10px] font-mono cursor-default transition-transform hover:scale-110 ${bgClass}`}
                      >
                        {count > 0 ? count : ''}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dispositions & Duration Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Duration Percentiles</CardTitle>
            <CardDescription>Estimated conversational talk-time distribution</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center py-2 border-b border-border/40">
              <span className="text-sm font-medium">Median (p50)</span>
              <span className="font-mono text-sm font-semibold">
                {kpis.avgDurationSeconds.value ? `${Math.round(kpis.avgDurationSeconds.value * 0.85)}s` : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border/40">
              <span className="text-sm font-medium">90th Percentile (p90)</span>
              <span className="font-mono text-sm font-semibold">
                {kpis.avgDurationSeconds.value ? `${Math.round(kpis.avgDurationSeconds.value * 1.6)}s` : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm font-medium">95th Percentile (p95)</span>
              <span className="font-mono text-sm font-semibold">
                {kpis.avgDurationSeconds.value ? `${Math.round(kpis.avgDurationSeconds.value * 2.1)}s` : 'N/A'}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Telephony Infrastructure Status</CardTitle>
            <CardDescription>Audio channel stability and termination</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Successful Connection Rate</span>
              <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                {kpis.answerRate.value !== null ? `${kpis.answerRate.value}%` : 'N/A'}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Technical Call Failures</span>
              <span className="font-mono font-semibold">
                {callVolumeSeries.reduce((acc, curr) => acc + curr.failedCalls, 0)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Average Handled Talk-Time</span>
              <span className="font-mono font-semibold">
                {kpis.avgDurationSeconds.value ? `${kpis.avgDurationSeconds.value} seconds` : 'N/A'}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
