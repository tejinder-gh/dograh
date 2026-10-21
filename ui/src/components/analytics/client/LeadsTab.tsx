import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { KpiCard } from '../KpiCard';
import type { ClientOverviewDashboardData } from '../types';
import { Users, UserCheck, Award, ArrowDown, Target } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface LeadsTabProps {
  data: ClientOverviewDashboardData;
}

export function LeadsTab({ data }: LeadsTabProps) {
  const { kpis } = data;

  const totalCalls = kpis.totalCalls.value || 0;
  const answeredCalls = kpis.answeredCalls.value || 0;
  const totalLeads = kpis.totalLeads.value || 0;
  const qualifiedLeads = kpis.qualifiedLeads.value || 0;

  // Funnel stage percentages relative to previous stage
  const answeredPct = totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0;
  const leadPct = answeredCalls > 0 ? Math.round((totalLeads / answeredCalls) * 100) : 0;
  const qualifiedPct = totalLeads > 0 ? Math.round((qualifiedLeads / totalLeads) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Leads"
          metric={kpis.totalLeads}
          icon={Users}
          format="number"
        />
        <KpiCard
          title="Qualified Leads"
          metric={kpis.qualifiedLeads}
          icon={UserCheck}
          format="number"
        />
        <KpiCard
          title="Conversion Rate"
          metric={kpis.leadConversionRate}
          icon={Target}
          format="percentage"
        />
        <KpiCard
          title="Confirmed Bookings"
          metric={kpis.confirmedAppointments}
          icon={Award}
          format="number"
        />
      </div>

      {/* Conversion Funnel */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Lead Qualification Funnel</CardTitle>
          <CardDescription>End-to-end conversation-to-lead conversion progression</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Stage 1 */}
            <div className="p-4 rounded-xl bg-card border border-border/60 relative overflow-hidden">
              <div className="text-xs font-semibold uppercase text-muted-foreground">1. Total Calls</div>
              <div className="mt-2 text-2xl font-bold">{totalCalls}</div>
              <p className="mt-1 text-xs text-muted-foreground">Total call attempts</p>
              <div className="mt-3">
                <Progress value={100} className="h-1.5" />
              </div>
            </div>

            {/* Stage 2 */}
            <div className="p-4 rounded-xl bg-card border border-border/60 relative overflow-hidden">
              <div className="text-xs font-semibold uppercase text-muted-foreground">2. Connected Calls</div>
              <div className="mt-2 text-2xl font-bold">{answeredCalls}</div>
              <p className="mt-1 text-xs text-muted-foreground">{answeredPct}% connection rate</p>
              <div className="mt-3">
                <Progress value={answeredPct} className="h-1.5" />
              </div>
            </div>

            {/* Stage 3 */}
            <div className="p-4 rounded-xl bg-card border border-border/60 relative overflow-hidden">
              <div className="text-xs font-semibold uppercase text-muted-foreground">3. Captured Leads</div>
              <div className="mt-2 text-2xl font-bold">{totalLeads}</div>
              <p className="mt-1 text-xs text-muted-foreground">{leadPct}% of answered calls</p>
              <div className="mt-3">
                <Progress value={leadPct} className="h-1.5" />
              </div>
            </div>

            {/* Stage 4 */}
            <div className="p-4 rounded-xl bg-card border border-border/60 relative overflow-hidden">
              <div className="text-xs font-semibold uppercase text-emerald-600 dark:text-emerald-400">
                4. Qualified Leads
              </div>
              <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {qualifiedLeads}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{qualifiedPct}% qualification rate</p>
              <div className="mt-3">
                <Progress value={qualifiedPct} className="h-1.5" />
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-muted/40 p-4 border border-border/40 text-xs text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground">Qualification Methodology: </span>
            A lead is marked as <code className="font-mono text-foreground font-medium">qualified</code> when conversation extraction confirms intent, budget, timeline, and decision-making criteria matching the active Business Profile preferences.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
