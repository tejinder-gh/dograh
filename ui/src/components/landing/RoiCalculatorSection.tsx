'use client';

import { Calculator } from 'lucide-react';
import React, { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';

import { calculateRoi, type RoiPreset } from './roi/roi-types';
import { RoiControlsCard } from './roi/RoiControlsCard';
import { RoiProjectionCard } from './roi/RoiProjectionCard';

export function RoiCalculatorSection() {
  const [callVolume, setCallVolume] = useState<number>(7500);
  const [durationMins, setDurationMins] = useState<number>(4.5);
  const [hourlyWage, setHourlyWage] = useState<number>(30);
  const [activePresetId, setActivePresetId] = useState<string | null>('growth');

  const calculation = useMemo(
    () => calculateRoi(callVolume, durationMins, hourlyWage),
    [callVolume, durationMins, hourlyWage]
  );

  const handleSelectPreset = (preset: RoiPreset) => {
    setActivePresetId(preset.id);
    setCallVolume(preset.callVolume);
    setDurationMins(preset.durationMins);
    setHourlyWage(preset.hourlyWage);
  };

  const handleVolumeChange = (val: number) => {
    setCallVolume(val);
    setActivePresetId(null);
  };

  const handleDurationChange = (val: number) => {
    setDurationMins(val);
    setActivePresetId(null);
  };

  const handleWageChange = (val: number) => {
    setHourlyWage(val);
    setActivePresetId(null);
  };

  return (
    <section id="roi-calculator" className="py-24 border-t border-border/40 bg-card/20 relative">
      {/* Background ambient lighting */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-gradient-to-tr from-indigo-500/10 via-violet-500/10 to-transparent blur-3xl pointer-events-none rounded-full" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <Badge
            variant="outline"
            className="border-indigo-500/30 bg-indigo-500/10 text-indigo-400 mb-3 px-3 py-1 font-medium inline-flex items-center gap-1.5"
          >
            <Calculator className="h-3.5 w-3.5" />
            <span>Interactive Fleet Economics</span>
          </Badge>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-foreground">
            Calculate Your Return on Autonomous Voice
          </h2>
          <p className="mt-4 text-base sm:text-lg text-muted-foreground leading-relaxed">
            Quantify exact payroll displacement, capacity expansion, and gross margins when migrating repetitive calling workflows from manual staffing to autonomous voice AI agents.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch max-w-6xl mx-auto">
          {/* Controls Column */}
          <div className="lg:col-span-7 flex flex-col">
            <RoiControlsCard
              callVolume={callVolume}
              durationMins={durationMins}
              hourlyWage={hourlyWage}
              onCallVolumeChange={handleVolumeChange}
              onDurationChange={handleDurationChange}
              onHourlyWageChange={handleWageChange}
              activePresetId={activePresetId}
              onSelectPreset={handleSelectPreset}
            />
          </div>

          {/* Results Display Column */}
          <div className="lg:col-span-5 flex flex-col">
            <RoiProjectionCard
              calculation={calculation}
              callVolume={callVolume}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
