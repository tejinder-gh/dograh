'use client';

import { HelpCircle, Minus, Plus, Sliders } from 'lucide-react';
import React from 'react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { ROI_PRESETS, type RoiPreset } from './roi-types';

interface RoiControlsCardProps {
  callVolume: number;
  durationMins: number;
  hourlyWage: number;
  onCallVolumeChange: (val: number) => void;
  onDurationChange: (val: number) => void;
  onHourlyWageChange: (val: number) => void;
  activePresetId: string | null;
  onSelectPreset: (preset: RoiPreset) => void;
}

export function RoiControlsCard({
  callVolume,
  durationMins,
  hourlyWage,
  onCallVolumeChange,
  onDurationChange,
  onHourlyWageChange,
  activePresetId,
  onSelectPreset,
}: RoiControlsCardProps) {
  // Compute percentage fills for modern slider tracks
  const volumePercent = Math.min(100, Math.max(0, ((callVolume - 500) / (50000 - 500)) * 100));
  const durationPercent = Math.min(100, Math.max(0, ((durationMins - 1) / (15 - 1)) * 100));
  const wagePercent = Math.min(100, Math.max(0, ((hourlyWage - 15) / (75 - 15)) * 100));

  return (
    <div className="space-y-6 rounded-2xl border border-border/80 bg-background/70 p-6 sm:p-8 backdrop-blur-xl shadow-xl">
      {/* Preset Scenario Selectors */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Sliders className="h-3.5 w-3.5 text-indigo-400" />
            <span>Operational Templates</span>
          </span>
          <span className="text-xs text-muted-foreground">Select a business profile</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {ROI_PRESETS.map((preset) => {
            const isActive = activePresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelectPreset(preset)}
                className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition-all ${
                  isActive
                    ? 'border-indigo-500/80 bg-indigo-500/10 shadow-xs ring-1 ring-indigo-500/30'
                    : 'border-border/60 bg-muted/20 hover:bg-muted/40 hover:border-border text-muted-foreground'
                }`}
              >
                <span className={`text-xs font-semibold ${isActive ? 'text-indigo-400' : 'text-foreground'}`}>
                  {preset.name}
                </span>
                <span className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                  {preset.callVolume.toLocaleString()} calls • {preset.durationMins}m
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-px bg-border/40" />

      {/* Slider 1: Monthly Call Volume */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-1.5">
            <label htmlFor="volume-slider" className="text-sm font-semibold text-foreground">
              Monthly Call Volume
            </label>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="text-xs max-w-xs">
                Total inbound and outbound telephony calls routed through voice agents per month.
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-6 w-6 rounded-md border-border/60 hover:bg-muted"
              onClick={() => onCallVolumeChange(Math.max(500, callVolume - 500))}
              aria-label="Decrease call volume"
            >
              <Minus className="h-3 w-3" />
            </Button>
            <span className="font-mono font-bold text-sm text-indigo-400 min-w-[5.5rem] text-center px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20">
              {callVolume.toLocaleString()} calls
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-6 w-6 rounded-md border-border/60 hover:bg-muted"
              onClick={() => onCallVolumeChange(Math.min(50000, callVolume + 500))}
              aria-label="Increase call volume"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>

        <input
          id="volume-slider"
          type="range"
          min="500"
          max="50000"
          step="500"
          value={callVolume}
          onChange={(e) => onCallVolumeChange(Number(e.target.value))}
          style={{
            background: `linear-gradient(to right, #6366f1 ${volumePercent}%, oklch(0.25 0.01 260) ${volumePercent}%)`,
          }}
          className="modern-slider"
          aria-label="Monthly Call Volume"
          aria-valuenow={callVolume}
          aria-valuemin={500}
          aria-valuemax={50000}
        />
        <div className="flex justify-between text-[11px] font-mono text-muted-foreground">
          <span>500</span>
          <span>15,000</span>
          <span>30,000</span>
          <span>50,000+</span>
        </div>
      </div>

      {/* Slider 2: Average Call Duration */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-1.5">
            <label htmlFor="duration-slider" className="text-sm font-semibold text-foreground">
              Average Call Duration
            </label>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="text-xs max-w-xs">
                Typical length of conversation from carrier pick-up to hang-up.
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-6 w-6 rounded-md border-border/60 hover:bg-muted"
              onClick={() => onDurationChange(Math.max(1, durationMins - 0.5))}
              aria-label="Decrease duration"
            >
              <Minus className="h-3 w-3" />
            </Button>
            <span className="font-mono font-bold text-sm text-indigo-400 min-w-[5.5rem] text-center px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20">
              {durationMins} mins
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-6 w-6 rounded-md border-border/60 hover:bg-muted"
              onClick={() => onDurationChange(Math.min(15, durationMins + 0.5))}
              aria-label="Increase duration"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>

        <input
          id="duration-slider"
          type="range"
          min="1"
          max="15"
          step="0.5"
          value={durationMins}
          onChange={(e) => onDurationChange(Number(e.target.value))}
          style={{
            background: `linear-gradient(to right, #6366f1 ${durationPercent}%, oklch(0.25 0.01 260) ${durationPercent}%)`,
          }}
          className="modern-slider"
          aria-label="Average Call Duration"
          aria-valuenow={durationMins}
          aria-valuemin={1}
          aria-valuemax={15}
        />
        <div className="flex justify-between text-[11px] font-mono text-muted-foreground">
          <span>1 min</span>
          <span>5 mins</span>
          <span>10 mins</span>
          <span>15 mins</span>
        </div>
      </div>

      {/* Slider 3: Human Rep Hourly Wage */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-1.5">
            <label htmlFor="wage-slider" className="text-sm font-semibold text-foreground">
              Human Rep Hourly Wage
            </label>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="text-xs max-w-xs">
                Fully loaded employee wage including benefits, training, and operational overhead.
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-6 w-6 rounded-md border-border/60 hover:bg-muted"
              onClick={() => onHourlyWageChange(Math.max(15, hourlyWage - 1))}
              aria-label="Decrease wage"
            >
              <Minus className="h-3 w-3" />
            </Button>
            <span className="font-mono font-bold text-sm text-indigo-400 min-w-[5.5rem] text-center px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20">
              ${hourlyWage}/hr
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-6 w-6 rounded-md border-border/60 hover:bg-muted"
              onClick={() => onHourlyWageChange(Math.min(75, hourlyWage + 1))}
              aria-label="Increase wage"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>

        <input
          id="wage-slider"
          type="range"
          min="15"
          max="75"
          step="1"
          value={hourlyWage}
          onChange={(e) => onHourlyWageChange(Number(e.target.value))}
          style={{
            background: `linear-gradient(to right, #6366f1 ${wagePercent}%, oklch(0.25 0.01 260) ${wagePercent}%)`,
          }}
          className="modern-slider"
          aria-label="Human Rep Hourly Wage"
          aria-valuenow={hourlyWage}
          aria-valuemin={15}
          aria-valuemax={75}
        />
        <div className="flex justify-between text-[11px] font-mono text-muted-foreground">
          <span>$15/hr</span>
          <span>$35/hr</span>
          <span>$55/hr</span>
          <span>$75/hr</span>
        </div>
      </div>

      <div className="pt-2 text-xs text-muted-foreground flex items-center justify-between border-t border-border/30">
        <span>* Transparent pricing: $0.022/min neural voice + SIP streaming</span>
        <span className="font-mono text-[11px] text-emerald-400">Zero CapEx</span>
      </div>
    </div>
  );
}
