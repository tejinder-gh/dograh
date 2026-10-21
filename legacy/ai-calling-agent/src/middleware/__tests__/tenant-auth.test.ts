import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import {
  requireRole,
  createSignedToken,
  verifySignedToken,
  requireTenantContext,
  getAuthSecret,
  setAuthSecretForTesting,
  AuthConfigurationError,
  TOKEN_ISSUER,
  TOKEN_AUDIENCE
} from '../tenant-auth';
import { setTestQueryHandler } from '../../db/connection';

test('createSignedToken creates cryptographically verifiable token', () => {
  const token = createSignedToken({
    userId: 'user-uuid-1234',
    tenantId: 'tenant-uuid-5678',
    role: 'tenant_owner',
  });

  const claims = verifySignedToken(token);
  assert.ok(claims);
  assert.equal(claims?.userId, 'user-uuid-1234');
  assert.equal(claims?.tenantId, 'tenant-uuid-5678');
  assert.equal(claims?.role, 'tenant_owner');
  assert.equal(claims?.iss, TOKEN_ISSUER);
  assert.equal(claims?.aud, TOKEN_AUDIENCE);
  assert.ok(typeof claims?.exp === 'number');
});

test('verifySignedToken rejects tampered or forged signatures', () => {
  const token = createSignedToken({
    userId: 'user-uuid-1234',
    tenantId: 'tenant-uuid-5678',
    role: 'tenant_staff',
  });

  // Tamper with payload (modify role from tenant_staff to platform_super_admin)
  const parts = token.split('.');
  const tamperedPayload = Buffer.from(
    JSON.stringify({
      userId: 'user-uuid-1234',
      tenantId: 'tenant-uuid-5678',
      role: 'platform_super_admin',
      isPlatformAdmin: true,
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
  ).toString('base64url');

  const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
  const claims = verifySignedToken(tamperedToken);

  assert.equal(claims, null, 'Tampered token signature must fail verification');
});

test('verifySignedToken rejects expired tokens', () => {
  const expiredToken = createSignedToken(
    {
      userId: 'user-uuid-1234',
      tenantId: 'tenant-uuid-5678',
      role: 'tenant_owner',
    },
    -10 // Expired 10 seconds ago
  );

  const claims = verifySignedToken(expiredToken);
  assert.equal(claims, null, 'Expired token must fail verification');
});

test('verifySignedToken rejects tokens with omitted exp claim', () => {
  const secret = getAuthSecret();
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  // Token crafted without exp claim
  const payload = Buffer.from(
    JSON.stringify({
      userId: 'user-no-exp',
      tenantId: 'tenant-acme',
      role: 'tenant_owner',
      iss: TOKEN_ISSUER,
      aud: TOKEN_AUDIENCE,
    })
  ).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  const craftedToken = `${header}.${payload}.${signature}`;

  const claims = verifySignedToken(craftedToken);
  assert.equal(claims, null, 'Tokens without exp must be strictly rejected');
});

test('verifySignedToken rejects tokens with invalid issuer or audience', () => {
  const secret = getAuthSecret();
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      userId: 'user-wrong-iss',
      tenantId: 'tenant-acme',
      role: 'tenant_owner',
      iss: 'rogue-issuer-identity',
      aud: TOKEN_AUDIENCE,
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
  ).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  const craftedToken = `${header}.${payload}.${signature}`;

  const claims = verifySignedToken(craftedToken);
  assert.equal(claims, null, 'Tokens with mismatched issuer must fail verification');
});

test('verifySignedToken rejects tokens with omitted iss or aud claims', () => {
  const secret = getAuthSecret();
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);

  // Missing iss
  const payloadNoIss = Buffer.from(
    JSON.stringify({
      userId: 'user-1',
      tenantId: 'tenant-1',
      role: 'tenant_staff',
      aud: TOKEN_AUDIENCE,
      iat: now,
      exp: now + 3600,
    })
  ).toString('base64url');
  const sig1 = crypto.createHmac('sha256', secret).update(`${header}.${payloadNoIss}`).digest('base64url');
  assert.equal(verifySignedToken(`${header}.${payloadNoIss}.${sig1}`), null, 'Must reject omitted iss');

  // Missing aud
  const payloadNoAud = Buffer.from(
    JSON.stringify({
      userId: 'user-1',
      tenantId: 'tenant-1',
      role: 'tenant_staff',
      iss: TOKEN_ISSUER,
      iat: now,
      exp: now + 3600,
    })
  ).toString('base64url');
  const sig2 = crypto.createHmac('sha256', secret).update(`${header}.${payloadNoAud}`).digest('base64url');
  assert.equal(verifySignedToken(`${header}.${payloadNoAud}.${sig2}`), null, 'Must reject omitted aud');
});

