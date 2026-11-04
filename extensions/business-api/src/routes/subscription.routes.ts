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
});

const TopUpSchema = z.object({
  minutes: z.number().int().positive(),
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

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = UpgradeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.errors }, 400);
  }

  try {
    const overview = await clientUpgradeSubscription(tenantContext, parsed.data.planId);
    return c.json(overview);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to upgrade subscription';
    return c.json({ error: message }, 400);
  }
});

subscriptionRouter.post('/topup', async (c) => {
  const tenantContext = c.get('tenantContext');
  if (!tenantContext) {
    return c.json({ error: 'Tenant context required' }, 400);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = TopUpSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.errors }, 400);
  }

  try {
    const overview = await clientTopUpMinutes(
      tenantContext,
      parsed.data.minutes,
      parsed.data.notes
    );
    return c.json(overview);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to top up subscription minutes';
    return c.json({ error: message }, 400);
  }
});

