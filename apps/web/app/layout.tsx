import type { Metadata } from 'next'
import { Instrument_Serif, JetBrains_Mono, Newsreader, Space_Grotesk } from 'next/font/google'
import './globals.css'

const display = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-mneme-display',
  display: 'swap',
})

const serif = Newsreader({
  subsets: ['latin'],
  weight: ['400', '500'],
  style: ['normal', 'italic'],
  variable: '--font-mneme-serif',
  display: 'swap',
})

const sans = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mneme-sans',
  display: 'swap',
})

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mneme-mono',
  display: 'swap',
})

// Site URL resolution. In order of precedence:
//   1. NEXT_PUBLIC_SITE_URL — set explicitly (e.g. https://mneme.dev once that
//      domain is wired up)
//   2. VERCEL_PROJECT_PRODUCTION_URL — auto-injected by Vercel on the production
//      deployment (no protocol)
//   3. VERCEL_URL — auto-injected for preview deployments
//   4. localhost fallback for dev
// This means OG / Twitter previews resolve correctly on whichever URL the
// deployment is actually served from — no hardcoded "mneme.dev" that 404s.
const siteUrl = (() => {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:4321'
})()

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'mneme — the open, user-sovereign memory layer for AI',
    template: '%s · mneme',
  },
  description:
    'Memory that belongs to you. Local-first by design, end-to-end encrypted by default, an open protocol any AI app can implement. Your memory. Your keys. Every model.',
  openGraph: {
    title: 'mneme — the open, user-sovereign memory layer for AI',
    description: 'Memory that belongs to you. Local-first, end-to-end encrypted, cross-provider.',
    url: siteUrl,
    siteName: 'mneme',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'mneme — the open, user-sovereign memory layer for AI',
    description: 'Memory that belongs to you. Local-first, end-to-end encrypted, cross-provider.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${serif.variable} ${sans.variable} ${mono.variable}`}
    >
      <body>{children}</body>
    </html>
  )
}
