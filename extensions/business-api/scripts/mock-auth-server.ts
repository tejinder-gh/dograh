import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import dotenv from 'dotenv';
import { Pool } from 'pg';

// Load environment from business-api .env or parent
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const PORT = parseInt(process.env.AUTH_SERVER_PORT || '8000', 10);
const OSS_JWT_SECRET =
  process.env.OSS_JWT_SECRET || '6492a2ab59b7edc5a21071720f29313b91f6ccc3289b60b998fcdb03be8108ff';

const dbUrl =
  process.env.TEST_ADMIN_DATABASE_URL ||
  process.env.MIGRATION_DATABASE_URL ||
  process.env.DATABASE_URL;

const pool = dbUrl
  ? new Pool({ connectionString: dbUrl, max: 5 })
  : new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'postgres',
      database: process.env.POSTGRES_DB || 'postgres',
      max: 5,
    });

pool.on('error', (err) => {
  console.error('[mock-auth-server] Unexpected PostgreSQL idle client error:', err);
});

function verifyAndDecodeToken(token: string): { sub: string; email: string } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;
  if (!headerB64 || !payloadB64 || !signatureB64) return null;

  // Validate header
  try {
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf-8'));
    if (header.alg !== 'HS256') return null;
  } catch {
    return null;
  }

  // Validate HMAC SHA-256 signature
  const expectedSig = crypto
    .createHmac('sha256', OSS_JWT_SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  if (signatureB64.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signatureB64), Buffer.from(expectedSig))) {
    return null;
  }

  // Parse claims and check expiration
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === 'number' && payload.exp < now) {
      return null;
    }
    if (!payload.sub) {
      return null;
    }
    return {
      sub: String(payload.sub),
      email: String(payload.email || ''),
    };
  } catch {
    return null;
  }
}

const server = http.createServer(async (req, res) => {
  const host = req.headers.host || 'localhost';
  const url = new URL(req.url || '/', `http://${host}`);

  if (url.pathname === '/health' || url.pathname === '/api/v1/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'mock-acuity-auth' }));
    return;
  }

  if (url.pathname === '/api/v1/auth/me') {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ detail: 'Authorization header required' }));
      return;
    }

    const token = authHeader.substring(7).trim();
    const claims = verifyAndDecodeToken(token);
    if (!claims) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ detail: 'Invalid or expired token' }));
      return;
    }

    const numericUserId = parseInt(claims.sub, 10);
    if (isNaN(numericUserId) || numericUserId <= 0) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ detail: 'Invalid user identifier' }));
      return;
    }

    try {
      const dbRes = await pool.query<{
        id: number;
        email: string | null;
        selected_organization_id: number | null;
        is_superuser: boolean | null;
        provider_id: string;
      }>(
        'SELECT id, email, selected_organization_id, is_superuser, provider_id FROM public.users WHERE id = $1 LIMIT 1',
        [numericUserId]
      );

      if (dbRes.rows.length === 0) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ detail: 'User not found' }));
        return;
      }

      const user = dbRes.rows[0];
      if (!user) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ detail: 'User not found' }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          id: user.id,
          email: user.email || claims.email,
          organization_id: user.selected_organization_id,
          provider_id: user.provider_id || `user_${user.id}`,
          is_superuser: Boolean(user.is_superuser),
        })
      );
      return;
    } catch (err) {
      console.error('[mock-auth-server] Database query error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ detail: 'Database error verifying user' }));
      return;
    }
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ detail: 'Not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[mock-auth-server] Mock Acuity Auth server listening on port ${PORT}`);
});

process.on('SIGTERM', () => {
  server.close(() => {
    pool.end();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  server.close(() => {
    pool.end();
    process.exit(0);
  });
});
