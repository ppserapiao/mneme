import { createHash } from 'node:crypto'
import postgres from 'postgres'

// ---------------------------------------------------------------------------
// Self-hosted analytics for the mneme landing.
//
// Privacy contract (this is part of the brand promise — "privacy is the
// product"):
//   - No IP address is ever stored.
//   - No User-Agent is ever stored.
//   - No cookies are set.
//   - The only per-request identifier we persist is a `visitor_hash`:
//       sha256(date_YYYY_MM_DD || ip || ua || ANALYTICS_SALT)
//     The inputs are hashed and discarded; the hash is one-way and
//     unlinkable across days (because the date salts it).
//   - This means we CAN count unique visitors per day, but we CANNOT
//     follow a visitor across days, or correlate sessions, or build a
//     profile. By design.
//   - If ANALYTICS_SALT is unset the route returns 200 without writing
//     (fail-open for misconfig — never break the landing).
//   - If DATABASE_URL is unset the route returns 200 without writing.
//
// We use postgres.js (no ORM) so the surface area is small and the SQL
// is auditable in three places (this file, the API route, the admin page).
// ---------------------------------------------------------------------------

let _sql: ReturnType<typeof postgres> | undefined

export function getSql(): ReturnType<typeof postgres> | undefined {
  const url = process.env.DATABASE_URL
  if (!url) return undefined
  if (!_sql) {
    _sql = postgres(url, {
      // Keep connections cheap on serverless. The route handler is
      // short-lived; we open and close per cold-start, not per request.
      max: 1,
      idle_timeout: 5,
      connect_timeout: 5,
      // Suppress noisy notices that postgres.js prints to console.warn
      onnotice: () => {},
    })
  }
  return _sql
}

export function hashVisitor(ip: string, ua: string): string {
  const salt = process.env.ANALYTICS_SALT
  if (!salt) throw new Error('ANALYTICS_SALT not configured')
  const day = new Date().toISOString().slice(0, 10) // YYYY-MM-DD UTC
  return createHash('sha256').update(`${day}|${ip}|${ua}|${salt}`).digest('hex')
}

/**
 * Strip the URL pathname out of a Referer header. We only keep the host —
 * full URLs would risk capturing tokens or paths from referring pages.
 */
export function refererHost(referer: string | null | undefined): string | null {
  if (!referer) return null
  try {
    const url = new URL(referer)
    return url.host || null
  } catch {
    return null
  }
}

export type EventInsert = {
  path: string
  referrer_host: string | null
  visitor_hash: string
}

export async function insertEvent(event: EventInsert): Promise<void> {
  const sql = getSql()
  if (!sql) return
  await sql`
    INSERT INTO analytics_events (path, referrer_host, visitor_hash)
    VALUES (${event.path}, ${event.referrer_host}, ${event.visitor_hash})
  `
}

// ---------------------------------------------------------------------------
// Aggregations for the dashboard. All queries scope to a date range so
// indexes on `ts` are useful and result sets stay bounded.
// ---------------------------------------------------------------------------

export type DailyRow = { day: string; pageviews: number; unique_visitors: number }
export type ReferrerRow = { referrer_host: string | null; pageviews: number }
export type PathRow = { path: string; pageviews: number }

export async function dailyTotals(days: number): Promise<DailyRow[]> {
  const sql = getSql()
  if (!sql) return []
  const rows = await sql<DailyRow[]>`
    SELECT
      to_char(ts AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
      count(*)::int AS pageviews,
      count(distinct visitor_hash)::int AS unique_visitors
    FROM analytics_events
    WHERE ts >= now() - (${days} || ' days')::interval
    GROUP BY day
    ORDER BY day DESC
  `
  return rows
}

export async function topReferrers(days: number, limit: number): Promise<ReferrerRow[]> {
  const sql = getSql()
  if (!sql) return []
  const rows = await sql<ReferrerRow[]>`
    SELECT referrer_host, count(*)::int AS pageviews
    FROM analytics_events
    WHERE ts >= now() - (${days} || ' days')::interval
    GROUP BY referrer_host
    ORDER BY pageviews DESC
    LIMIT ${limit}
  `
  return rows
}

export async function topPaths(days: number, limit: number): Promise<PathRow[]> {
  const sql = getSql()
  if (!sql) return []
  const rows = await sql<PathRow[]>`
    SELECT path, count(*)::int AS pageviews
    FROM analytics_events
    WHERE ts >= now() - (${days} || ' days')::interval
    GROUP BY path
    ORDER BY pageviews DESC
    LIMIT ${limit}
  `
  return rows
}

export async function totalPageviews(days: number): Promise<number> {
  const sql = getSql()
  if (!sql) return 0
  const rows = await sql<{ total: number }[]>`
    SELECT count(*)::int AS total
    FROM analytics_events
    WHERE ts >= now() - (${days} || ' days')::interval
  `
  return rows[0]?.total ?? 0
}

export async function totalUniqueVisitors(days: number): Promise<number> {
  const sql = getSql()
  if (!sql) return 0
  const rows = await sql<{ total: number }[]>`
    SELECT count(distinct visitor_hash)::int AS total
    FROM analytics_events
    WHERE ts >= now() - (${days} || ' days')::interval
  `
  return rows[0]?.total ?? 0
}
