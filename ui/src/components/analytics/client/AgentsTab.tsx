import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { AgentPerformanceRow } from '../types';
import { Bot, Scale, ArrowUpDown } from 'lucide-react';

interface AgentsTabProps {
  agents: AgentPerformanceRow[];
}

export function AgentsTab({ agents }: AgentsTabProps) {
  const [selectedAgentIds, setSelectedAgentIds] = useState<number[]>([]);
  const [isCompareOpen, setIsCompareOpen] = useState(false);

  const toggleSelectAgent = (id: number) => {
    setSelectedAgentIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : prev.length < 2 ? [...prev, id] : [prev[1] ?? id, id]
    );
  };

  const comparedAgents = agents.filter((a) => selectedAgentIds.includes(a.agentId));

  return (
    <div className="space-y-6">
      <Card className="border-border/60">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base font-semibold">Agent Performance Leaderboard</CardTitle>
            <CardDescription>Comparative operational metrics across published voice workflows</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={selectedAgentIds.length < 2}
              onClick={() => setIsCompareOpen(true)}
              className="gap-1.5 text-xs"
            >
              <Scale className="h-3.5 w-3.5" />
              Compare Selected ({selectedAgentIds.length}/2)
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {agents.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No active agents with call activity found for this period.
            </div>
          ) : (
            <div className="rounded-md border border-border/60 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-12 text-center">Select</TableHead>
                    <TableHead>Agent Name</TableHead>
                    <TableHead className="text-right">Total Calls</TableHead>
                    <TableHead className="text-right">Answered</TableHead>
                    <TableHead className="text-right">Answer Rate</TableHead>
                    <TableHead className="text-right">Avg Duration</TableHead>
                    <TableHead className="text-right">AI Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agents.map((agent) => {
                    const isSelected = selectedAgentIds.includes(agent.agentId);
                    return (
                      <TableRow
                        key={agent.agentId}
                        className={isSelected ? 'bg-primary/5' : undefined}
                      >
                        <TableCell className="text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectAgent(agent.agentId)}
                            className="rounded border-border cursor-pointer"
                          />
                        </TableCell>
                        <TableCell className="font-medium flex items-center gap-2">
                          <Bot className="h-4 w-4 text-primary" />
                          <span>{agent.agentName}</span>
                          <span className="text-[11px] font-mono text-muted-foreground">#{agent.agentId}</span>
                        </TableCell>
                        <TableCell className="text-right font-mono">{agent.totalCalls}</TableCell>
                        <TableCell className="text-right font-mono">{agent.answeredCalls}</TableCell>
                        <TableCell className="text-right font-mono">
                          {agent.answerRate !== null ? `${agent.answerRate}%` : 'N/A'}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {agent.avgDurationSeconds !== null ? `${Math.round(agent.avgDurationSeconds)}s` : 'N/A'}
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium">
                          ${agent.totalCostUsd.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Side-by-Side Comparison Dialog */}
      <Dialog open={isCompareOpen} onOpenChange={setIsCompareOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-primary" />
              Side-by-Side Agent Comparison
            </DialogTitle>
            <DialogDescription>
              Direct benchmark of two AI calling agents across productivity, cost, and efficiency.
            </DialogDescription>
          </DialogHeader>

          {comparedAgents.length === 2 && (
            <div className="grid grid-cols-2 gap-4 mt-4">
              {comparedAgents.map((agent) => (
                <div key={agent.agentId} className="p-4 rounded-xl border border-border/60 bg-muted/20 space-y-3">
                  <div className="flex items-center gap-2">
                    <Bot className="h-5 w-5 text-primary" />
                    <div>
                      <h4 className="font-semibold text-sm">{agent.agentName}</h4>
                      <p className="text-xs text-muted-foreground font-mono">Workflow #{agent.agentId}</p>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-border/40 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Handled Calls:</span>
                      <span className="font-mono font-semibold">{agent.totalCalls}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Answer Rate:</span>
                      <span className="font-mono font-semibold">
                        {agent.answerRate !== null ? `${agent.answerRate}%` : 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Avg Duration:</span>
                      <span className="font-mono font-semibold">
                        {agent.avgDurationSeconds !== null ? `${Math.round(agent.avgDurationSeconds)}s` : 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">AI Cost:</span>
                      <span className="font-mono font-semibold">${agent.totalCostUsd.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
