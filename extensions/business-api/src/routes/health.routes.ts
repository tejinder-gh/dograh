import { Hono } from 'hono';
import { query } from '../config/database';

export const healthRoutes = new Hono();

healthRoutes.get('/health', async (c) => {
  try {
    const dbRes = await query('SELECT 1 as healthy');
    const isDbHealthy = dbRes.rows.length > 0;
    return c.json({
      status: isDbHealthy ? 'ok' : 'degraded',
      service: 'business-extension-api',
      timestamp: new Date().toISOString(),
      database: isDbHealthy ? 'connected' : 'disconnected',
    });
  } catch (error) {
    return c.json(
      {
        status: 'error',
        service: 'business-extension-api',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Database check failed',
      },
      503
    );
  }
});
