import { NextRequest, NextResponse } from 'next/server';

import { callBusinessApi, getVerifiedSession } from '@/lib/businessApiServer';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ slug: string[] }> }
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

  const { slug } = await context.params;
  const subpath = slug.join('/');
  const search = req.nextUrl.searchParams.toString();
  const queryString = search ? `?${search}` : '';
  const apiPath = `/api/admin/analytics/${subpath}${queryString}`;

  const res = await callBusinessApi(apiPath, { method: 'GET' }, req);

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/csv')) {
    const csv = await res.text();
    return new NextResponse(csv, {
      status: res.status,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': res.headers.get('content-disposition') || 'attachment; filename="platform-portfolio.csv"',
      },
    });
  }

  try {
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    const text = await res.text();
    return new NextResponse(text, { status: res.status });
  }
}
