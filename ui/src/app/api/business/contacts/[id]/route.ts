import { NextRequest, NextResponse } from 'next/server';

import { callBusinessApi } from '@/lib/businessApiServer';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const res = await callBusinessApi(`/api/contacts/${id}`, {}, req);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.text();
  const res = await callBusinessApi(`/api/contacts/${id}`, {
    method: 'PUT',
    body,
  }, req);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.text();
  const res = await callBusinessApi(`/api/contacts/${id}`, {
    method: 'PATCH',
    body,
  }, req);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const res = await callBusinessApi(`/api/contacts/${id}`, {
    method: 'DELETE',
  }, req);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
