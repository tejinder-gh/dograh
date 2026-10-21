import type { Context, Next } from 'hono';
import { env } from '../config/env';
import { resolveTenantContext } from '../services/tenant-mapping.service';
import { verifyOrganizationActive, verifyUserOrganizationMembership } from '../adapters/dograh-api.adapter';
import { verifyInternalAssertion, type InternalAssertionPayload } from '../config/signed-assertion';
import type { TenantContext } from '../domain/tenant-mapping.types';

declare module 'hono' {
  interface ContextVariableMap {
    tenantContext: TenantContext;
    verifiedUserId: string;
  }
}

export async function authMiddleware(c: Context, next: Next): Promise<Response | void> {
  // 1. Require X-Internal-Assertion header
  const assertionHeader = c.req.header('X-Internal-Assertion');
  if (!assertionHeader) {
    return c.json({ error: 'Unauthorized: Missing internal service assertion' }, 401);
  }

  // 2. Validate cryptographic signature, audience, deployment, timestamp, and replay protection
  let payload: InternalAssertionPayload;
  try {
    payload = verifyInternalAssertion({
      assertion: assertionHeader,
      secret: env.BUSINESS_EXT_SECRET,
      expectedDeploymentId: env.DOGRAH_DEPLOYMENT_ID,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid assertion';
    return c.json({ error: `Unauthorized: ${message}` }, 401);
  }

  // 3. Verify organization exists and is active in Dograh authoritative database
  const isActive = await verifyOrganizationActive(payload.org);
  if (!isActive) {
    return c.json({ error: 'Forbidden: Organization does not exist or is inactive' }, 403);
  }

  // 4. Verify user membership in organization (defends against revoked membership or stale selection)
  const isMember = await verifyUserOrganizationMembership(payload.sub, payload.org);
  if (!isMember) {
    return c.json({ error: 'Forbidden: User is not an active member of the specified organization' }, 403);
  }

  // 5. Resolve durable tenant mapping using authoritative deployment and verified org ID
  try {
    const tenantCtx = await resolveTenantContext(payload.org, payload.dep);
    c.set('tenantContext', tenantCtx);
    c.set('verifiedUserId', payload.sub);
    await next();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Authentication failed';
    return c.json({ error: `Tenant resolution failed: ${message}` }, 403);
  }
}
