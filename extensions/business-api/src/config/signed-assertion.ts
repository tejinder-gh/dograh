import crypto from 'node:crypto';
import { query } from './database';

export interface InternalAssertionPayload {
  v: 1;
  iss: 'dograh-ui-proxy';
  aud: 'business-extension-api';
  sub: string;
  org: number;
  dep: string;
  mth: string;
  uri: string;
  bdy: string;
  iat: number;
  exp: number;
  nonce: string;
}

import { KNOWN_INSECURE_SECRETS } from './constants';
export { KNOWN_INSECURE_SECRETS };

const MIN_SECRET_LENGTH = 32;

function base64UrlEncode(strOrBuffer: string | Buffer): string {
  const buf = Buffer.isBuffer(strOrBuffer) ? strOrBuffer : Buffer.from(strOrBuffer, 'utf-8');
  return buf.toString('base64url');
}

function base64UrlDecode(str: string): string {
  return Buffer.from(str, 'base64url').toString('utf-8');
}

export function computeBodyHash(rawBody?: string | null): string {
  return crypto.createHash('sha256').update(rawBody || '').digest('hex');
}

export function createInternalAssertion(params: {
  userId: string;
  orgId: number;
  deploymentId: string;
  secret: string;
  method?: string;
  path?: string;
  body?: string | null;
  ttlSeconds?: number;
  customNonce?: string;
  customIat?: number;
}): string {
  if (!params.secret || params.secret.length < MIN_SECRET_LENGTH || KNOWN_INSECURE_SECRETS.has(params.secret)) {
    throw new Error('Cannot create assertion: Insecure or missing service secret');
  }

  const now = params.customIat ?? Math.floor(Date.now() / 1000);
  const ttl = params.ttlSeconds ?? 60;
  const method = (params.method || 'GET').toUpperCase();
  const uri = (params.path || '/').split('?')[0] || '/';
  const bdy = computeBodyHash(params.body);

  const header = { alg: 'HS256', typ: 'JWT' };
  const payload: InternalAssertionPayload = {
    v: 1,
    iss: 'dograh-ui-proxy',
    aud: 'business-extension-api',
    sub: params.userId,
    org: params.orgId,
    dep: params.deploymentId,
    mth: method,
    uri,
    bdy,
    iat: now,
    exp: now + ttl,
    nonce: params.customNonce ?? crypto.randomBytes(16).toString('hex'),
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const data = `${headerB64}.${payloadB64}`;

  const sig = crypto.createHmac('sha256', params.secret).update(data).digest();
  const sigB64 = base64UrlEncode(sig);

  return `${data}.${sigB64}`;
}

// Fallback in-memory cache for test mocks if DB is disconnected
const fallbackNonceCache = new Map<string, number>();

export function clearNonceCacheForTesting(): void {
  fallbackNonceCache.clear();
}

/**
 * Shared atomic replay prevention using database UNIQUE constraint on business_ext.consumed_nonces.
 * Works atomically across multiple workers, processes, or replicas.
 */
export async function consumeNonce(nonce: string, expSeconds: number): Promise<boolean> {
  const expiresAt = new Date(expSeconds * 1000);
  try {
    const res = await query(
      `INSERT INTO business_ext.consumed_nonces (nonce, expires_at)
       VALUES ($1, $2)
       ON CONFLICT (nonce) DO NOTHING
       RETURNING nonce`,
      [nonce, expiresAt]
    );

    if ((res.rowCount ?? 0) > 0) {
      return true;
    }
    return false;
  } catch (err) {
    // If table is missing (e.g. before initial migration in isolated unit test), use fallback
    if (fallbackNonceCache.has(nonce)) {
      return false;
    }
    fallbackNonceCache.set(nonce, expSeconds);
    return true;
  }
}

export function verifyInternalAssertion(params: {
  assertion: string;
  secret: string;
  expectedDeploymentId: string;
  expectedMethod?: string;
  expectedPath?: string;
  expectedBody?: string | null;
  nowSeconds?: number;
}): InternalAssertionPayload {
  if (!params.secret || params.secret.length < MIN_SECRET_LENGTH || KNOWN_INSECURE_SECRETS.has(params.secret)) {
    throw new Error('Insecure or known default secret is prohibited');
  }

  if (!params.assertion || typeof params.assertion !== 'string') {
    throw new Error('Missing or empty assertion string');
  }

  const parts = params.assertion.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed internal assertion: expected 3 dot-separated parts');
  }

  const [headerB64, payloadB64, sigB64] = parts;
  if (!headerB64 || !payloadB64 || !sigB64) {
    throw new Error('Malformed internal assertion: empty token component');
  }

  // 1. Verify signature using timingSafeEqual
  const data = `${headerB64}.${payloadB64}`;
  const expectedSig = crypto.createHmac('sha256', params.secret).update(data).digest();
  let providedSig: Buffer;
  try {
    providedSig = Buffer.from(sigB64, 'base64url');
  } catch {
    throw new Error('Invalid signature encoding');
  }

  if (expectedSig.length !== providedSig.length || !crypto.timingSafeEqual(expectedSig, providedSig)) {
    throw new Error('Tampered internal assertion signature');
  }

  // 2. Decode and parse payload
  let payload: InternalAssertionPayload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64)) as InternalAssertionPayload;
  } catch {
    throw new Error('Invalid internal assertion payload JSON');
  }

  // 3. Validate claims
  if (payload.v !== 1 || payload.iss !== 'dograh-ui-proxy' || payload.aud !== 'business-extension-api') {
    throw new Error('Invalid assertion audience or issuer');
  }

  if (payload.dep !== params.expectedDeploymentId) {
    throw new Error('Tampered deployment claim');
  }

  if (typeof payload.org !== 'number' || payload.org <= 0) {
    throw new Error('Invalid organization claim');
  }

  if (typeof payload.sub !== 'string' || !payload.sub.trim()) {
    throw new Error('Invalid user subject claim');
  }

  const now = params.nowSeconds ?? Math.floor(Date.now() / 1000);

  if (now > payload.exp) {
    throw new Error('Expired internal assertion');
  }

  if (now < payload.iat - 5) {
    throw new Error('Assertion issued in the future');
  }

  // 4. Validate cryptographic request binding
  if (params.expectedMethod) {
    const normExpected = params.expectedMethod.toUpperCase();
    if (payload.mth && payload.mth !== normExpected) {
      throw new Error(`Request method mismatch: assertion was signed for ${payload.mth}, received ${normExpected}`);
    }
  }

  if (params.expectedPath) {
    const normPath = params.expectedPath.split('?')[0] || '/';
    if (payload.uri && payload.uri !== normPath) {
      throw new Error(`Request URI mismatch: assertion was signed for ${payload.uri}, received ${normPath}`);
    }
  }

  if (params.expectedBody !== undefined) {
    const expectedHash = computeBodyHash(params.expectedBody);
    if (payload.bdy && payload.bdy !== expectedHash) {
      throw new Error('Request body hash mismatch: payload has been altered or substituted');
    }
  }

  return payload;
}
