/*
  Provides authentication token to LocalProviderWrapper once loaded
  in the browser.
  Returns 401 if no token cookie exists (user needs to log in).
*/
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getServerBackendUrl } from '@/lib/apiClient';
import { getAuthProvider } from '@/lib/auth/config';
import { OSS_TOKEN_COOKIE, OSS_USER_COOKIE, sessionCookieOptions } from '@/lib/auth/cookies';

export async function GET(request: NextRequest) {
  const authProvider = await getAuthProvider();

  // Only handle OSS mode
  if (authProvider !== 'local') {
    return NextResponse.json({ error: 'Not in OSS mode' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(OSS_TOKEN_COOKIE)?.value;
  const user = cookieStore.get(OSS_USER_COOKIE)?.value;

  // If no token exists, return 401 (user needs to sign up or log in)
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Validate token against backend /api/v1/auth/me to reject expired/invalid sessions
  try {
    const backendUrl = getServerBackendUrl();
    const res = await fetch(`${backendUrl}/api/v1/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (res.status === 401 || res.status === 403) {
      // Token is invalid or expired: clear cookies and return 401
      const clearOptions = sessionCookieOptions(request, 0);
      cookieStore.set(OSS_TOKEN_COOKIE, '', clearOptions);
      cookieStore.set(OSS_USER_COOKIE, '', clearOptions);
      return NextResponse.json({ error: 'Session expired' }, { status: 401 });
    }

    if (res.ok) {
      const backendUser = await res.json();
      return NextResponse.json({
        token,
        user: {
          id: backendUser.id,
          email: backendUser.email,
          name: backendUser.name || backendUser.email || 'Local User',
          organization_id: backendUser.organization_id,
          provider_id: backendUser.provider_id,
          is_superuser: backendUser.is_superuser ?? false,
          provider: 'local',
        },
      });
    }
  } catch {
    // If backend is temporarily unreachable, fall through to cookie user
  }

  // Return the auth info from cookie as fallback
  return NextResponse.json({
    token,
    user: user ? JSON.parse(user) : { id: token, name: 'Local User', provider: 'local' },
  });
}
