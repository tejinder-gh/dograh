import type { Context, Next } from 'hono';
import { env } from '../config/env';
import { resolveTenantContext } from '../services/tenant-mapping.service';
import { verifyOrganizationActive, verifyUserOrganizationMembership } from '../adapters/acuity-api.adapter';
import {
  verifyInternalAssertion,
  consumeNonce,
  type InternalAssertionPayload,
} from '../config/signed-assertion';
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

  // 2. Clone request stream to read raw body for cryptographic request-binding without consuming it
  let rawBody = '';
  try {
    const method = c.req.method.toUpperCase();
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      const cloned = c.req.raw.clone();
      rawBody = await cloned.text();
    }
  } catch {
    rawBody = '';
  }

  const parsedUrl = new URL(c.req.url);
  const requestUri = parsedUrl.search ? `${parsedUrl.pathname}${parsedUrl.search}` : parsedUrl.pathname;

  // 3. Validate signature, deployment, expiry, and cryptographic request binding (method, uri, body)
  let payload: InternalAssertionPayload;
  try {
    payload = verifyInternalAssertion({
      assertion: assertionHeader,
      secret: env.BUSINESS_EXT_SECRET,
      expectedDeploymentId: env.ACUITY_DEPLOYMENT_ID || env.Acuity_DEPLOYMENT_ID,
      expectedMethod: c.req.method,
      expectedPath: requestUri,
      expectedBody: rawBody,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid assertion';
    return c.json({ error: `Unauthorized: ${message}` }, 401);
  }

  // 4. Atomic shared replay prevention across multiple workers/replicas (fails closed)
  try {
    const nonceAccepted = await consumeNonce(payload.nonce, payload.exp);
    if (!nonceAccepted) {
      return c.json({ error: 'Unauthorized: Replay detected: Assertion nonce has already been consumed' }, 401);
    }
  } catch (error) {
    console.error('Replay protection store unavailable:', error);
    return c.json({ error: 'Service Unavailable: Replay protection store is unavailable' }, 503);
  }

  // 5. Verify organization exists and is active in Acuity authoritative database
  const isActive = await verifyOrganizationActive(payload.org);
  if (!isActive) {
    return c.json({ error: 'Forbidden: Organization does not exist or is inactive' }, 403);
  }

  // 6. Verify user membership in organization (defends against revoked membership or stale selection)
  const isMember = await verifyUserOrganizationMembership(payload.sub, payload.org);
  if (!isMember) {
    return c.json({ error: 'Forbidden: User is not an active member of the specified organization' }, 403);
  }

  // 7. Resolve durable tenant mapping using authoritative deployment and verified org ID
  try {
    const tenantCtx = await resolveTenantContext(payload.org, payload.dep);
    c.set('tenantContext', {
      ...tenantCtx,
      isPlatformAdmin: Boolean(payload.isAdm),
    });
    c.set('verifiedUserId', payload.sub);
    await next();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Authentication failed';
    return c.json({ error: `Tenant resolution failed: ${message}` }, 403);
  }
}

export async function requirePlatformAdmin(c: Context, next: Next): Promise<Response | void> {
  const ctx = c.get('tenantContext');
  if (!ctx || !ctx.isPlatformAdmin) {
    return c.json({ error: 'Forbidden: Platform administrator privileges required' }, 403);
  }
  await next();
}
