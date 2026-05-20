import { useId } from 'react'

type MarkVariant = 'default' | 'inverse'

/**
 * Inline SVG of the mneme mark. useId() scopes the grain filter + clip path
 * IDs per instance so multiple marks render correctly on the same page.
 * Construction matches brand/mneme-mark.svg (default) and
 * brand/mneme-mark-inverse.svg (inverse, for dark surfaces).
 */
export function Mark({
  size = 64,
  variant = 'default',
  className,
}: {
  size?: number
  variant?: MarkVariant
  className?: string
}) {
  const uid = useId().replace(/:/g, '')
  const grainId = `mneme-grain-${uid}`
  const clipId = `mneme-clip-${uid}`

  const isInverse = variant === 'inverse'
  const stackFill = isInverse ? '#F2ECE0' : '#15110F'
  const grainSeed = isInverse ? 2 : 1
  const grainOpacity = isInverse ? 0.35 : 0.55

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      role="img"
      aria-label="mneme mark"
      className={className}
    >
      <title>mneme mark</title>
      <defs>
        <filter id={grainId} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="1.4"
            numOctaves={2}
            seed={grainSeed}
            stitchTiles="stitch"
          />
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.7 0" />
        </filter>
        <clipPath id={clipId}>
          <rect x={96} y={336} width={320} height={72} rx={16} />
          <rect x={128} y={232} width={256} height={72} rx={16} />
          <rect x={168} y={128} width={176} height={72} rx={16} />
        </clipPath>
      </defs>
      <g>
        <rect x={96} y={336} width={320} height={72} rx={16} fill={stackFill} />
        <rect x={128} y={232} width={256} height={72} rx={16} fill={stackFill} />
        <rect x={168} y={128} width={176} height={72} rx={16} fill="#E0651D" />
      </g>
      <g clipPath={`url(#${clipId})`} style={{ mixBlendMode: 'multiply' }} opacity={grainOpacity}>
        <rect x={0} y={0} width={512} height={512} filter={`url(#${grainId})`} />
      </g>
    </svg>
  )
}
