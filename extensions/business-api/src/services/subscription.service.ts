import type { TenantContext } from '../domain/tenant-mapping.types';
import type {
  ClientSubscriptionOverview,
  AdminUpdateSubscriptionRequest,
  AdminClientAccountRow,
  SubscriptionPlan,
} from '../domain/subscription.types';
import {
  ensureDefaultSubscription,
  listActivePlans,
  calculatePeriodMinutesUsed,
  getActiveAgentsCount,
  updateSubscription,
  insertAccountControlLog,
  listAllClientAccounts,
  getPlanById,
  getSubscriptionWithPlan,
} from '../repositories/subscription.repository';

export async function getClientSubscriptionOverview(
  tenantContext: TenantContext
): Promise<ClientSubscriptionOverview> {
  const { subscription, plan } = await ensureDefaultSubscription(tenantContext.businessTenantId);
  const availablePlans = await listActivePlans();

  const periodStart = new Date(subscription.currentPeriodStart);
  const periodEnd = new Date(subscription.currentPeriodEnd);

  const [usage, activeAgentsCount] = await Promise.all([
    calculatePeriodMinutesUsed(tenantContext.acuityOrganizationId, periodStart, periodEnd),
    getActiveAgentsCount(tenantContext.acuityOrganizationId),
  ]);

  const totalAllocatedMinutes = subscription.includedMinutes + subscription.bonusMinutes;
  const remainingMinutes = Math.max(0, totalAllocatedMinutes - usage.totalMinutes);
  const usagePercentage =
    totalAllocatedMinutes > 0
      ? Math.min(100, Math.round((usage.totalMinutes / totalAllocatedMinutes) * 100))
      : 0;

  return {
    tenantId: tenantContext.businessTenantId,
    plan,
    status: subscription.status,
    billingInterval: subscription.billingInterval,
    currentPeriodStart: subscription.currentPeriodStart,
    currentPeriodEnd: subscription.currentPeriodEnd,
    includedMinutes: subscription.includedMinutes,
    bonusMinutes: subscription.bonusMinutes,
    totalAllocatedMinutes,
    usedMinutes: usage.totalMinutes,
    remainingMinutes,
    usagePercentage,
    concurrencyLimit: subscription.concurrencyLimit,
    activeAgentsCount,
    availablePlans,
  };
}

export async function adminUpdateSubscription(
  tenantId: string,
  adminUserId: string,
  request: AdminUpdateSubscriptionRequest
): Promise<ClientSubscriptionOverview> {
  const current = await getSubscriptionWithPlan(tenantId);
  if (!current) {
    throw new Error(`Subscription not found for tenant ${tenantId}`);
  }

  let newPlan = current.plan;
  let includedMinutes = current.subscription.includedMinutes;
  let concurrencyLimit = request.concurrencyLimit ?? current.subscription.concurrencyLimit;

  if (request.planId && request.planId !== current.subscription.planId) {
    const loadedPlan = await getPlanById(request.planId);
    if (!loadedPlan) {
      throw new Error(`Plan '${request.planId}' does not exist`);
    }
    newPlan = loadedPlan;
    includedMinutes = loadedPlan.includedVoiceMinutes;
    if (!request.concurrencyLimit) {
      concurrencyLimit = loadedPlan.maxConcurrentCalls;
    }
  }

  const updatedSubscription = await updateSubscription(tenantId, {
    planId: request.planId,
    status: request.status,
    includedMinutes: request.planId ? includedMinutes : undefined,
    bonusMinutesDelta: request.bonusMinutesDelta,
    concurrencyLimit: request.concurrencyLimit ? concurrencyLimit : undefined,
    notes: request.notes,
  });

  await insertAccountControlLog(
    tenantId,
    adminUserId,
    'admin_update_subscription',
    {
      planId: current.subscription.planId,
      status: current.subscription.status,
      includedMinutes: current.subscription.includedMinutes,
      bonusMinutes: current.subscription.bonusMinutes,
      concurrencyLimit: current.subscription.concurrencyLimit,
    },
    {
      planId: updatedSubscription.planId,
      status: updatedSubscription.status,
      includedMinutes: updatedSubscription.includedMinutes,
      bonusMinutes: updatedSubscription.bonusMinutes,
      concurrencyLimit: updatedSubscription.concurrencyLimit,
    },
    request.reason
  );

  const availablePlans = await listActivePlans();
  const totalAllocatedMinutes = updatedSubscription.includedMinutes + updatedSubscription.bonusMinutes;

  return {
    tenantId,
    plan: newPlan,
    status: updatedSubscription.status,
    billingInterval: updatedSubscription.billingInterval,
    currentPeriodStart: updatedSubscription.currentPeriodStart,
    currentPeriodEnd: updatedSubscription.currentPeriodEnd,
    includedMinutes: updatedSubscription.includedMinutes,
    bonusMinutes: updatedSubscription.bonusMinutes,
    totalAllocatedMinutes,
    usedMinutes: 0,
    remainingMinutes: totalAllocatedMinutes,
    usagePercentage: 0,
    concurrencyLimit: updatedSubscription.concurrencyLimit,
    activeAgentsCount: 0,
    availablePlans,
  };
}

