import { Hono } from 'hono';
import {
  getClientSubscriptionOverview,
  getAvailablePlans,
} from '../services/subscription.service';

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
