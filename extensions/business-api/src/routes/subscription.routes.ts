import { Hono } from 'hono';
import { z } from 'zod';
import {
  getClientSubscriptionOverview,
  getAvailablePlans,
  clientUpgradeSubscription,
  clientTopUpMinutes,
} from '../services/subscription.service';

const UpgradeSchema = z.object({
  planId: z.string().min(1),
  paymentTransactionId: z.string().optional(),
});

const TopUpSchema = z.object({
  minutes: z.number().int().positive(),
  paymentTransactionId: z.string().optional(),
  notes: z.string().optional(),
});

export const subscriptionRouter = new Hono();

subscriptionRouter.get('/', async (c) => {
  const tenantContext = c.get('tenantContext');
  if (!tenantContext) {
    return c.json({ error: 'Tenant context required' }, 400);
  }

  try {
    const overview = await getClientSubscriptionOverview(tenantContext);
    return c.json(overview);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve subscription overview';
    return c.json({ error: message }, 500);
  }
});

subscriptionRouter.get('/plans', async (c) => {
  try {
    const plans = await getAvailablePlans();
    return c.json(plans);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve subscription plans';
    return c.json({ error: message }, 500);
  }
});

subscriptionRouter.post('/upgrade', async (c) => {
  const tenantContext = c.get('tenantContext');
  if (!tenantContext) {
    return c.json({ error: 'Tenant context required' }, 400);
  }

  // Final P0 Security Correction: A client-supplied paymentTransactionId is not proof of payment.
  // Until direct server-to-payment-gateway (Stripe/Razorpay) webhook verification is active,
  // customer-facing self-service upgrades are disabled to prevent unearned entitlements.
  // Commercial pilot entitlements are granted via audited platform admin controls.
  return c.json(
    {
      error:
        'Self-service plan upgrades are disabled pending direct payment gateway integration. Pilot entitlements must be provisioned via platform administration.',
      code: 'self_serve_billing_disabled',
    },
    403
  );
});

subscriptionRouter.post('/topup', async (c) => {
  const tenantContext = c.get('tenantContext');
  if (!tenantContext) {
    return c.json({ error: 'Tenant context required' }, 400);
  }

  // Final P0 Security Correction: A client-supplied paymentTransactionId is not proof of payment.
  // Customer-facing self-service balance top-ups are disabled until direct payment gateway
  // authorization is wired. Pilot minute grants must be provisioned via platform administration.
  return c.json(
    {
      error:
        'Self-service minute top-ups are disabled pending direct payment gateway integration. Pilot minute grants must be provisioned via platform administration.',
      code: 'self_serve_billing_disabled',
    },
    403
  );
});

