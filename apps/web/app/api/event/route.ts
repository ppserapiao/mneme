import { NextResponse } from 'next/server'
import { hashVisitor, insertEvent, refererHost } from '../../../lib/analytics'

// The analytics collection endpoint. Designed to NEVER break the landing:
// every error path returns 204 and logs server-side. The beacon is
// fire-and-forget on the client (navigator.sendBeacon), so the response
// shape barely matters — but returning 204 (no content) is the polite
// answer for a beacon endpoint.
//
// CSP allows `connect-src 'self'`, so the beacon fires same-origin only.

export const runtime = 'nodejs' // postgres.js needs the Node runtime

type EventPayload = {
  path?: unknown
  referrer?: unknown
}

const MAX_PATH_BYTES = 256
const MAX_REFERRER_BYTES = 512

function clip(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s
}

export async function POST(request: Request): Promise<Response> {
  try {
    if (!process.env.DATABASE_URL || !process.env.ANALYTICS_SALT) {
      // Misconfigured — silently accept so the landing never breaks.
      return new NextResponse(null, { status: 204 })
    }

    let payload: EventPayload = {}
    try {
      payload = (await request.json()) as EventPayload
    } catch {
      return new NextResponse(null, { status: 204 })
    }

    const path =
      typeof payload.path === 'string' && payload.path.startsWith('/')
        ? clip(payload.path, MAX_PATH_BYTES)
        : '/'

    const referrer_host = refererHost(
      typeof payload.referrer === 'string' ? clip(payload.referrer, MAX_REFERRER_BYTES) : null,
    )

    // Reading the client IP. Behind Vercel, the real IP is in
    // `x-forwarded-for`. We never persist this — only hash it.
    const xff = request.headers.get('x-forwarded-for') ?? ''
    const ip = xff.split(',')[0]?.trim() || '0.0.0.0'
    const ua = request.headers.get('user-agent') ?? ''

    const visitor_hash = hashVisitor(ip, ua)
    await insertEvent({ path, referrer_host, visitor_hash })

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    // Anything else — DB unreachable, schema missing, etc — we log and
    // return 204. Never break the landing because analytics broke.
    console.error('[analytics] event insert failed:', err)
    return new NextResponse(null, { status: 204 })
  }
}
