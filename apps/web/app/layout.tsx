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

export const metadata: Metadata = {
  metadataBase: new URL('https://mneme.dev'),
  title: {
    default: 'mneme — the open, user-sovereign memory layer for AI',
    template: '%s · mneme',
  },
  description:
    'Memory that belongs to you. Local-first by design, end-to-end encrypted by default, an open protocol any AI app can implement. Your memory. Your keys. Every model.',
  openGraph: {
    title: 'mneme — the open, user-sovereign memory layer for AI',
    description: 'Memory that belongs to you. Local-first, end-to-end encrypted, cross-provider.',
    url: 'https://mneme.dev',
    siteName: 'mneme',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'mneme — the open, user-sovereign memory layer for AI',
    description: 'Memory that belongs to you. Local-first, end-to-end encrypted, cross-provider.',
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
