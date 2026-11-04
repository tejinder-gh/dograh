// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cookieStore = {
  get: vi.fn(),
  set: vi.fn(),
};

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => cookieStore),
}));

vi.mock('@/lib/auth/config', () => ({
  getAuthProvider: vi.fn(async () => 'local'),
}));

vi.mock('@/lib/apiClient', () => ({
  getServerBackendUrl: vi.fn(() => 'http://127.0.0.1:8000'),
}));

import { OSS_TOKEN_COOKIE, OSS_USER_COOKIE } from '@/lib/auth/cookies';

import { GET } from './route';

function makeGetRequest(url: string = 'http://localhost:3000/api/auth/oss') {
  return new NextRequest(url, { method: 'GET' });
}

describe('GET /api/auth/oss', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns 401 when token cookie is missing', async () => {
    cookieStore.get.mockReturnValue(undefined);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('Not authenticated');
  });

  it('returns 401 and clears cookies when backend rejects token with 401', async () => {
    cookieStore.get.mockImplementation((name: string) => {
      if (name === OSS_TOKEN_COOKIE) return { value: 'expired-token' };
      if (name === OSS_USER_COOKIE) return { value: JSON.stringify({ id: 1 }) };
      return undefined;
    });

    const mockFetch = vi.fn(async () => ({
      status: 401,
      ok: false,
    }));
    vi.stubGlobal('fetch', mockFetch);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('Session expired');

    // Cookies should be cleared with maxAge 0
    expect(cookieStore.set).toHaveBeenCalledTimes(2);
    expect(cookieStore.set).toHaveBeenCalledWith(OSS_TOKEN_COOKIE, '', expect.objectContaining({ maxAge: 0 }));
    expect(cookieStore.set).toHaveBeenCalledWith(OSS_USER_COOKIE, '', expect.objectContaining({ maxAge: 0 }));
  });

  it('returns 200 with backend user data when token is valid', async () => {
    cookieStore.get.mockImplementation((name: string) => {
      if (name === OSS_TOKEN_COOKIE) return { value: 'valid-token' };
      if (name === OSS_USER_COOKIE) return { value: JSON.stringify({ id: 2, email: 'a@a.a' }) };
      return undefined;
    });

    const backendUser = {
      id: 2,
      email: 'a@a.a',
      organization_id: 2,
      provider_id: 'oss_provider_2',
      is_superuser: false,
    };

    const mockFetch = vi.fn(async () => ({
      status: 200,
      ok: true,
      json: async () => backendUser,
    }));
    vi.stubGlobal('fetch', mockFetch);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.token).toBe('valid-token');
    expect(data.user.email).toBe('a@a.a');
    expect(data.user.organization_id).toBe(2);
  });

  it('falls back to cookie user when backend is unreachable', async () => {
    cookieStore.get.mockImplementation((name: string) => {
      if (name === OSS_TOKEN_COOKIE) return { value: 'valid-token' };
      if (name === OSS_USER_COOKIE) return { value: JSON.stringify({ id: 2, email: 'a@a.a' }) };
      return undefined;
    });

    const mockFetch = vi.fn(async () => {
      throw new Error('Connection refused');
    });
    vi.stubGlobal('fetch', mockFetch);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.token).toBe('valid-token');
    expect(data.user.email).toBe('a@a.a');
  });
});
