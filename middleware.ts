import { NextResponse, type NextRequest } from 'next/server';

// ---------- Rate limiter (per IP, sliding window) ----------
// ⚠️  In-memory: works on a single Vercel instance. For high-traffic production,
//     swap for Upstash Redis (@upstash/ratelimit) — same API, persistent across instances.
const WINDOW_MS    = 60_000;  // 1-minute sliding window
const MAX_REQUESTS = 30;      // max API calls per IP per window

const hits = new Map<string, { count: number; resetAt: number }>();

let lastCleanup = Date.now();
function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 300_000) return;
  lastCleanup = now;
  for (const [key, val] of hits) {
    if (now > val.resetAt) hits.delete(key);
  }
}

function isRateLimited(ip: string): boolean {
  cleanup();
  const now   = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > MAX_REQUESTS;
}

// ---------- CORS ----------
// Requests with NO Origin header (server-side fetches, curl, same-origin browser) are
// always allowed. Browser cross-origin requests are only allowed from the app's own domain.
// Set APP_ORIGIN in .env.local (and Vercel env) to your production URL.
const APP_ORIGIN = process.env.APP_ORIGIN ?? '';  // e.g. "https://sneakopedia.com"

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return true;  // no Origin = server-side request or same-origin — allow
  if (APP_ORIGIN && origin === APP_ORIGIN) return true;
  // Always allow localhost for local development
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return false;
}

// ---------- Security headers ----------
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options':    'nosniff',
  'X-Frame-Options':           'DENY',
  'X-XSS-Protection':          '1; mode=block',
  'Referrer-Policy':           'strict-origin-when-cross-origin',
  'Permissions-Policy':        'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
};

export function middleware(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
           || request.headers.get('x-real-ip')
           || '127.0.0.1';

  const isApi = request.nextUrl.pathname.startsWith('/api/');

  if (isApi) {
    // 1. Block cross-origin browser requests from unknown domains
    const origin = request.headers.get('origin');
    if (!isOriginAllowed(origin)) {
      return NextResponse.json(
        { error: 'Forbidden.' },
        { status: 403 }
      );
    }

    // 2. Rate limit
    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: 'Too many requests. Please slow down.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }
  }

  const response = NextResponse.next();

  // Security headers on all routes
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  // CORS headers on API routes — echo back allowed origin so CDN can vary correctly
  if (isApi) {
    const origin = request.headers.get('origin');
    if (origin && isOriginAllowed(origin)) {
      response.headers.set('Access-Control-Allow-Origin',  origin);
      response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
      response.headers.set('Vary', 'Origin');
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
