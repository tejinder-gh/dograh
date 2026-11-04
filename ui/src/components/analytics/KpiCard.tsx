import {
  AlertCircle,
  HelpCircle,
  type LucideIcon,
  Minus,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import React from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import type { KpiMetric } from './types';

interface KpiCardProps {
  title: string;
  metric: KpiMetric<number>;
  icon?: LucideIcon;
  format?: 'number' | 'currency' | 'percentage' | 'duration_seconds' | 'hours';
  subtitle?: string;
  className?: string;
}

export function formatMetricValue(
  value: number | null | undefined,
  format: 'number' | 'currency' | 'percentage' | 'duration_seconds' | 'hours' = 'number'
): string {
  if (value === null || value === undefined || isNaN(value)) {
    return 'N/A';
  }

  switch (format) {
    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: value % 1 === 0 ? 0 : 2,
        maximumFractionDigits: 2,
      }).format(value);
    case 'percentage':
      return `${value.toFixed(1)}%`;
    case 'duration_seconds': {
      const mins = Math.floor(value / 60);
      const secs = Math.round(value % 60);
      return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    }
    case 'hours':
      return `${value.toFixed(1)} hrs`;
    case 'number':
    default:
      return new Intl.NumberFormat('en-US').format(value);
  }
}

export function KpiCard({
  title,
  metric,
  icon: Icon,
  format = 'number',
  subtitle,
  className = '',
}: KpiCardProps) {
  const isUnavailable = metric.status === 'unavailable' || metric.value === null;
  const isUp = metric.trend === 'up';
  const isDown = metric.trend === 'down';
  const hasDelta = metric.deltaPercentage !== null && metric.deltaPercentage !== undefined;

  return (
    <Card className={`relative overflow-hidden transition-all duration-200 hover:shadow-md border-border/60 ${className}`}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between space-x-2">
          <div className="flex items-center gap-2">
            {Icon && (
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <Icon className="h-4 w-4" />
              </div>
            )}
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {title}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {metric.status === 'verified' && (
              <Badge variant="outline" className="border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] px-1.5 py-0">
                <ShieldCheck className="h-2.5 w-2.5 mr-0.5 inline" />
                Verified
              </Badge>
            )}
            {metric.status === 'estimated' && (
              <Badge variant="outline" className="border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] px-1.5 py-0">
                <Sparkles className="h-2.5 w-2.5 mr-0.5 inline" />
                Estimated
              </Badge>
            )}
            {metric.status === 'unavailable' && (
              <Badge variant="outline" className="border-slate-500/20 bg-muted text-muted-foreground text-[10px] px-1.5 py-0">
                <AlertCircle className="h-2.5 w-2.5 mr-0.5 inline" />
                Unavailable
              </Badge>
            )}

            {metric.formulaExplanation && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="text-muted-foreground/60 hover:text-muted-foreground transition-colors">
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs">
                  <p className="font-semibold">{title}</p>
                  <p className="mt-1 text-muted-foreground">{metric.formulaExplanation}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-baseline justify-between">
          <div className="text-2xl font-bold tracking-tight">
            {isUnavailable ? (
              <span className="text-muted-foreground font-medium text-lg">Unavailable</span>
            ) : (
              formatMetricValue(metric.value, format)
            )}
          </div>

          {hasDelta && !isUnavailable && (
            <div
              className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${
                isUp
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : isDown
                  ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {isUp && <TrendingUp className="h-3 w-3 mr-1" />}
              {isDown && <TrendingDown className="h-3 w-3 mr-1" />}
              {!isUp && !isDown && <Minus className="h-3 w-3 mr-1" />}
              {metric.deltaPercentage && metric.deltaPercentage > 0 ? `+${metric.deltaPercentage}%` : `${metric.deltaPercentage}%`}
            </div>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          {metric.previousValue !== null && metric.previousValue !== undefined && !isUnavailable ? (
            <span>vs. {formatMetricValue(metric.previousValue, format)} prior</span>
          ) : (
            <span>{subtitle || 'Single period snapshot'}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
