'use client';

import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AdminClientAccountRow, SubscriptionStatus } from '@/types/subscription';
import { toast } from 'sonner';

interface AccountControlDialogProps {
  account: AdminClientAccountRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function AccountControlDialog({
  account,
  open,
  onOpenChange,
  onSaved,
}: AccountControlDialogProps) {
  const [saving, setSaving] = useState(false);
  const [editPlanId, setEditPlanId] = useState('starter');
  const [editStatus, setEditStatus] = useState<SubscriptionStatus>('active');
  const [bonusMinutes, setBonusMinutes] = useState(0);
  const [concurrency, setConcurrency] = useState(2);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (account) {
      setEditPlanId(account.planId);
      setEditStatus(account.status);
      setBonusMinutes(0);
      setConcurrency(account.concurrencyLimit);
      setReason('');
    }
  }, [account]);

  const handleSaveSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account) return;
    if (!reason.trim()) {
      toast.error('Audit reason is required for administrative updates');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/business/admin/accounts/${account.tenantId}/subscription`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: editPlanId,
          status: editStatus,
          bonusMinutesDelta: Number(bonusMinutes),
          concurrencyLimit: Number(concurrency),
          reason: reason.trim(),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || `Update failed with status ${res.status}`);
      }

      toast.success(`Updated subscription for ${account.organizationName}`);
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update subscription');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Account Control: {account?.organizationName}</DialogTitle>
          <DialogDescription>
            Adjust subscription tier, voice minute credits, and concurrent line capacity.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSaveSubscription} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="plan" className="text-xs font-medium">Subscription Plan</Label>
            <Select value={editPlanId} onValueChange={setEditPlanId}>
              <SelectTrigger id="plan" className="text-xs">
                <SelectValue placeholder="Select plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="starter">Starter Plan ($99/mo &middot; 250 min &middot; 2 lines)</SelectItem>
                <SelectItem value="professional">Professional Plan ($299/mo &middot; 1,000 min &middot; 5 lines)</SelectItem>
                <SelectItem value="enterprise">Enterprise Plan ($799/mo &middot; 3,500 min &middot; 20 lines)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="status" className="text-xs font-medium">Account Status</Label>
              <Select value={editStatus} onValueChange={(v) => setEditStatus(v as SubscriptionStatus)}>
                <SelectTrigger id="status" className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="trialing">Trialing</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="canceled">Canceled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="concurrency" className="text-xs font-medium">Concurrent Lines</Label>
              <Input
                id="concurrency"
                type="number"
                min={1}
                max={50}
                value={concurrency}
                onChange={(e) => setConcurrency(Number(e.target.value))}
                className="text-xs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bonus" className="text-xs font-medium">Add Bonus Voice Minutes</Label>
            <Input
              id="bonus"
              type="number"
              min={0}
              placeholder="0"
              value={bonusMinutes}
              onChange={(e) => setBonusMinutes(Number(e.target.value))}
              className="text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Instantly credits emergency minutes to the organization&apos;s current period.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reason" className="text-xs font-medium">
              Administrative Audit Reason <span className="text-destructive">*</span>
            </Label>
            <Input
              id="reason"
              required
              placeholder="e.g. Sales upgrade to Pro plan; added 200 courtesy minutes"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="text-xs"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
