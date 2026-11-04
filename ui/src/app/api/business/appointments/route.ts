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

  const searchParams = req.nextUrl.searchParams.toString();
  const path = searchParams ? `/api/appointments?${searchParams}` : '/api/appointments';

  const res = await callBusinessApi(path, { method: 'GET' }, req);
  try {
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    const text = await res.text();
    return new NextResponse(text, { status: res.status });
  }
}

export async function POST(req: NextRequest) {
  const session = await getVerifiedSession(req);
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized: Session required' },
      { status: 401 }
    );
  }

  let bodyText = '';
  try {
    bodyText = await req.text();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const res = await callBusinessApi(
    '/api/appointments',
    {
      method: 'POST',
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
