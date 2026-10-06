import { NextResponse } from 'next/server';
import { requireSession, loginLocation } from '@/lib/hotel-auth';

export async function proxy(request: Request) {
  const pathname = new URL(request.url).pathname;
  if (pathname === '/login' || pathname === '/api/auth/login' || pathname === '/api/auth/logout') {
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
  const rejected = await requireSession(request);
  if (rejected) {
    if (pathname.startsWith('/api/')) return rejected;
    // Use the configured HTTPS origin, not the internal HTTP proxy connection.
    return new Response(null, { status: 303, headers: { Location: loginLocation(), 'Cache-Control': 'no-store' } });
  }
  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image|assets/|favicon.svg|file.svg|globe.svg|window.svg).*)'] };
