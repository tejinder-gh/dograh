import { Hono } from 'hono';
import { requirePlatformAdmin } from '../middleware/auth.middleware';
import { AnalyticsTimeFilterSchema } from '../domain/analytics.types';
import {
  getPlatformOverviewDashboard,
  formatClientPortfolioCsv,
} from '../services/platform-analytics.service';

export const adminAnalyticsRouter = new Hono();

// Enforce platform administrator privileges for all subroutes
adminAnalyticsRouter.use('*', requirePlatformAdmin);

adminAnalyticsRouter.get('/overview', async (c) => {
  const query = c.req.query();
  const parsed = AnalyticsTimeFilterSchema.safeParse(query);
  if (!parsed.success) {
    return c.json({ error: 'Invalid query parameters', details: parsed.error.errors }, 400);
  }

  try {
    const data = await getPlatformOverviewDashboard(parsed.data);
    return c.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve platform analytics';
    return c.json({ error: message }, 500);
  }
});

adminAnalyticsRouter.get('/export', async (c) => {
  const query = c.req.query();
  const parsed = AnalyticsTimeFilterSchema.safeParse(query);
  if (!parsed.success) {
    return c.json({ error: 'Invalid query parameters', details: parsed.error.errors }, 400);
  }

  try {
    const data = await getPlatformOverviewDashboard(parsed.data);
    const csv = formatClientPortfolioCsv(data.clientPortfolio);

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="platform-portfolio-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to export platform portfolio CSV';
    return c.json({ error: message }, 500);
  }
});
