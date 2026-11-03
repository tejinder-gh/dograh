import { NextRequest, NextResponse } from 'next/server';
import { callBusinessApi, getVerifiedSession } from '@/lib/businessApiServer';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getVerifiedSession(req);
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized: Session required' },
      { status: 401 }
    );
  }

  // Strict server-enforced platform administrator privilege check
  if (!session.isSuperuser) {
    return NextResponse.json(
      { error: 'Forbidden: Platform administrator privileges required' },
      { status: 403 }
    );
  }

  const res = await callBusinessApi('/api/admin/accounts', { method: 'GET' }, req);
  try {
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    const text = await res.text();
    return new NextResponse(text, { status: res.status });
  }
}
