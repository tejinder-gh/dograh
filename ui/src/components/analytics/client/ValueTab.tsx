import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { KpiCard } from '../KpiCard';
import type { ClientOverviewDashboardData } from '../types';
import { Sparkles, Hourglass, Coins, DollarSign, Calculator, Moon } from 'lucide-react';

interface ValueTabProps {
  data: ClientOverviewDashboardData;
}

export function ValueTab({ data }: ValueTabProps) {
  const { kpis } = data;
  const [hourlyWage, setHourlyWage] = useState(25);

  const hoursSaved = kpis.staffHoursSaved.value ?? 0;
  const aiCost = kpis.totalAiCostUsd.value ?? 0;
  const grossSavings = Math.round(hoursSaved * hourlyWage);
  const dynamicNetRoi = Math.round(grossSavings - aiCost);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Staff Hours Saved"
          metric={kpis.staffHoursSaved}
          icon={Hourglass}
          format="hours"
        />
        <KpiCard
          title="Total AI Provider Cost"
          metric={kpis.totalAiCostUsd}
          icon={Coins}
          format="currency"
        />
        <KpiCard
          title="Gross Labor Value"
          metric={{
            value: grossSavings,
            previousValue: null,
            deltaPercentage: null,
            trend: 'up',
            status: 'estimated',
            formulaExplanation: `hoursSaved * $${hourlyWage}/hr wage assumption`,
          }}
          icon={DollarSign}
          format="currency"
        />
        <KpiCard
          title="Net ROI Generated"
          metric={{
            value: dynamicNetRoi,
            previousValue: null,
            deltaPercentage: null,
            trend: 'up',
            status: 'estimated',
            formulaExplanation: 'grossLaborSavings - aiCost',
          }}
          icon={Sparkles}
          format="currency"
        />
      </div>

      {/* Interactive Value & ROI Modeling */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Calculator className="h-4 w-4 text-primary" />
              Interactive Labor Replacement Assumption
            </CardTitle>
            <CardDescription>
              Adjust your organization's loaded hourly human agent cost to recalculate ROI
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium">Assumed Hourly Agent Wage:</span>
                <span className="font-mono text-base font-bold text-primary">${hourlyWage}/hour</span>
              </div>
              <input
                type="range"
                min="15"
                max="60"
                step="1"
                value={hourlyWage}
                onChange={(e) => setHourlyWage(Number(e.target.value))}
                className="w-full accent-primary h-2 bg-muted rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
                <span>$15/hr (Entry CSR)</span>
                <span>$25/hr (Standard Loaded)</span>
                <span>$60/hr (Specialized Agent)</span>
              </div>
            </div>

            <div className="rounded-xl bg-muted/30 p-4 border border-border/40 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Hours Conserved:</span>
                <span className="font-mono font-medium">{hoursSaved.toFixed(1)} hours</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Human Labor Equivalent:</span>
                <span className="font-mono font-medium">${grossSavings.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">AI Infrastructure Spend:</span>
                <span className="font-mono font-medium">-${aiCost.toFixed(2)}</span>
              </div>
              <div className="pt-2 border-t border-border/40 flex justify-between font-semibold text-sm">
                <span>Net Value Added:</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400">
                  ${dynamicNetRoi.toLocaleString()}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Moon className="h-4 w-4 text-amber-500" />
              After-Hours Autonomous Coverage
            </CardTitle>
            <CardDescription>Value created outside standard 9-to-5 business hours</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300">
              <p className="font-medium text-xs">Continuous 24x7 Customer Engagement</p>
              <p className="mt-1 text-xs leading-relaxed opacity-90">
                Your AI agents autonomously handled customer inquiries and booked appointments during evenings, weekends, and holidays when human staff was unavailable.
              </p>
            </div>

            <div className="space-y-2 pt-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cost per Handled Minute:</span>
                <span className="font-mono font-semibold">
                  {hoursSaved > 0 ? `$${((aiCost / (hoursSaved * 60)) || 0).toFixed(3)}/min` : '$0.00/min'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Equivalent Human CSR Cost:</span>
                <span className="font-mono font-semibold">
                  ${((hourlyWage / 60) || 0).toFixed(3)}/min
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
