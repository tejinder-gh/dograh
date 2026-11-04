import { NextRequest, NextResponse } from 'next/server';

import { callBusinessApi } from '@/lib/businessApiServer';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const res = await callBusinessApi('/api/business-profiles', {}, req);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const res = await callBusinessApi('/api/business-profiles', {
    method: 'POST',
    body,
  }, req);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
