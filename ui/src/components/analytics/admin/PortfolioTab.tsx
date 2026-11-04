import { Building2, ExternalLink,Search } from 'lucide-react';
import React, { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription,CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import type { ClientPortfolioRow } from '../types';

interface PortfolioTabProps {
  portfolio: ClientPortfolioRow[];
}

export function PortfolioTab({ portfolio }: PortfolioTabProps) {
  const [search, setSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<ClientPortfolioRow | null>(null);

  const filtered = portfolio.filter(
    (c) =>
      c.organizationName.toLowerCase().includes(search.toLowerCase()) ||
      String(c.organizationId).includes(search) ||
      c.tenantId.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <Card className="border-border/60">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3">
          <div>
            <CardTitle className="text-base font-semibold">Client Portfolio Directory</CardTitle>
            <CardDescription>
              Total tenant roster with aggregated consumption, agent activity, and health status
            </CardDescription>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, ID, tenant..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No matching client organizations found.
            </div>
          ) : (
            <div className="rounded-md border border-border/60 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Organization</TableHead>
                    <TableHead>Tenant ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Active Agents</TableHead>
                    <TableHead className="text-right">Total Calls</TableHead>
                    <TableHead className="text-right">Handled Minutes</TableHead>
                    <TableHead className="text-right">AI Cost</TableHead>
                    <TableHead className="text-center">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((client) => (
                    <TableRow key={client.organizationId} className="hover:bg-muted/30">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-primary shrink-0" />
                          <div>
                            <div>{client.organizationName}</div>
                            <div className="text-[11px] font-mono text-muted-foreground">
                              Org #{client.organizationId}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {client.tenantId ? `${client.tenantId.slice(0, 8)}...` : 'Unmapped'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            client.status === 'active'
                              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 text-xs'
                              : 'border-blue-500/20 bg-blue-500/10 text-blue-600 text-xs'
                          }
                        >
                          {client.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">{client.activeAgentsCount}</TableCell>
                      <TableCell className="text-right font-mono font-medium">{client.totalCalls}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {client.totalMinutes} min
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        ${client.totalCostUsd.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedClient(client)}
                          className="h-8 px-2 text-xs"
                        >
                          <ExternalLink className="h-3.5 w-3.5 mr-1" />
                          Inspect
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Drill-Down Inspection Modal */}
      <Dialog open={Boolean(selectedClient)} onOpenChange={() => setSelectedClient(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              {selectedClient?.organizationName}
            </DialogTitle>
            <DialogDescription>
              Client Organization #{selectedClient?.organizationId} operational overview
            </DialogDescription>
          </DialogHeader>

          {selectedClient && (
            <div className="space-y-4 pt-2 text-sm">
              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted/30 border border-border/40 text-xs">
                <div>
                  <span className="text-muted-foreground">Organization ID:</span>
                  <p className="font-mono font-semibold">{selectedClient.organizationId}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Status:</span>
                  <p className="font-medium capitalize">{selectedClient.status}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Durable Business Tenant ID:</span>
                  <p className="font-mono font-semibold text-[11px] truncate">{selectedClient.tenantId || 'Pending activation'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Onboarded:</span>
                  <p className="font-medium">{new Date(selectedClient.createdAt).toLocaleDateString()}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Active Workflows:</span>
                  <p className="font-semibold">{selectedClient.activeAgentsCount}</p>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">Total Handled Calls:</span>
                  <span className="font-mono font-semibold">{selectedClient.totalCalls}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">Total Consumed Minutes:</span>
                  <span className="font-mono font-semibold">{selectedClient.totalMinutes} min</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">Direct Model/TTS/STT Spend:</span>
                  <span className="font-mono font-semibold">${selectedClient.totalCostUsd.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
