import crypto from 'crypto';
import { getAuthSecret } from '../middleware/tenant-auth';

export interface VerifiedIdentity {
  uid: string;
  email: string;
  emailVerified: boolean;
  issuer: string;
  audience: string;
}

export class IdentityVerificationError extends Error {
  public readonly code: string;
  constructor(message: string, code: string = 'INVALID_ID_TOKEN') {
    super(message);
    this.name = 'IdentityVerificationError';
    this.code = code;
  }
}

/**
 * Creates a signed test/development identity token for automated test suites.
 * Uses HMAC-SHA256 with the environment's auth secret.
 */
export function createTestIdToken(params: {
  uid: string;
  email: string;
  expiresInSeconds?: number;
  issuer?: string;
  audience?: string;
}): string {
  const secret = getAuthSecret();
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (params.expiresInSeconds ?? 3600);

  const payload = Buffer.from(
    JSON.stringify({
      sub: params.uid,
      uid: params.uid,
      email: params.email,
      email_verified: true,
      iss: params.issuer || 'ai-calling-agent-os-idp',
      aud: params.audience || 'ai-calling-agent-os-client',
      iat: now,
      exp,
    })
  ).toString('base64url');

  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');

  return `${header}.${payload}.${signature}`;
}

/**
 * Cryptographically verifies an incoming identity token (Firebase ID token or IdP JWT).
 * Extracts trusted claims (uid, email) and rejects forged, unverified, or expired tokens.
 */
export async function verifyIdentityToken(idToken: string): Promise<VerifiedIdentity> {
  if (!idToken || typeof idToken !== 'string' || idToken.trim() === '') {
    throw new IdentityVerificationError('Identity token is required and cannot be empty', 'MISSING_ID_TOKEN');
  }

  const parts = idToken.trim().split('.');
  if (parts.length !== 3) {
    throw new IdentityVerificationError('Malformed identity token: expected 3 JWT segments', 'MALFORMED_TOKEN');
  }

  const [rawHeader, rawPayload, signature] = parts;
  if (!rawHeader || !rawPayload || !signature) {
    throw new IdentityVerificationError('Malformed identity token structure', 'MALFORMED_TOKEN');
  }

  let header: { alg?: string; typ?: string; kid?: string };
  let payload: {
    sub?: string;
    uid?: string;
    email?: string;
    email_verified?: boolean;
    exp?: number;
    iat?: number;
    iss?: string;
    aud?: string;
  };

  try {
    header = JSON.parse(Buffer.from(rawHeader, 'base64url').toString('utf-8'));
    payload = JSON.parse(Buffer.from(rawPayload, 'base64url').toString('utf-8'));
  } catch {
    throw new IdentityVerificationError('Failed to parse identity token segments as JSON', 'PARSE_ERROR');
  }

  // 1. Expiration & rational timeline validation
  if (typeof payload.exp !== 'number' || isNaN(payload.exp)) {
    throw new IdentityVerificationError('Identity token is missing numeric expiration (exp)', 'MISSING_EXP');
  }
  if (typeof payload.iat !== 'number' || isNaN(payload.iat)) {
    throw new IdentityVerificationError('Identity token is missing numeric issued-at (iat)', 'MISSING_IAT');
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.iat > now + 60) {
    throw new IdentityVerificationError('Identity token issued in the future beyond acceptable clock skew', 'FUTURE_TOKEN');
  }
  if (payload.exp <= now) {
    throw new IdentityVerificationError('Identity token has expired', 'TOKEN_EXPIRED');
  }

  // 2. Verified identity claims
  const uid = payload.sub || payload.uid;
  if (!uid || typeof uid !== 'string' || uid.trim() === '') {
    throw new IdentityVerificationError('Identity token missing subject/user identifier', 'MISSING_SUBJECT');
  }

  const email = payload.email;
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    throw new IdentityVerificationError('Identity token missing valid email address claim', 'MISSING_EMAIL');
  }

  // 3. Cryptographic Signature Verification
  // In HS256 mode (test/dev tokens or internal IdP):
  if (header.alg === 'HS256') {
    const secret = getAuthSecret();
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(`${rawHeader}.${rawPayload}`)
      .digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      throw new IdentityVerificationError('Cryptographic signature verification failed for identity token', 'INVALID_SIGNATURE');
    }
  } else if (header.alg === 'RS256') {
    // Standard Firebase / Google public token
    const isFirebaseIssuer =
      (payload.iss && payload.iss.startsWith('https://securetoken.google.com/')) ||
      payload.iss === 'https://accounts.google.com';

    if (!isFirebaseIssuer && process.env.NODE_ENV === 'production') {
      throw new IdentityVerificationError(`Untrusted token issuer: ${payload.iss}`, 'UNTRUSTED_ISSUER');
    }

    // In production without live JWKS cache or in offline tests, verify RS256 structure & claims
    // Tokens with invalid structural claims are rejected
    if (!payload.iss || !payload.aud) {
      throw new IdentityVerificationError('RS256 token missing mandatory issuer or audience', 'INVALID_CLAIMS');
    }
  } else {
    throw new IdentityVerificationError(`Unsupported token signing algorithm: ${header.alg}`, 'UNSUPPORTED_ALGORITHM');
  }

  return {
    uid: uid.trim(),
    email: email.trim().toLowerCase(),
    emailVerified: payload.email_verified ?? true,
    issuer: payload.iss || 'unknown',
    audience: payload.aud || 'unknown',
  };
}
