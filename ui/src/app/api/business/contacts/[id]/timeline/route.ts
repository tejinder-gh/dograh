import { NextRequest, NextResponse } from 'next/server';

import { callBusinessApi } from '@/lib/businessApiServer';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const res = await callBusinessApi(`/api/contacts/${id}/timeline`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