test('verifySignedToken rejects tokens with unsupported or forged alg/typ headers', () => {
  const secret = getAuthSecret();
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      userId: 'user-1',
      tenantId: 'tenant-1',
      role: 'tenant_staff',
      iss: TOKEN_ISSUER,
      aud: TOKEN_AUDIENCE,
      iat: now,
      exp: now + 3600,
    })
  ).toString('base64url');

  // alg: none attack
  const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const noneSig = crypto.createHmac('sha256', secret).update(`${noneHeader}.${payload}`).digest('base64url');
  assert.equal(verifySignedToken(`${noneHeader}.${payload}.${noneSig}`), null, 'Must reject alg: none');

  // typ: not JWT
  const badTypHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'NOT_JWT' })).toString('base64url');
  const badTypSig = crypto.createHmac('sha256', secret).update(`${badTypHeader}.${payload}`).digest('base64url');
  assert.equal(verifySignedToken(`${badTypHeader}.${payload}.${badTypSig}`), null, 'Must reject non-JWT typ');
});

test('getAuthSecret throws AuthConfigurationError in production if secret is missing', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalSecret = process.env.AUTH_SECRET;
  const originalJwtSecret = process.env.JWT_SECRET;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.AUTH_SECRET;
    delete process.env.JWT_SECRET;
    setAuthSecretForTesting(null);

    assert.throws(() => getAuthSecret(), AuthConfigurationError);
  } finally {
    process.env.NODE_ENV = originalEnv;
    if (originalSecret) process.env.AUTH_SECRET = originalSecret;
    if (originalJwtSecret) process.env.JWT_SECRET = originalJwtSecret;
    setAuthSecretForTesting(null);
  }
});

test('requireTenantContext denies unauthenticated requests by default (401)', async () => {
  let nextCalled = false;
  let statusCode = 0;
  let jsonBody: any = null;

  const mockReq: any = {
    headers: {},
    query: {},
  };
  const mockRes: any = {
    status: (code: number) => {
      statusCode = code;
      return {
        json: (body: any) => {
          jsonBody = body;
        },
      };
    },
  };
  const mockNext = () => {
    nextCalled = true;
  };

  await requireTenantContext(mockReq, mockRes, mockNext);

  assert.equal(nextCalled, false, 'Unauthenticated request must not proceed');
  assert.equal(statusCode, 401);
  assert.equal(jsonBody?.code, 'UNAUTHENTICATED');
});

test('requireTenantContext rejects caller trying to forge x-user-id without signed token', async () => {
  let nextCalled = false;
  let statusCode = 0;
  let jsonBody: any = null;

  const mockReq: any = {
    headers: {
      'x-user-id': 'attacker-forged-admin-id',
      'x-tenant-id': 'victim-tenant-id',
    },
    query: {},
  };
  const mockRes: any = {
    status: (code: number) => {
      statusCode = code;
      return {
        json: (body: any) => {
          jsonBody = body;
        },
      };
    },
  };
  const mockNext = () => {
    nextCalled = true;
  };

  await requireTenantContext(mockReq, mockRes, mockNext);

  assert.equal(nextCalled, false, 'Forged header without valid Bearer token must fail');
  assert.equal(statusCode, 401);
  assert.equal(jsonBody?.code, 'UNAUTHENTICATED');
});

test('requireRole allows request when user has authorized role', () => {
  const middleware = requireRole(['tenant_owner', 'tenant_administrator']);
  let nextCalled = false;
  let statusSet: number | null = null;

  const mockReq: any = {
    userRole: 'tenant_owner',
  };
  const mockRes: any = {
    status: (s: number) => {
      statusSet = s;
      return { json: () => {} };
    },
  };
  const mockNext = () => {
    nextCalled = true;
  };

  middleware(mockReq, mockRes, mockNext);
  assert.equal(nextCalled, true);
  assert.equal(statusSet, null);
});

test('requireRole blocks request when user role is insufficient (403)', () => {
  const middleware = requireRole(['tenant_owner', 'tenant_administrator']);
  let nextCalled = false;
  let statusSet: number | null = null;
  let jsonResponse: any = null;

  const mockReq: any = {
    userRole: 'tenant_analyst',
  };
  const mockRes: any = {
    status: (s: number) => {
      statusSet = s;
      return {
        json: (j: any) => {
          jsonResponse = j;
        },
      };
    },
  };
  const mockNext = () => {
    nextCalled = true;
  };

  middleware(mockReq, mockRes, mockNext);
  assert.equal(nextCalled, false);
  assert.equal(statusSet, 403);
  assert.equal(jsonResponse?.code, 'INSUFFICIENT_ROLE_PERMISSIONS');
});

test('requireRole always permits platform_super_admin', () => {
  const middleware = requireRole(['tenant_agent_manager']);
  let nextCalled = false;

  const mockReq: any = {
    userRole: 'platform_super_admin',
  };
  const mockRes: any = {};
  const mockNext = () => {
    nextCalled = true;
  };

  middleware(mockReq, mockRes, mockNext);
  assert.equal(nextCalled, true);
});

