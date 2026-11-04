import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedSession } from '@/lib/businessApiServer';

export const dynamic = 'force-dynamic';

/**
 * Authoritative server-side verification of platform administrator identity.
 * Reads HttpOnly session cookie / Bearer token on the server and checks
 * authoritative Acuity core backend. Tokens are never exposed to client JS.
 */
export async function GET(req: NextRequest) {
  const session = await getVerifiedSession(req);
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized: Valid session required' },
      { status: 401 }
    );
  }

  if (!session.isSuperuser) {
    return NextResponse.json(
      { error: 'Forbidden: Platform administrator privileges required' },
      { status: 403 }
    );
  }

  return NextResponse.json(
    {
      authenticated: true,
      isSuperuser: true,
      userId: session.userId,
      email: session.email,
      organizationId: session.organizationId,
    },
    { status: 200 }
  );
}
