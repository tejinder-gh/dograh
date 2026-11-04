import { NextRequest, NextResponse } from 'next/server';
import { callBusinessApi, getVerifiedSession } from '@/lib/businessApiServer';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getVerifiedSession(req);
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized: Session required' },
      { status: 401 }
    );
  }

  const { id } = await params;
  let bodyText = '';
  try {
    bodyText = await req.text();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const res = await callBusinessApi(
    `/api/appointments/${id}/status`,
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
