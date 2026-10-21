import React from 'react';
import { CreditCard, Zap, CheckCircle2, AlertTriangle, ArrowUpRight, BarChart2 } from 'lucide-react';
import { SubscriptionEntitlement } from '../../types/marketplace.types';

interface UsageBillingViewProps {
  entitlement: SubscriptionEntitlement | null;
  usageSummary: {
    billingPeriod: string;
    totalExecutions: number;
    totalCostCents: number;
    breakdownByTool: Array<{ toolName: string; units: number; costCents: number }>;
  } | null;
}

export const UsageBillingView: React.FC<UsageBillingViewProps> = ({
  entitlement,
  usageSummary,
}) => {
  const currentExecutions = entitlement?.currentCycleExecutions || usageSummary?.totalExecutions || 0;
  const maxExecutions = entitlement?.maxExecutionsPerMonth || 2000;
  const percentage = Math.min(100, Math.round((currentExecutions / maxExecutions) * 100));

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-bold text-slate-900">Subscription & Quota Management</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Server-enforced execution limits, plan tiers, and consumption metering.
        </p>
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Tier Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Subscription Tier</span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-indigo-50 text-indigo-700 border border-indigo-200">
              {entitlement?.planTier || 'Starter'}
            </span>
          </div>
          <div className="my-4">
            <h4 className="text-2xl font-black text-slate-900 capitalize">
              {entitlement?.planTier || 'Starter'} Plan
            </h4>
            <p className="text-xs text-slate-500 mt-1">
              Max {entitlement?.maxActiveTools || 5} active tools • {maxExecutions.toLocaleString()} calls/mo
            </p>
          </div>
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500">Status</span>
            <span
              className={`font-semibold flex items-center gap-1 ${
                entitlement?.isSuspended ? 'text-rose-600' : 'text-emerald-600'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {entitlement?.isSuspended ? 'Suspended' : 'Active & Compliant'}
            </span>
          </div>
        </div>

        {/* Quota Consumption Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Monthly Tool Quota</span>
            <span className="text-xs font-semibold text-slate-700">{percentage}% Consumed</span>
          </div>
          <div className="my-4">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-slate-900">{currentExecutions.toLocaleString()}</span>
              <span className="text-xs text-slate-400">/ {maxExecutions.toLocaleString()} calls</span>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-slate-100 h-2.5 rounded-full mt-3 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  percentage > 90 ? 'bg-rose-500' : percentage > 75 ? 'bg-amber-500' : 'bg-indigo-600'
                }`}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500">Overage Policy</span>
            <span className="font-semibold text-slate-700">
              {entitlement?.overageAllowed ? `Allowed (${entitlement.overageRateCents}¢/call)` : 'Strict Hard Limit'}
            </span>
          </div>
        </div>

        {/* Billed Costs Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Usage Incurred</span>
            <CreditCard className="w-4 h-4 text-slate-400" />
          </div>
          <div className="my-4">
            <h4 className="text-2xl font-black text-slate-900">
              ${((usageSummary?.totalCostCents || 0) / 100).toFixed(2)}
            </h4>
            <p className="text-xs text-slate-500 mt-1">Period: {usageSummary?.billingPeriod || 'Current'}</p>
          </div>
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500">Cycle End</span>
            <span className="font-mono text-slate-700">
              {entitlement?.billingCycleEnd ? new Date(entitlement.billingCycleEnd).toLocaleDateString() : 'In 30 days'}
            </span>
          </div>
        </div>
      </div>

      {/* Breakdown Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h4 className="text-sm font-bold text-slate-900">Tool Consumption Ledger</h4>
          <span className="text-xs font-mono text-slate-500">Period: {usageSummary?.billingPeriod}</span>
        </div>

        {(!usageSummary?.breakdownByTool || usageSummary.breakdownByTool.length === 0) ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No tool executions logged for the current billing cycle yet.
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold">
              <tr>
                <th className="py-3 px-5">Tool Name</th>
                <th className="py-3 px-5 text-right">Invocations</th>
                <th className="py-3 px-5 text-right">Metered Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {usageSummary.breakdownByTool.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50">
                  <td className="py-3 px-5 font-bold text-slate-900">{item.toolName}</td>
                  <td className="py-3 px-5 text-right font-mono text-slate-700">{item.units.toLocaleString()}</td>
                  <td className="py-3 px-5 text-right font-mono text-slate-900">
                    ${(item.costCents / 100).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