test('requireTenantContext rejects token with forged platform-admin claim when server-side DB authorization is false', async () => {
  const forgedToken = createSignedToken({
    userId: 'user-unprivileged-01',
    tenantId: 'tenant-uuid-1111',
    isPlatformAdmin: true,
  });

  setTestQueryHandler((text: string) => {
    if (text.includes('FROM tenants WHERE')) {
      return {
        rows: [{ id: 'tenant-uuid-1111', name: 'Acme Corp', status: 'active' }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };
    }
    if (text.includes('FROM users WHERE id =')) {
      return {
        rows: [{ is_platform_admin: false, is_active: true }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };
    }
    return null;
  });

  try {
    let nextCalled = false;
    let statusCode = 0;
    let jsonBody: any = null;

    const mockReq: any = {
      headers: {
        authorization: `Bearer ${forgedToken}`,
        'x-tenant-id': 'tenant-uuid-1111',
      },
      query: {},
    };
    const mockRes: any = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (body: any) => {
            jsonBody = body;
          },
        };
      },
    };

    await requireTenantContext(mockReq, mockRes, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false, 'Forged platform-admin token must be rejected');
    assert.equal(statusCode, 403);
    assert.equal(jsonBody?.code, 'FORBIDDEN_PLATFORM_ADMIN');
  } finally {
    setTestQueryHandler(null);
  }
});

test('requireTenantContext rejects revoked or disabled user accounts (403 ACCOUNT_DISABLED)', async () => {
  const token = createSignedToken({
    userId: 'user-banned-01',
    tenantId: 'tenant-uuid-1111',
  });

  setTestQueryHandler((text: string) => {
    if (text.includes('FROM tenants WHERE')) {
      return {
        rows: [{ id: 'tenant-uuid-1111', name: 'Acme Corp', status: 'active' }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };
    }
    if (text.includes('FROM users WHERE id =')) {
      return {
        rows: [{ is_platform_admin: false, is_active: false }], // Disabled account
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };
    }
    return null;
  });

  try {
    let nextCalled = false;
    let statusCode = 0;
    let jsonBody: any = null;

    const mockReq: any = {
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': 'tenant-uuid-1111',
      },
      query: {},
    };
    const mockRes: any = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (body: any) => {
            jsonBody = body;
          },
        };
      },
    };

    await requireTenantContext(mockReq, mockRes, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false, 'Disabled user must not be admitted');
    assert.equal(statusCode, 403);
    assert.equal(jsonBody?.code, 'ACCOUNT_DISABLED');
  } finally {
    setTestQueryHandler(null);
  }
});

test('requireTenantContext rejects access when tenant organization is suspended (403 TENANT_SUSPENDED)', async () => {
  const token = createSignedToken({
    userId: 'user-valid-01',
    tenantId: 'tenant-suspended-1111',
  });

  setTestQueryHandler((text: string) => {
    if (text.includes('FROM tenants WHERE')) {
      return {
        rows: [{ id: 'tenant-suspended-1111', name: 'Suspended Corp', status: 'suspended' }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };
    }
    return null;
  });

  try {
    let nextCalled = false;
    let statusCode = 0;
    let jsonBody: any = null;

    const mockReq: any = {
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': 'tenant-suspended-1111',
      },
      query: {},
    };
    const mockRes: any = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (body: any) => {
            jsonBody = body;
          },
        };
      },
    };

    await requireTenantContext(mockReq, mockRes, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(statusCode, 403);
    assert.equal(jsonBody?.code, 'TENANT_SUSPENDED');
  } finally {
    setTestQueryHandler(null);
  }
});

test('requireTenantContext permits active member and populates request tenant/user context', async () => {
  const token = createSignedToken({
    userId: 'user-valid-01',
    tenantId: 'tenant-uuid-1111',
  });

  setTestQueryHandler((text: string) => {
    if (text.includes('FROM tenants WHERE')) {
      return {
        rows: [{ id: 'tenant-uuid-1111', name: 'Acme Corp', status: 'active' }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };
    }
    if (text.includes('FROM users WHERE id =')) {
      return {
        rows: [{ is_platform_admin: false, is_active: true }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };
    }
    if (text.includes('FROM tenant_users WHERE')) {
      return {
        rows: [{ role: 'tenant_agent_manager', status: 'active' }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };
    }
    return null;
  });

  try {
    let nextCalled = false;
    const mockReq: any = {
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': 'tenant-uuid-1111',
      },
      query: {},
    };
    const mockRes: any = {
      status: () => ({ json: () => {} }),
    };

    await requireTenantContext(mockReq, mockRes, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(mockReq.userId, 'user-valid-01');
    assert.equal(mockReq.tenantId, 'tenant-uuid-1111');
    assert.equal(mockReq.userRole, 'tenant_agent_manager');
    assert.equal(mockReq.isPlatformAdmin, false);
  } finally {
    setTestQueryHandler(null);
  }
});
