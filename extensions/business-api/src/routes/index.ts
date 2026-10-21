import { Hono } from 'hono';
import { healthRoutes } from './health.routes';
import { businessProfileRoutes } from './business-profile.routes';
import { crmRoutes } from './crm.routes';
import { analyticsRouter } from './analytics.routes';
import { adminAnalyticsRouter } from './admin-analytics.routes';
import { authMiddleware } from '../middleware/auth.middleware';

export const apiRouter = new Hono();

// Unauthenticated health endpoint
apiRouter.route('/', healthRoutes);

// Protected business routes requiring organization context
const protectedRouter = new Hono();
protectedRouter.use('*', authMiddleware);

protectedRouter.route('/business-profiles', businessProfileRoutes);
protectedRouter.route('/analytics', analyticsRouter);
protectedRouter.route('/admin/analytics', adminAnalyticsRouter);
protectedRouter.route('/', crmRoutes);

apiRouter.route('/api', protectedRouter);

