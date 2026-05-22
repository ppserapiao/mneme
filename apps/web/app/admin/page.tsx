import { notFound } from 'next/navigation'
import {
  dailyTotals,
  topPaths,
  topReferrers,
  totalPageviews,
  totalUniqueVisitors,
} from '../../lib/analytics'

// Internal analytics dashboard. Token-gated via ?token=<ADMIN_TOKEN>.
//
// Auth model: we deliberately return 404 (not 401) when the token is
// wrong or missing. This is "security through 404" — not strong, but
// it stops casual probing from confirming the route exists. The token
// is a shared secret on Pedro's machine + Vercel env vars; rotate it
// if it leaks.
//
// The dashboard is server-rendered, so the data is always fresh and
// the token never reaches the client.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type SearchParams = Promise<{ token?: string }>

export default async function AdminPage({ searchParams }: { searchParams: SearchParams }) {
  const { token } = await searchParams
  const expected = process.env.ADMIN_TOKEN
  if (!expected || !token || token !== expected) {
    notFound()
  }

  if (!process.env.DATABASE_URL || !process.env.ANALYTICS_SALT) {
    return (
      <main className="page">
        <section className="section first">
          <h1 className="h-section">analytics not configured</h1>
          <p className="lede">
            Set <code className="mono">DATABASE_URL</code>,{' '}
            <code className="mono">ANALYTICS_SALT</code>, and{' '}
            <code className="mono">ADMIN_TOKEN</code> in the Vercel project environment, then run
            the schema from <code className="mono">apps/web/scripts/init-analytics.sql</code>{' '}
            against the database.
          </p>
        </section>
      </main>
    )
  }

  const [today, week, weekUnique, daily, refs, paths] = await Promise.all([
    totalPageviews(1),
    totalPageviews(7),
    totalUniqueVisitors(7),
    dailyTotals(14),
    topReferrers(7, 20),
    topPaths(7, 20),
  ])

  return (
    <main className="page">
      <section className="section first">
        <div className="section-head">
          <div>
            <div className="num">admin · analytics</div>
          </div>
          <div>
            <h1 className="h-section">mneme landing — usage</h1>
          </div>
        </div>

        <p className="lede">
          Self-hosted, no third-party trackers, no cookies, no IP / UA stored. Each visit is
          recorded as one row with a daily-rotating <code className="mono">visitor_hash</code>{' '}
          that's unlinkable across days. Source:{' '}
          <code className="mono">apps/web/lib/analytics.ts</code>.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '1.5rem',
            margin: '2rem 0',
          }}
        >
          <SummaryCard label="Pageviews · today" value={today} />
          <SummaryCard label="Pageviews · last 7d" value={week} />
          <SummaryCard label="Unique visitors · last 7d" value={weekUnique} />
        </div>

        <h2 className="h-card" style={{ marginTop: '3rem' }}>
          Last 14 days
        </h2>
        <StatTable
          headers={['Day', 'Pageviews', 'Unique']}
          rows={daily.map((r) => [r.day, String(r.pageviews), String(r.unique_visitors)])}
          empty="no events yet"
        />

        <h2 className="h-card" style={{ marginTop: '3rem' }}>
          Top referrers · last 7d
        </h2>
        <StatTable
          headers={['Host', 'Pageviews']}
          rows={refs.map((r) => [r.referrer_host ?? '(direct)', String(r.pageviews)])}
          empty="no referrers yet"
        />

        <h2 className="h-card" style={{ marginTop: '3rem' }}>
          Paths · last 7d
        </h2>
        <StatTable
          headers={['Path', 'Pageviews']}
          rows={paths.map((r) => [r.path, String(r.pageviews)])}
          empty="no events yet"
        />
      </section>
    </main>
  )
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card">
      <div className="eyebrow">{label}</div>
      <div className="display" style={{ fontSize: '3rem', marginTop: '0.5rem' }}>
        {value.toLocaleString('en-US')}
      </div>
    </div>
  )
}

function StatTable({
  headers,
  rows,
  empty,
}: {
  headers: string[]
  rows: string[][]
  empty: string
}) {
  if (rows.length === 0) {
    return (
      <p className="mono" style={{ opacity: 0.6 }}>
        {empty}
      </p>
    )
  }
  return (
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontFamily: 'var(--mneme-font-mono)',
        fontSize: '0.9rem',
      }}
    >
      <thead>
        <tr>
          {headers.map((h) => (
            <th
              key={h}
              style={{
                textAlign: 'left',
                padding: '0.5rem 0.75rem',
                borderBottom: '1px solid var(--mneme-ink)',
                opacity: 0.7,
                fontWeight: 500,
              }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          // Each row's first cell is unique within its dataset (day, host, path).
          <tr key={r[0]}>
            {r.map((cell, j) => (
              <td
                key={headers[j]}
                style={{
                  padding: '0.5rem 0.75rem',
                  borderBottom: '1px solid rgba(21,17,15,0.08)',
                }}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
