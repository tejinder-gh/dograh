'use client';

import React, { useEffect, useState, useMemo } from 'react';
import {
  ExternalLink,
  Loader2,
  Search,
  Settings,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AdminClientAccountRow } from '@/types/subscription';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { impersonateAsSuperadmin } from '@/lib/utils';
import { AccountControlDialog } from './AccountControlDialog';

export function AccountsTab() {
  const { getAccessToken } = useAuth();
  const [accounts, setAccounts] = useState<AdminClientAccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<AdminClientAccountRow | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/business/admin/accounts');
      if (!res.ok) {
        throw new Error(`Failed to load accounts: HTTP ${res.status}`);
      }
      const data = await res.json();
      setAccounts(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error loading accounts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const filteredAccounts = useMemo(() => {
    if (!search.trim()) return accounts;
    const q = search.toLowerCase();
    return accounts.filter(
      (a) =>
        a.organizationName.toLowerCase().includes(q) ||
        (a.ownerEmail && a.ownerEmail.toLowerCase().includes(q)) ||
        a.planName.toLowerCase().includes(q)
    );
  }, [accounts, search]);

  const openEditModal = (account: AdminClientAccountRow) => {
    setSelectedAccount(account);
    setEditModalOpen(true);
  };

  const handleImpersonate = async (account: AdminClientAccountRow) => {
    if (!account.ownerEmail) {
      toast.error('Account has no associated owner email for impersonation');
      return;
    }
    setImpersonatingId(account.tenantId);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error('Missing admin access token');

      await impersonateAsSuperadmin({
        accessToken,
        email: account.ownerEmail,
        redirectPath: '/workflow',
        openInNewTab: true,
      });
      toast.success(`Opened session for ${account.ownerEmail}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impersonation failed');
    } finally {
      setImpersonatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold">Client Accounts & Subscriptions</h3>
          <p className="text-xs text-muted-foreground">
            Manage multi-tenant subscriptions, minute allowances, concurrency limits, and client account health.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search clients or emails..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 text-xs h-8"
            />
          </div>
          <Button size="sm" variant="outline" onClick={loadAccounts} disabled={loading} className="text-xs h-8">
            Refresh
          </Button>
        </div>
      </div>

      <Card className="border-border/70 overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead className="text-xs font-semibold">Client Account</TableHead>
              <TableHead className="text-xs font-semibold">Subscription Plan</TableHead>
              <TableHead className="text-xs font-semibold">Status</TableHead>
              <TableHead className="text-xs font-semibold">Minutes Quota</TableHead>
              <TableHead className="text-xs font-semibold">Lines</TableHead>
              <TableHead className="text-xs font-semibold">MRR / Cost</TableHead>
              <TableHead className="text-xs font-semibold text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
                  Loading client accounts...
                </TableCell>
              </TableRow>
            ) : filteredAccounts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground text-xs">
                  No client accounts match search criteria.
                </TableCell>
              </TableRow>
            ) : (
              filteredAccounts.map((account) => {
                const planBadge =
                  account.planId === 'enterprise'
                    ? 'border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400'
                    : account.planId === 'professional'
                    ? 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                    : 'border-muted-foreground/30 bg-muted/40 text-muted-foreground';

                const statusBadge =
                  account.status === 'active'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : account.status === 'trialing'
                    ? 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400';

                return (
                  <TableRow key={account.tenantId} className="hover:bg-muted/20">
                    <TableCell className="py-3">
                      <div className="font-semibold text-xs text-foreground">{account.organizationName}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        {account.ownerEmail || `Org #${account.organizationId}`}
                      </div>
                    </TableCell>

                    <TableCell>
                      <Badge variant="outline" className={`text-[11px] font-medium ${planBadge}`}>
                        {account.planName}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${statusBadge}`}>
                        {account.status}
                      </Badge>
                    </TableCell>

                    <TableCell className="text-xs font-mono">
                      <span>{account.totalMinutesUsed}</span> /{' '}
                      <span className="text-muted-foreground">{account.totalAllocatedMinutes}m</span>
                      <div className="text-[10px] text-muted-foreground">
                        {account.remainingMinutes}m remaining
                      </div>
                    </TableCell>

                    <TableCell className="text-xs font-mono">
                      {account.concurrencyLimit} lines
                    </TableCell>

                    <TableCell className="text-xs">
                      <div className="font-semibold">${account.priceMonthlyUsd}/mo</div>
                      <div className="text-[10px] text-muted-foreground">
                        AI: ${account.directAiCostUsd.toFixed(2)} &middot; Profit: ${account.grossProfitUsd.toFixed(2)}
                      </div>
                    </TableCell>

                    <TableCell className="text-right space-x-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs px-2"
                        onClick={() => openEditModal(account)}
                      >
                        <Settings className="h-3 w-3 mr-1" />
                        Control
                      </Button>

                      {account.ownerEmail && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs px-2"
                          disabled={impersonatingId === account.tenantId}
                          onClick={() => handleImpersonate(account)}
                        >
                          {impersonatingId === account.tenantId ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ) : (
                            <ExternalLink className="h-3 w-3 mr-1" />
                          )}
                          Impersonate
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <AccountControlDialog
        account={selectedAccount}
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        onSaved={loadAccounts}
      />
    </div>
  );
}
