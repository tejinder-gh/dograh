import { query } from '../db/connection';
import { PlanTier, SubscriptionEntitlement, ToolCategory } from '../types/marketplace.types';

const TIER_HIERARCHY: Record<PlanTier, number> = {
  starter: 0,
  standard: 1,
  growth: 2,
  enterprise: 3,
};

export class EntitlementError extends Error {
  public code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'EntitlementError';
    this.code = code;
  }
}

export class EntitlementService {
  /**
   * Retrieves or lazily creates default subscription entitlement for a tenant.
   */
  static async getEntitlement(tenantId: string): Promise<SubscriptionEntitlement> {
    const res = await query<SubscriptionEntitlement>(
      `SELECT 
        id, 
        tenant_id as "tenantId", 
        plan_tier as "planTier", 
        allowed_categories as "allowedCategories", 
        max_active_tools as "maxActiveTools", 
        max_executions_per_month as "maxExecutionsPerMonth", 
        current_cycle_executions as "currentCycleExecutions", 
        billing_cycle_start as "billingCycleStart", 
        billing_cycle_end as "billingCycleEnd", 
        is_suspended as "isSuspended", 
        overage_allowed as "overageAllowed", 
        overage_rate_cents as "overageRateCents", 
        created_at as "createdAt", 
        updated_at as "updatedAt"
      FROM subscription_entitlements 
      WHERE tenant_id = $1`,
      [tenantId]
    );

    if (res.rows[0]) {
      return res.rows[0];
    }

    // Default to starter tier if not explicitly seeded
    const insertRes = await query<SubscriptionEntitlement>(
      `INSERT INTO subscription_entitlements (
        tenant_id, plan_tier, allowed_categories, max_active_tools, max_executions_per_month
      ) VALUES (
        $1, 'starter', ARRAY['scheduling', 'crm', 'communication', 'operations'], 5, 2000
      )
      ON CONFLICT (tenant_id) DO UPDATE SET updated_at = NOW()
      RETURNING 
        id, 
        tenant_id as "tenantId", 
        plan_tier as "planTier", 
        allowed_categories as "allowedCategories", 
        max_active_tools as "maxActiveTools", 
        max_executions_per_month as "maxExecutionsPerMonth", 
        current_cycle_executions as "currentCycleExecutions", 
        billing_cycle_start as "billingCycleStart", 
        billing_cycle_end as "billingCycleEnd", 
        is_suspended as "isSuspended", 
        overage_allowed as "overageAllowed", 
        overage_rate_cents as "overageRateCents", 
        created_at as "createdAt", 
        updated_at as "updatedAt"`,
      [tenantId]
    );

    return insertRes.rows[0]!;
  }

  /**
   * Pure evaluation of entitlement rules against a subscription state.
   * Enables comprehensive, deterministic unit testing without database dependency.
   */
  static checkEntitlement(
    entitlement: SubscriptionEntitlement,
    toolCategory: ToolCategory,
    minPlanTier: PlanTier
  ): { allowed: boolean; isOverage: boolean } {
    // 1. Suspension Check
    if (entitlement.isSuspended) {
      throw new EntitlementError(
        `[ENTITLEMENT] Tenant subscription is suspended due to billing or compliance status. Tool executions blocked.`,
        'SUBSCRIPTION_SUSPENDED'
      );
    }

    // 2. Plan Tier Hierarchy Check
    const tenantTierLevel = TIER_HIERARCHY[entitlement.planTier] ?? 0;
    const requiredTierLevel = TIER_HIERARCHY[minPlanTier] ?? 0;

    if (tenantTierLevel < requiredTierLevel) {
      throw new EntitlementError(
        `[ENTITLEMENT] Tool requires "${minPlanTier}" plan or higher. Current tenant tier: "${entitlement.planTier}".`,
        'TIER_INSUFFICIENT'
      );
    }

    // 3. Category Permission Check
    const allowed = entitlement.allowedCategories || [];
    if (!allowed.includes(toolCategory)) {
      throw new EntitlementError(
        `[ENTITLEMENT] Category "${toolCategory}" is not enabled under your subscription package.`,
        'CATEGORY_DISALLOWED'
      );
    }

    // 4. Monthly Execution Quota Check
    const isExceeded = entitlement.currentCycleExecutions >= entitlement.maxExecutionsPerMonth;
    if (isExceeded && !entitlement.overageAllowed) {
      throw new EntitlementError(
        `[ENTITLEMENT] Monthly execution quota reached (${entitlement.currentCycleExecutions}/${entitlement.maxExecutionsPerMonth}). Upgrade plan or enable overage.`,
        'QUOTA_EXHAUSTED'
      );
    }

    return {
      allowed: true,
      isOverage: isExceeded,
    };
  }

