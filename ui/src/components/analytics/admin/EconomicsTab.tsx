import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { KpiCard } from '../KpiCard';
import type { PlatformOverviewDashboardData } from '../types';
import { CircleDollarSign, PiggyBank, Percent, Coins, Server } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface EconomicsTabProps {
  data: PlatformOverviewDashboardData;
}

export function EconomicsTab({ data }: EconomicsTabProps) {
  const { kpis, providerBreakdown } = data;

  return (
    <div className="space-y-6">
      {/* Unit Economics KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Recognized Revenue"
          metric={kpis.recognizedRevenueUsd}
          icon={CircleDollarSign}
          format="currency"
          subtitle="Invoiced customer collections"
        />
        <KpiCard
          title="Direct AI Provider Spend"
          metric={kpis.totalPlatformAiCostUsd}
          icon={Coins}
          format="currency"
          subtitle="LLM, TTS, STT vendor spend"
        />
        <KpiCard
          title="Gross Profit"
          metric={kpis.grossProfitUsd}
          icon={PiggyBank}
          format="currency"
          subtitle="Revenue minus AI provider cost"
        />
        <KpiCard
          title="Gross Margin"
          metric={kpis.grossMarginPercentage}
          icon={Percent}
          format="percentage"
          subtitle="Gross profit as % of revenue"
        />
      </div>

      {/* Model & Infrastructure Provider Cost Breakdown */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Server className="h-4 w-4 text-primary" />
            AI Provider & Model Economics
          </CardTitle>
          <CardDescription>
            Telemetry cost attribution partitioned by inference engine and voice synthesis provider
          </CardDescription>
        </CardHeader>
        <CardContent>
          {providerBreakdown.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No individual provider call breakdowns recorded for this period.
            </div>
          ) : (
            <div className="rounded-md border border-border/60 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Provider</TableHead>
                    <TableHead>Model / Pipeline</TableHead>
                    <TableHead className="text-right">Call Sessions</TableHead>
                    <TableHead className="text-right">Total Cost (USD)</TableHead>
                    <TableHead className="text-right">Avg Cost / Session</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {providerBreakdown.map((row) => {
                    const avgCost = row.callCount > 0 ? row.costUsd / row.callCount : 0;
                    return (
                      <TableRow key={`${row.provider}-${row.model}`}>
                        <TableCell className="font-medium">{row.provider}</TableCell>
                        <TableCell className="font-mono text-xs">{row.model}</TableCell>
                        <TableCell className="text-right font-mono">{row.callCount}</TableCell>
                        <TableCell className="text-right font-mono font-medium">
                          ${row.costUsd.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">
                          ${avgCost.toFixed(4)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="mt-4 rounded-lg bg-muted/30 p-4 border border-border/40 text-xs text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground">Economic Integrity Note: </span>
            When billing integrations or subscription invoice webhooks are not yet connected in the deployment, financial metrics explicitly display <span className="font-semibold text-foreground">Unavailable</span> rather than synthetic estimates.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
