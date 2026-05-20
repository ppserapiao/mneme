import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'mneme — the open, user-sovereign memory layer for AI'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/**
 * Open Graph image — the brand banner pattern (dark ink-bg, inverse mark,
 * pull-quote) rendered as a 1200×630 PNG at build/request time.
 *
 * Fonts are fetched from Google Fonts at runtime — Satori needs raw font
 * buffers, not next/font's CSS variables. We load Instrument Serif (display)
 * and Newsreader italic (for the muted "remember" line).
 */
async function loadGoogleFont(family: string, weight = 400, italic = false): Promise<ArrayBuffer> {
  // Google Fonts CSS2 expects family names with `+` for spaces (not %20 / %2B
  // from encodeURIComponent), and italic uses the `ital,wght@1,WEIGHT` tuple
  // syntax — `ital@1` alone returns an empty response.
  const familyParam = family.replace(/ /g, '+')
  const styleParam = italic ? `ital,wght@1,${weight}` : `wght@${weight}`
  const url = `https://fonts.googleapis.com/css2?family=${familyParam}:${styleParam}&display=swap`
  const css = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  }).then((r) => r.text())
  const fontUrl = css.match(/src:\s*url\((https:\/\/[^)]+\.woff2?)\)/)?.[1]
  if (!fontUrl) {
    throw new Error(`Failed to resolve font URL for ${family} (italic=${italic}, weight=${weight})`)
  }
  return fetch(fontUrl).then((r) => r.arrayBuffer())
}

export default async function OG() {
  const [instrumentSerif, instrumentSerifItalic, newsreaderItalic, spaceGrotesk] =
    await Promise.all([
      loadGoogleFont('Instrument Serif', 400, false),
      loadGoogleFont('Instrument Serif', 400, true),
      loadGoogleFont('Newsreader', 400, true),
      loadGoogleFont('Space Grotesk', 500, false),
    ])

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#1A1714',
        color: '#F2ECE0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 100px',
        fontFamily: 'Instrument Serif',
      }}
    >
      {/* Inverse mark (paper bars on dark) */}
      <svg width={64} height={64} viewBox="0 0 512 512" role="img" aria-label="mneme mark">
        <title>mneme</title>
        <rect x={96} y={336} width={320} height={72} rx={16} fill="#F2ECE0" />
        <rect x={128} y={232} width={256} height={72} rx={16} fill="#F2ECE0" />
        <rect x={168} y={128} width={176} height={72} rx={16} fill="#E0651D" />
      </svg>

      {/* Eyebrow */}
      <div
        style={{
          marginTop: 32,
          fontFamily: 'Space Grotesk',
          fontSize: 18,
          color: '#AD9A82',
          letterSpacing: 4,
          textTransform: 'uppercase',
          display: 'flex',
        }}
      >
        The thesis, in one line
      </div>

      {/* Mem0 line — Newsreader italic, muted */}
      <div
        style={{
          marginTop: 40,
          fontFamily: 'Newsreader',
          fontStyle: 'italic',
          fontSize: 30,
          color: '#AD9A82',
          display: 'flex',
        }}
      >
        Mem0 helps agents <span style={{ color: '#F2ECE0', marginLeft: 8 }}>remember</span>
        <span style={{ marginLeft: 8 }}>users.</span>
      </div>

      {/* Divider */}
      <div
        style={{
          marginTop: 24,
          width: 64,
          height: 1,
          background: 'rgba(242, 236, 224, 0.18)',
          display: 'flex',
        }}
      />

      {/* mneme line — display, large, orange italic on "own" */}
      <div
        style={{
          marginTop: 24,
          fontFamily: 'Instrument Serif',
          fontSize: 82,
          color: '#F2ECE0',
          letterSpacing: -1,
          textAlign: 'center',
          lineHeight: 1.04,
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          maxWidth: 1000,
        }}
      >
        <span>mneme helps users</span>
        <span
          style={{
            fontStyle: 'italic',
            color: '#F3A06B',
            marginLeft: 18,
            marginRight: 18,
          }}
        >
          own
        </span>
        <span>their memory.</span>
      </div>

      {/* Footer */}
      <div
        style={{
          position: 'absolute',
          bottom: 56,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          fontFamily: 'Space Grotesk',
          fontSize: 16,
          letterSpacing: 4,
          textTransform: 'uppercase',
          color: '#AD9A82',
        }}
      >
        mneme.dev · open-source memory for AI
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: 'Instrument Serif', data: instrumentSerif, weight: 400, style: 'normal' },
        { name: 'Instrument Serif', data: instrumentSerifItalic, weight: 400, style: 'italic' },
        { name: 'Newsreader', data: newsreaderItalic, weight: 400, style: 'italic' },
        { name: 'Space Grotesk', data: spaceGrotesk, weight: 500, style: 'normal' },
      ],
    },
  )
}
