import { Hono } from 'hono';
import { AnalyticsTimeFilterSchema } from '../domain/analytics.types';
import {
  getClientOverviewDashboard,
  formatClientMetricsCsv,
} from '../services/client-analytics.service';

export const analyticsRouter = new Hono();

analyticsRouter.get('/overview', async (c) => {
  const tenantCtx = c.get('tenantContext');
  if (!tenantCtx) {
    return c.json({ error: 'Tenant context required' }, 401);
  }

  const query = c.req.query();
  const parsed = AnalyticsTimeFilterSchema.safeParse(query);
  if (!parsed.success) {
    return c.json({ error: 'Invalid query parameters', details: parsed.error.errors }, 400);
  }

  try {
    const data = await getClientOverviewDashboard(
      tenantCtx.businessTenantId,
      tenantCtx.acuityOrganizationId,
      parsed.data
    );
    return c.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve client analytics';
    return c.json({ error: message }, 500);
  }
});

analyticsRouter.get('/export', async (c) => {
  const tenantCtx = c.get('tenantContext');
  if (!tenantCtx) {
    return c.json({ error: 'Tenant context required' }, 401);
  }

  const query = c.req.query();
  const parsed = AnalyticsTimeFilterSchema.safeParse(query);
  if (!parsed.success) {
    return c.json({ error: 'Invalid query parameters', details: parsed.error.errors }, 400);
  }

  try {
    const data = await getClientOverviewDashboard(
      tenantCtx.businessTenantId,
      tenantCtx.acuityOrganizationId,
      parsed.data
    );
    const csv = formatClientMetricsCsv(data);

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="client-analytics-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to export analytics CSV';
    return c.json({ error: message }, 500);
  }
});
