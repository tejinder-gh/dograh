'use client';

import {
  Activity,
  AlertCircle,
  Building2,
  Coins,
  LayoutDashboard,
  Loader2,
  Lock,
} from 'lucide-react';
import Link from 'next/link';
import React, { useCallback,useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent,TabsList, TabsTrigger } from '@/components/ui/tabs';

import { FilterBar } from '../FilterBar';
import type { PlatformOverviewDashboardData, TimeRangePreset } from '../types';
import { EconomicsTab } from './EconomicsTab';
import { PlatformOverviewTab } from './PlatformOverviewTab';
import { PortfolioTab } from './PortfolioTab';
import { ReliabilityTab } from './ReliabilityTab';

export function AdminDashboardView() {
  const [timePreset, setTimePreset] = useState<TimeRangePreset>('30d');
  const [comparePrevious, setComparePrevious] = useState(true);

  const [isSuperuser, setIsSuperuser] = useState<boolean | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  const [data, setData] = useState<PlatformOverviewDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Authoritatively verify platform administrator status
  useEffect(() => {
    fetch('/api/v1/user/auth/user')
      .then((res) => (res.ok ? res.json() : null))
      .then((user) => {
        setIsSuperuser(Boolean(user?.is_superuser));
        setAuthChecking(false);
      })
      .catch(() => {
        setIsSuperuser(false);
        setAuthChecking(false);
      });
  }, []);

  const calculateDates = useCallback((preset: TimeRangePreset) => {
    const now = new Date();
    let from = new Date();
    if (preset === '7d') from = new Date(now.getTime() - 7 * 86400000);
    else if (preset === '30d') from = new Date(now.getTime() - 30 * 86400000);
    else if (preset === '90d') from = new Date(now.getTime() - 90 * 86400000);
    else if (preset === 'ytd') from = new Date(now.getFullYear(), 0, 1);
    return { from: from.toISOString(), to: now.toISOString() };
  }, []);

  const loadData = useCallback(async () => {
    if (!isSuperuser) return;
    setLoading(true);
    setError(null);
    try {
      const { from, to } = calculateDates(timePreset);
      const params = new URLSearchParams({
        from,
        to,
        compare: comparePrevious ? 'previous_period' : 'none',
      });

      const res = await fetch(`/api/business/admin/analytics/overview?${params.toString()}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || `Request failed with status ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load platform analytics');
    } finally {
      setLoading(false);
    }
  }, [timePreset, comparePrevious, isSuperuser, calculateDates]);

  useEffect(() => {
    if (isSuperuser) {
      loadData();
    }
  }, [isSuperuser, loadData]);

  if (authChecking) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm">Verifying platform administrator credentials...</p>
      </div>
    );
  }

  // Strict role restriction boundary for non-superusers
  if (!isSuperuser) {
    return (
      <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-12 text-center max-w-xl mx-auto space-y-4">
        <div className="inline-flex rounded-full bg-rose-500/10 p-3 text-rose-500">
          <Lock className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold tracking-tight">Access Restricted</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The Platform Command Center is strictly restricted to verified platform administrators (<code className="font-mono text-xs">is_superuser = true</code>). Standard organization administrative permissions do not grant platform-wide access.
        </p>
        <div className="pt-2">
          <Button asChild variant="outline">
            <Link href="/dashboard">Return to Client Dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  const { from, to } = calculateDates(timePreset);
  const exportUrl = `/api/business/admin/analytics/export?from=${from}&to=${to}&compare=${comparePrevious ? 'previous_period' : 'none'}`;

  return (
    <div className="space-y-6">
      <FilterBar
        timePreset={timePreset}
        onTimePresetChange={setTimePreset}
        comparePrevious={comparePrevious}
        onComparePreviousChange={setComparePrevious}
        onRefresh={loadData}
        isRefreshing={loading}
        exportUrl={exportUrl}
        exportFilenamePrefix="platform-portfolio"
      />

      {loading && !data && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm">Aggregating cross-tenant intelligence across platform portfolio...</p>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-6 text-center space-y-3">
          <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
          <h3 className="font-semibold text-destructive">Platform Command Error</h3>
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
              Platform Overview
            </TabsTrigger>
            <TabsTrigger value="portfolio" className="gap-1.5 text-xs py-2 px-3">
              <Building2 className="h-3.5 w-3.5" />
              Client Portfolio
            </TabsTrigger>
            <TabsTrigger value="economics" className="gap-1.5 text-xs py-2 px-3">
              <Coins className="h-3.5 w-3.5" />
              Revenue & Economics
            </TabsTrigger>
            <TabsTrigger value="reliability" className="gap-1.5 text-xs py-2 px-3">
              <Activity className="h-3.5 w-3.5" />
              Platform Reliability
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <PlatformOverviewTab data={data} />
          </TabsContent>
          <TabsContent value="portfolio">
            <PortfolioTab portfolio={data.clientPortfolio} />
          </TabsContent>
          <TabsContent value="economics">
            <EconomicsTab data={data} />
          </TabsContent>
          <TabsContent value="reliability">
            <ReliabilityTab data={data} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
