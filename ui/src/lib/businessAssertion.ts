import crypto from 'node:crypto';

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

export const KNOWN_INSECURE_SECRETS = new Set([
  'business-extension-local-secret-change-in-prod',
  'change-me',
  'secret',
  'default',
  'test',
]);

const MIN_SECRET_LENGTH = 32;

function base64UrlEncode(strOrBuffer: string | Buffer): string {
  const buf = Buffer.isBuffer(strOrBuffer) ? strOrBuffer : Buffer.from(strOrBuffer, 'utf-8');
  return buf.toString('base64url');
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
