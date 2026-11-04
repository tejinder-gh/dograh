import { Hono } from 'hono';
import { requirePlatformAdmin } from '../middleware/auth.middleware';
import { AdminUpdateSubscriptionSchema } from '../domain/subscription.types';
import {
  getAdminAccountsList,
  adminUpdateSubscription,
} from '../services/subscription.service';

export const adminAccountsRouter = new Hono();

// Enforce platform superadmin privileges for all account control operations
adminAccountsRouter.use('*', requirePlatformAdmin);

adminAccountsRouter.get('/', async (c) => {
  try {
    const accounts = await getAdminAccountsList();
    return c.json(accounts);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve platform client accounts';
    return c.json({ error: message }, 500);
  }
});

adminAccountsRouter.patch('/:tenantId/subscription', async (c) => {
  const tenantId = c.req.param('tenantId');
  const verifiedUserId = c.get('verifiedUserId') || 'superadmin';

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = AdminUpdateSubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.errors }, 400);
  }

  try {
    const updated = await adminUpdateSubscription(tenantId, verifiedUserId, parsed.data);
    return c.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update organization subscription';
    return c.json({ error: message }, 500);
  }
});
