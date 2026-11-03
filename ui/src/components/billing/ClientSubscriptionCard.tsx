'use client';

import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Coins,
  Layers,
  Loader2,
  PhoneCall,
  Sparkles,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { ClientSubscriptionOverview, SubscriptionPlan } from '@/types/subscription';
import { toast } from 'sonner';

export function ClientSubscriptionCard() {
  const [data, setData] = useState<ClientSubscriptionOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false);

  useEffect(() => {
    fetch('/api/business/subscription')
      .then(async (res) => {
        if (!res.ok) {
          throw new Error('Failed to load subscription details');
        }
        return res.json();
      })
      .then((json: ClientSubscriptionOverview) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Error loading subscription');
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <Card className="border-border/60">
        <CardContent className="flex items-center justify-center py-10 gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm">Retrieving organization subscription status...</p>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return null; // Gracefully degrade if unconfigured
  }

  const {
    plan,
    status,
    usedMinutes,
    totalAllocatedMinutes,
    remainingMinutes,
    usagePercentage,
    concurrencyLimit,
    activeAgentsCount,
    currentPeriodEnd,
    availablePlans,
  } = data;

  const formattedPeriodEnd = new Date(currentPeriodEnd).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const statusBadge =
    status === 'active' ? (
      <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
        Active
      </Badge>
    ) : status === 'trialing' ? (
      <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400">
        Trialing
      </Badge>
    ) : (
      <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
        {status}
      </Badge>
    );

  return (
    <Card className="border-border/70 shadow-xs overflow-hidden">
      <CardHeader className="bg-muted/20 border-b border-border/50 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="font-semibold text-lg tracking-tight">{plan.name}</span>
              {statusBadge}
            </div>
            <CardDescription className="mt-1">
              ${(plan.priceCents / 100).toFixed(0)} / {data.billingInterval} &middot; Renews on {formattedPeriodEnd}
            </CardDescription>
          </div>

          <Dialog open={upgradeDialogOpen} onOpenChange={setUpgradeDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5 self-start sm:self-auto">
                <Sparkles className="h-3.5 w-3.5 text-cta" />
                Manage Plan
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Available Voice Agent Subscription Plans</DialogTitle>
                <DialogDescription>
                  Scale your calling capacity, concurrent telephone lines, and voice agent workflows.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 md:grid-cols-3 pt-4">
                {availablePlans.map((p) => {
                  const isCurrent = p.id === plan.id;
                  return (
                    <div
                      key={p.id}
                      className={`flex flex-col justify-between rounded-xl border p-4 transition-all ${
                        isCurrent
                          ? 'border-primary bg-primary/5 shadow-xs'
                          : 'border-border/70 hover:border-border'
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold text-base">{p.name}</h4>
                          {isCurrent && (
                            <Badge variant="secondary" className="text-xs">
                              Current
                            </Badge>
                          )}
                        </div>
                        <div className="text-2xl font-bold">
                          ${(p.priceCents / 100).toFixed(0)}
                          <span className="text-xs font-normal text-muted-foreground"> /mo</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{p.description}</p>

                        <div className="border-t border-border/50 pt-3 space-y-2 text-xs">
                          <div className="flex items-center gap-1.5 font-medium">
                            <Clock className="h-3.5 w-3.5 text-primary" />
                            {p.includedVoiceMinutes.toLocaleString()} Voice Minutes
                          </div>
                          <div className="flex items-center gap-1.5 font-medium">
                            <PhoneCall className="h-3.5 w-3.5 text-primary" />
                            {p.maxConcurrentCalls} Concurrent Lines
                          </div>
                          <div className="flex items-center gap-1.5 font-medium">
                            <Layers className="h-3.5 w-3.5 text-primary" />
                            {p.maxVoiceAgents} Active Voice Agents
                          </div>
                        </div>

                        <div className="pt-2 space-y-1.5">
                          {p.features.slice(0, 3).map((feat, idx) => (
                            <div key={idx} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                              <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0 mt-0.5" />
                              <span>{feat}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="pt-5">
                        {isCurrent ? (
                          <Button disabled variant="outline" className="w-full text-xs" size="sm">
                            Current Plan
                          </Button>
                        ) : (
                          <Button
                            className="w-full text-xs"
                            size="sm"
                            onClick={() => {
                              toast.info(
                                `To upgrade to the ${p.name}, please contact your Skill Corner account representative or admin.`
                              );
                              setUpgradeDialogOpen(false);
                            }}
                          >
                            Select Plan
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent className="p-5 space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Monthly Voice Minutes
            </span>
            <span className="font-mono text-xs">
              <strong className="text-foreground">{usedMinutes.toLocaleString()}</strong> /{' '}
              {totalAllocatedMinutes.toLocaleString()} min ({usagePercentage}%)
            </span>
          </div>
          <Progress value={usagePercentage} className="h-2.5" />
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
            <span>
              Remaining:{' '}
              <strong className="text-foreground font-semibold">
                {remainingMinutes.toLocaleString()} minutes
              </strong>
            </span>
            {data.bonusMinutes > 0 && (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                +{data.bonusMinutes} bonus minutes credited
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
          <div className="rounded-xl border border-border/50 bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <PhoneCall className="h-3.5 w-3.5 text-primary" />
              Concurrent Lines
            </div>
            <div className="text-xl font-bold">{concurrencyLimit}</div>
            <div className="text-[11px] text-muted-foreground">Simultaneous active calls</div>
          </div>

          <div className="rounded-xl border border-border/50 bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Layers className="h-3.5 w-3.5 text-primary" />
              Active Agents
            </div>
            <div className="text-xl font-bold">{activeAgentsCount}</div>
            <div className="text-[11px] text-muted-foreground">Configured voice workflows</div>
          </div>

          <div className="col-span-2 sm:col-span-1 rounded-xl border border-border/50 bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Zap className="h-3.5 w-3.5 text-cta" />
              Overage Rate
            </div>
            <div className="text-xl font-bold">${(plan.additionalMinuteRateCents / 100).toFixed(2)}</div>
            <div className="text-[11px] text-muted-foreground">Per extra voice minute</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
