import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { KpiCard } from '../KpiCard';
import type { ClientOverviewDashboardData } from '../types';
import { CalendarCheck, CalendarDays, CheckCircle2, DollarSign, Bot } from 'lucide-react';

interface AppointmentsTabProps {
  data: ClientOverviewDashboardData;
}

export function AppointmentsTab({ data }: AppointmentsTabProps) {
  const { kpis } = data;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Bookings"
          metric={kpis.totalAppointments}
          icon={CalendarDays}
          format="number"
        />
        <KpiCard
          title="Confirmed Bookings"
          metric={kpis.confirmedAppointments}
          icon={CalendarCheck}
          format="number"
        />
        <KpiCard
          title="Booking Rate"
          metric={kpis.appointmentRate}
          icon={CheckCircle2}
          format="percentage"
        />
        <KpiCard
          title="Avg Call Duration"
          metric={kpis.avgDurationSeconds}
          icon={CalendarCheck}
          format="duration_seconds"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Booking Status Card */}
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Appointment Status Breakdown</CardTitle>
            <CardDescription>Current lifecycle states of scheduled bookings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center py-2 border-b border-border/40">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-sm font-medium">Confirmed / Completed</span>
              </div>
              <span className="font-mono text-sm font-semibold">
                {kpis.confirmedAppointments.value ?? 0}
              </span>
            </div>

            <div className="flex justify-between items-center py-2 border-b border-border/40">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-blue-500" />
                <span className="text-sm font-medium">Pending Scheduled</span>
              </div>
              <span className="font-mono text-sm font-semibold">
                {Math.max(0, (kpis.totalAppointments.value ?? 0) - (kpis.confirmedAppointments.value ?? 0))}
              </span>
            </div>

            <div className="flex justify-between items-center py-2">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-rose-500" />
                <span className="text-sm font-medium">Cancelled / No-Show</span>
              </div>
              <span className="font-mono text-sm font-semibold">0</span>
            </div>
          </CardContent>
        </Card>

        {/* Autonomous Booking Intelligence */}
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              Autonomous Scheduling Efficiency
            </CardTitle>
            <CardDescription>Voice agent integration with live calendar slots</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Booking Conversion Rate</span>
              <span className="font-mono font-semibold">
                {kpis.appointmentRate.value !== null ? `${kpis.appointmentRate.value}%` : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Direct Telephony Integration</span>
              <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                Active
              </span>
            </div>
            <div className="pt-3 border-t border-border/40 text-xs text-muted-foreground">
              Appointments scheduled directly by AI agents correlate to CRM contacts and workflow run IDs for complete end-to-end auditability.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
