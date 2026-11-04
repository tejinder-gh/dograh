import { Calendar, Download, RefreshCw } from 'lucide-react';
import React, { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

import type { TimeRangePreset } from './types';

interface FilterBarProps {
  timePreset: TimeRangePreset;
  onTimePresetChange: (preset: TimeRangePreset) => void;
  comparePrevious: boolean;
  onComparePreviousChange: (compare: boolean) => void;
  selectedAgentId?: number | 'all';
  onAgentChange?: (agentId: number | 'all') => void;
  agentOptions?: { id: number; name: string }[];
  onRefresh?: () => void;
  isRefreshing?: boolean;
  exportUrl: string;
  exportFilenamePrefix?: string;
}

export function FilterBar({
  timePreset,
  onTimePresetChange,
  comparePrevious,
  onComparePreviousChange,
  selectedAgentId = 'all',
  onAgentChange,
  agentOptions = [],
  onRefresh,
  isRefreshing = false,
  exportUrl,
  exportFilenamePrefix = 'analytics-export',
}: FilterBarProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const res = await fetch(exportUrl);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exportFilenamePrefix}-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Failed to export CSV:', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-card/60 backdrop-blur-md rounded-xl border border-border/60 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        {/* Time Preset */}
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Select
            value={timePreset}
            onValueChange={(val) => onTimePresetChange(val as TimeRangePreset)}
          >
            <SelectTrigger className="w-36 h-9 text-xs">
              <SelectValue placeholder="Timeframe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="90d">Last 90 Days</SelectItem>
              <SelectItem value="ytd">Year to Date</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Optional Agent Filter */}
        {agentOptions.length > 0 && onAgentChange && (
          <div className="flex items-center gap-2">
            <Select
              value={String(selectedAgentId)}
              onValueChange={(val) =>
                onAgentChange(val === 'all' ? 'all' : Number(val))
              }
            >
              <SelectTrigger className="w-44 h-9 text-xs">
                <SelectValue placeholder="All Agents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Agents</SelectItem>
                {agentOptions.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Compare Toggle */}
        <div className="flex items-center space-x-2 pl-2 border-l border-border/60">
          <Switch
            id="compare-mode"
            checked={comparePrevious}
            onCheckedChange={onComparePreviousChange}
          />
          <Label htmlFor="compare-mode" className="text-xs text-muted-foreground cursor-pointer">
            Compare with prior period
          </Label>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {onRefresh && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="h-9 px-2.5 text-xs text-muted-foreground"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={isExporting}
          className="h-9 gap-1.5 text-xs font-medium"
        >
          <Download className="h-3.5 w-3.5" />
          {isExporting ? 'Exporting...' : 'Export CSV'}
        </Button>
      </div>
    </div>
  );
}
