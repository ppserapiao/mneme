import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

/**
 * Apple touch icon — the mneme mark on a paper background, 180×180.
 * Rendered via ImageResponse so we don't ship a PNG in the repo.
 */
export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#F2ECE0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* No <title> child — Satori renders it as visible text. aria-label
         provides the same a11y info. */}
      <svg width={120} height={120} viewBox="0 0 512 512" role="img" aria-label="mneme mark">
        <rect x={96} y={336} width={320} height={72} rx={16} fill="#15110F" />
        <rect x={128} y={232} width={256} height={72} rx={16} fill="#15110F" />
        <rect x={168} y={128} width={176} height={72} rx={16} fill="#E0651D" />
      </svg>
    </div>,
    { ...size },
  )
}