export async function getAdminAccountsList(): Promise<AdminClientAccountRow[]> {
  return listAllClientAccounts();
}

export async function getAvailablePlans(): Promise<SubscriptionPlan[]> {
  return listActivePlans();
}

export async function clientUpgradeSubscription(
  tenantContext: TenantContext,
  targetPlanId: string
): Promise<ClientSubscriptionOverview> {
  const current = await getSubscriptionWithPlan(tenantContext.businessTenantId);
  if (!current) {
    throw new Error(`Subscription not found for tenant ${tenantContext.businessTenantId}`);
  }

  const targetPlan = await getPlanById(targetPlanId);
  if (!targetPlan) {
    throw new Error(`Plan '${targetPlanId}' does not exist`);
  }

  const updatedSubscription = await updateSubscription(tenantContext.businessTenantId, {
    planId: targetPlan.id,
    includedMinutes: targetPlan.includedVoiceMinutes,
    concurrencyLimit: targetPlan.maxConcurrentCalls,
  });

  await insertAccountControlLog(
    tenantContext.businessTenantId,
    `client_org_${tenantContext.acuityOrganizationId}`,
    'client_self_serve_upgrade',
    {
      planId: current.subscription.planId,
      includedMinutes: current.subscription.includedMinutes,
      concurrencyLimit: current.subscription.concurrencyLimit,
    },
    {
      planId: updatedSubscription.planId,
      includedMinutes: updatedSubscription.includedMinutes,
      concurrencyLimit: updatedSubscription.concurrencyLimit,
    },
    `Self-service plan upgrade to ${targetPlan.name}`
  );

  return getClientSubscriptionOverview(tenantContext);
}

export async function clientTopUpMinutes(
  tenantContext: TenantContext,
  minutes: number,
  notes = 'Self-service minute top-up'
): Promise<ClientSubscriptionOverview> {
  if (!minutes || minutes <= 0) {
    throw new Error('Top-up minutes must be greater than zero');
  }

  const current = await getSubscriptionWithPlan(tenantContext.businessTenantId);
  if (!current) {
    throw new Error(`Subscription not found for tenant ${tenantContext.businessTenantId}`);
  }

  const updatedSubscription = await updateSubscription(tenantContext.businessTenantId, {
    bonusMinutesDelta: minutes,
  });

  await insertAccountControlLog(
    tenantContext.businessTenantId,
    `client_org_${tenantContext.acuityOrganizationId}`,
    'client_credit_topup',
    {
      bonusMinutes: current.subscription.bonusMinutes,
    },
    {
      bonusMinutes: updatedSubscription.bonusMinutes,
      addedMinutes: minutes,
    },
    notes
  );

  return getClientSubscriptionOverview(tenantContext);
}

