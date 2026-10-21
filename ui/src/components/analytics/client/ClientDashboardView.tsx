'use client';

import {
  AlertCircle,
  Bot,
  CalendarCheck,
  LayoutDashboard,
  Loader2,
  PhoneCall,
  Smile,
  Sparkles,
  Users,
} from 'lucide-react';
import React, { useCallback,useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent,TabsList, TabsTrigger } from '@/components/ui/tabs';

import { FilterBar } from '../FilterBar';
import type { ClientOverviewDashboardData, TimeRangePreset } from '../types';
import { AgentsTab } from './AgentsTab';
import { AppointmentsTab } from './AppointmentsTab';
import { CallsTab } from './CallsTab';
import { ClientOverviewTab } from './ClientOverviewTab';
import { ExperienceTab } from './ExperienceTab';
import { LeadsTab } from './LeadsTab';
import { ValueTab } from './ValueTab';

export function ClientDashboardView() {
  const [timePreset, setTimePreset] = useState<TimeRangePreset>('30d');
  const [comparePrevious, setComparePrevious] = useState(true);
  const [selectedAgentId, setSelectedAgentId] = useState<number | 'all'>('all');

  const [data, setData] = useState<ClientOverviewDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const calculateDates = useCallback((preset: TimeRangePreset) => {
    const now = new Date();
    let from = new Date();
    if (preset === '7d') {
      from = new Date(now.getTime() - 7 * 86400000);
    } else if (preset === '30d') {
      from = new Date(now.getTime() - 30 * 86400000);
    } else if (preset === '90d') {
      from = new Date(now.getTime() - 90 * 86400000);
    } else if (preset === 'ytd') {
      from = new Date(now.getFullYear(), 0, 1);
    }
    return { from: from.toISOString(), to: now.toISOString() };
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { from, to } = calculateDates(timePreset);
      const params = new URLSearchParams({
        from,
        to,
        compare: comparePrevious ? 'previous_period' : 'none',
      });
      if (selectedAgentId !== 'all') {
        params.set('workflowId', String(selectedAgentId));
      }

      const res = await fetch(`/api/business/analytics/overview?${params.toString()}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || `Request failed with status ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  }, [timePreset, comparePrevious, selectedAgentId, calculateDates]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const { from, to } = calculateDates(timePreset);
  const exportUrl = `/api/business/analytics/export?from=${from}&to=${to}&compare=${comparePrevious ? 'previous_period' : 'none'}${
    selectedAgentId !== 'all' ? `&workflowId=${selectedAgentId}` : ''
  }`;

  const agentOptions = data?.topAgents.map((a) => ({ id: a.agentId, name: a.agentName })) || [];

  return (
    <div className="space-y-6">
      <FilterBar
        timePreset={timePreset}
        onTimePresetChange={setTimePreset}
        comparePrevious={comparePrevious}
        onComparePreviousChange={setComparePrevious}
        selectedAgentId={selectedAgentId}
        onAgentChange={setSelectedAgentId}
        agentOptions={agentOptions}
        onRefresh={loadData}
        isRefreshing={loading}
        exportUrl={exportUrl}
        exportFilenamePrefix="client-intelligence"
      />

      {loading && !data && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm">Aggregating telemetry and intelligence metrics...</p>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-6 text-center space-y-3">
          <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
          <h3 className="font-semibold text-destructive">Analytics Load Error</h3>
          <p className="text-xs text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={loadData}>
            Retry
          </Button>
        </div>
      )}

      {data && (
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-card/80 border border-border/60 p-1 rounded-xl h-auto flex flex-wrap gap-1">
            <TabsTrigger value="overview" className="gap-1.5 text-xs py-2 px-3">
              <LayoutDashboard className="h-3.5 w-3.5" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="calls" className="gap-1.5 text-xs py-2 px-3">
              <PhoneCall className="h-3.5 w-3.5" />
              Calls & Traffic
            </TabsTrigger>
            <TabsTrigger value="leads" className="gap-1.5 text-xs py-2 px-3">
              <Users className="h-3.5 w-3.5" />
              Leads & CRM
            </TabsTrigger>
            <TabsTrigger value="appointments" className="gap-1.5 text-xs py-2 px-3">
              <CalendarCheck className="h-3.5 w-3.5" />
              Bookings
            </TabsTrigger>
            <TabsTrigger value="agents" className="gap-1.5 text-xs py-2 px-3">
              <Bot className="h-3.5 w-3.5" />
              Agent Leaderboard
            </TabsTrigger>
            <TabsTrigger value="experience" className="gap-1.5 text-xs py-2 px-3">
              <Smile className="h-3.5 w-3.5" />
              Experience & Sentiment
            </TabsTrigger>
            <TabsTrigger value="value" className="gap-1.5 text-xs py-2 px-3">
              <Sparkles className="h-3.5 w-3.5" />
              Labor ROI & Value
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <ClientOverviewTab data={data} />
          </TabsContent>
          <TabsContent value="calls">
            <CallsTab data={data} />
          </TabsContent>
          <TabsContent value="leads">
            <LeadsTab data={data} />
          </TabsContent>
          <TabsContent value="appointments">
            <AppointmentsTab data={data} />
          </TabsContent>
          <TabsContent value="agents">
            <AgentsTab agents={data.topAgents} />
          </TabsContent>
          <TabsContent value="experience">
            <ExperienceTab data={data} />
          </TabsContent>
          <TabsContent value="value">
            <ValueTab data={data} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