  /**
   * Atomically verifies entitlement and reserves execution quota in a single statement.
   * Guarantees concurrency safety against quota over-subscription.
   */
  static async reserveExecutionQuota(
    tenantId: string,
    toolCategory: ToolCategory,
    minPlanTier: PlanTier
  ): Promise<{ allowed: boolean; isOverage: boolean; entitlement: SubscriptionEntitlement }> {
    const entitlement = await this.getEntitlement(tenantId);
    this.checkEntitlement(entitlement, toolCategory, minPlanTier);

    const res = await query<SubscriptionEntitlement>(
      `UPDATE subscription_entitlements
       SET current_cycle_executions = current_cycle_executions + 1,
           updated_at = NOW()
       WHERE tenant_id = $1
         AND is_suspended = false
         AND (
           overage_allowed = true
           OR current_cycle_executions < max_executions_per_month
         )
       RETURNING 
         id, 
         tenant_id as "tenantId", 
         plan_tier as "planTier", 
         allowed_categories as "allowedCategories", 
         max_active_tools as "maxActiveTools", 
         max_executions_per_month as "maxExecutionsPerMonth", 
         current_cycle_executions as "currentCycleExecutions", 
         billing_cycle_start as "billingCycleStart", 
         billing_cycle_end as "billingCycleEnd", 
         is_suspended as "isSuspended", 
         overage_allowed as "overageAllowed", 
         overage_rate_cents as "overageRateCents"`,
      [tenantId]
    );

    if (res.rows.length === 0) {
      const latest = await this.getEntitlement(tenantId);
      if (latest.isSuspended) {
        throw new EntitlementError(
          '[ENTITLEMENT] Tenant subscription is suspended due to billing status. Tool executions blocked.',
          'SUBSCRIPTION_SUSPENDED'
        );
      }
      throw new EntitlementError(
        `[ENTITLEMENT] Monthly execution quota reached (${latest.currentCycleExecutions}/${latest.maxExecutionsPerMonth}). Upgrade plan or enable overage.`,
        'QUOTA_EXHAUSTED'
      );
    }

    const updated = res.rows[0];
    const isOverage = updated.currentCycleExecutions > updated.maxExecutionsPerMonth;

    return {
      allowed: true,
      isOverage,
      entitlement: updated,
    };
  }

  /**
   * Reconciles or releases execution quota when execution fails before provider dispatch.
   */
  static async releaseExecutionReservation(tenantId: string): Promise<void> {
    await query(
      `UPDATE subscription_entitlements
       SET current_cycle_executions = GREATEST(0, current_cycle_executions - 1),
           updated_at = NOW()
       WHERE tenant_id = $1`,
      [tenantId]
    );
  }

  /**
   * Verifies that the tenant is entitled to install/execute the given tool.
   */
  static async verifyExecutionEntitlement(
    tenantId: string,
    toolCategory: ToolCategory,
    minPlanTier: PlanTier
  ): Promise<{ allowed: boolean; isOverage: boolean; entitlement: SubscriptionEntitlement }> {
    return this.reserveExecutionQuota(tenantId, toolCategory, minPlanTier);
  }

  /**
   * Records execution usage ledger entry in tool_usage_records.
   */
  static async recordExecutionUsage(params: {
    tenantId: string;
    agentId?: string;
    toolId: string;
    costCents: number;
  }): Promise<void> {
    const currentPeriod = new Date().toISOString().substring(0, 7); // e.g. "2026-10"

    // Record ledger entry in tool_usage_records
    await query(
      `INSERT INTO tool_usage_records (
        tenant_id, agent_id, tool_id, billing_period, units_consumed, cost_cents
      ) VALUES ($1, $2, $3, $4, 1, $5)`,
      [params.tenantId, params.agentId || null, params.toolId, currentPeriod, params.costCents]
    );
  }

  /**
   * Updates plan tier and resets quota boundaries.
   */
  static async updatePlanTier(tenantId: string, newTier: PlanTier): Promise<SubscriptionEntitlement> {
    const tierLimits: Record<PlanTier, { tools: number; executions: number; overage: boolean }> = {
      starter: { tools: 5, executions: 2000, overage: false },
      standard: { tools: 15, executions: 10000, overage: true },
      growth: { tools: 30, executions: 50000, overage: true },
      enterprise: { tools: 100, executions: 250000, overage: true },
    };

    const config = tierLimits[newTier] || tierLimits.starter;

    const res = await query<SubscriptionEntitlement>(
      `UPDATE subscription_entitlements 
       SET 
         plan_tier = $2, 
         max_active_tools = $3, 
         max_executions_per_month = $4, 
         overage_allowed = $5,
         updated_at = NOW()
       WHERE tenant_id = $1
       RETURNING 
        id, 
        tenant_id as "tenantId", 
        plan_tier as "planTier", 
        allowed_categories as "allowedCategories", 
        max_active_tools as "maxActiveTools", 
        max_executions_per_month as "maxExecutionsPerMonth", 
        current_cycle_executions as "currentCycleExecutions", 
        billing_cycle_start as "billingCycleStart", 
        billing_cycle_end as "billingCycleEnd", 
        is_suspended as "isSuspended", 
        overage_allowed as "overageAllowed", 
        overage_rate_cents as "overageRateCents", 
        created_at as "createdAt", 
        updated_at as "updatedAt"`,
      [tenantId, newTier, config.tools, config.executions, config.overage]
    );

    return res.rows[0]!;
  }
}
