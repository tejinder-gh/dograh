import type { Context, Next } from 'hono';
import { env } from '../config/env';
import { resolveTenantContext } from '../services/tenant-mapping.service';
import type { TenantContext } from '../domain/tenant-mapping.types';

declare module 'hono' {
  interface ContextVariableMap {
    tenantContext: TenantContext;
  }
}

export async function authMiddleware(c: Context, next: Next): Promise<Response | void> {
  // 1. Verify internal extension secret
  const secretHeader = c.req.header('X-Extension-Secret');
  if (!secretHeader || secretHeader !== env.BUSINESS_EXT_SECRET) {
    return c.json({ error: 'Unauthorized: Invalid or missing extension service secret' }, 401);
  }

  // 2. Extract verified Dograh organization ID
  const orgIdHeader = c.req.header('X-Dograh-Organization-Id');
  if (!orgIdHeader) {
    return c.json({ error: 'Bad Request: Missing X-Dograh-Organization-Id header' }, 400);
  }

  const dograhOrgId = parseInt(orgIdHeader, 10);
  if (isNaN(dograhOrgId) || dograhOrgId <= 0) {
    return c.json({ error: 'Bad Request: Invalid X-Dograh-Organization-Id' }, 400);
  }

  // 3. Optional deployment ID
  const deploymentId = c.req.header('X-Dograh-Deployment-Id') || env.DOGRAH_DEPLOYMENT_ID;

  try {
    const tenantCtx = await resolveTenantContext(dograhOrgId, deploymentId);
    c.set('tenantContext', tenantCtx);
    await next();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Authentication failed';
    return c.json({ error: `Tenant resolution failed: ${message}` }, 403);
  }
}
