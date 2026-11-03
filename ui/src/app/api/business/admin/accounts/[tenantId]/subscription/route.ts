import { NextRequest, NextResponse } from 'next/server';
import { callBusinessApi, getVerifiedSession } from '@/lib/businessApiServer';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ tenantId: string }> }
) {
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

  const { tenantId } = await context.params;
  const bodyText = await req.text();

  const res = await callBusinessApi(
    `/api/admin/accounts/${tenantId}/subscription`,
    {
      method: 'PATCH',
      body: bodyText,
      headers: { 'Content-Type': 'application/json' },
    },
    req
  );

  try {
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    const text = await res.text();
    return new NextResponse(text, { status: res.status });
  }
}
