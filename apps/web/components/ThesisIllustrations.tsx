/**
 * Editorial illustrations for the Thesis section. Each one is a single,
 * recognizable concept — line drawings in brand ink with a single orange
 * accent, set on a cream surface. Construction follows the mneme mark's
 * grammar (rounded rectangles, 4–8px corner radii, no gradients).
 */

import { ClaudeLogo, CursorLogo, GeminiLogo, OpenAILogo } from './Logos'

const INK = '#15110F'
const INK_SOFT = '#3d342c'
const INK_MUTE = '#8a7a6a'
const INK_LINE = '#d9cfbd'
const PAPER = '#F2ECE0'
const CREAM = '#FAF6EE'
const ORANGE = '#E0651D'

const baseProps = {
  viewBox: '0 0 320 220' as const,
  width: '100%' as const,
  style: { display: 'block', maxWidth: 320 },
  xmlns: 'http://www.w3.org/2000/svg',
}

/** 01 — Device with the mneme bars inside; a faded crossed-out cloud next to it. */
export function DeviceIllustration() {
  return (
    <svg {...baseProps} role="img" aria-label="Memory on your device, not in the cloud">
      <title>Memory on your device, not in the cloud</title>
      {/* Faded crossed-out cloud (the "not here" gesture) */}
      <g opacity="0.5">
        <path
          d="M 220 60 C 220 50, 230 42, 244 42 C 248 32, 268 30, 274 44 C 286 42, 296 52, 294 64 C 296 74, 286 82, 274 82 L 240 82 C 228 82, 218 74, 220 60 Z"
          fill="none"
          stroke={INK_MUTE}
          strokeWidth="1.4"
        />
        <line
          x1="216"
          y1="38"
          x2="298"
          y2="86"
          stroke="#B23A2A"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </g>
      <text
        x="258"
        y="106"
        textAnchor="middle"
        fontFamily="var(--mneme-font-sans)"
        fontSize="9"
        letterSpacing="1.5"
        fill={INK_MUTE}
      >
        NOT HERE
      </text>

      {/* Device — laptop silhouette */}
      <g transform="translate(40, 50)">
        {/* Screen */}
        <rect
          x="0"
          y="0"
          width="160"
          height="110"
          rx="8"
          fill={CREAM}
          stroke={INK}
          strokeWidth="1.5"
        />
        {/* Inset screen */}
        <rect
          x="8"
          y="8"
          width="144"
          height="94"
          rx="4"
          fill={PAPER}
          stroke={INK_LINE}
          strokeWidth="1"
        />
        {/* mneme bars centred inside */}
        <g transform="translate(46, 32)">
          <rect x="20" y="0" width="32" height="10" rx="3" fill={ORANGE} />
          <rect x="10" y="14" width="52" height="10" rx="3" fill={INK} />
          <rect x="0" y="28" width="72" height="10" rx="3" fill={INK} />
        </g>
        {/* Base of laptop */}
        <rect x="-12" y="110" width="184" height="6" rx="3" fill={INK} />
        <rect x="-22" y="116" width="204" height="4" rx="2" fill={INK_SOFT} />

        <text
          x="80"
          y="138"
          textAnchor="middle"
          fontFamily="var(--mneme-font-sans)"
          fontSize="9"
          letterSpacing="1.5"
          fill={INK}
        >
          YOUR DEVICE
        </text>
      </g>
    </svg>
  )
}

/** 02 — A single orange key, large and editorial. */
export function KeyIllustration() {
  return (
    <svg {...baseProps} role="img" aria-label="A key">
      <title>You hold the keys</title>
      {/* Subtle "owner" annotation */}
      <text
        x="40"
        y="48"
        fontFamily="var(--mneme-font-sans)"
        fontSize="9"
        letterSpacing="1.5"
        fill={INK_MUTE}
      >
        HELD BY YOU
      </text>
      <line x1="40" y1="56" x2="120" y2="56" stroke={INK_LINE} strokeWidth="1" />

      {/* Key, horizontal, orange */}
      <g transform="translate(54, 95)">
        {/* Bow (head) */}
        <circle cx="32" cy="20" r="28" fill="none" stroke={ORANGE} strokeWidth="3" />
        <circle cx="32" cy="20" r="9" fill={CREAM} stroke={ORANGE} strokeWidth="2" />

        {/* Shaft */}
        <rect x="58" y="17" width="148" height="6" rx="2" fill={ORANGE} />

        {/* Teeth */}
        <rect x="178" y="17" width="6" height="14" fill={ORANGE} />
        <rect x="190" y="17" width="6" height="10" fill={ORANGE} />
        <rect x="202" y="17" width="4" height="14" fill={ORANGE} />

        {/* Light ink line beneath for editorial weight */}
        <line
          x1="0"
          y1="56"
          x2="220"
          y2="56"
          stroke={INK_LINE}
          strokeDasharray="2 4"
          strokeWidth="1"
        />
      </g>
    </svg>
  )
}

/** 03 — An open spec document with version label. */
export function SpecIllustration() {
  return (
    <svg {...baseProps} role="img" aria-label="Open protocol specification">
      <title>The protocol is an open, versioned spec</title>
      <g transform="translate(60, 30)">
        {/* Page */}
        <rect
          x="0"
          y="0"
          width="200"
          height="160"
          rx="6"
          fill={CREAM}
          stroke={INK}
          strokeWidth="1.5"
        />

        {/* Header band */}
        <rect x="0" y="0" width="200" height="34" rx="6" fill={INK} />
        <text
          x="16"
          y="22"
          fontFamily="var(--mneme-font-mono)"
          fontSize="11"
          fill={CREAM}
          letterSpacing="1"
        >
          MNEME-PROTOCOL.MD
        </text>
        <g transform="translate(160, 9)">
          <rect width="32" height="16" rx="8" fill={ORANGE} />
          <text
            x="16"
            y="11"
            textAnchor="middle"
            fontFamily="var(--mneme-font-sans)"
            fontSize="9"
            fill={CREAM}
            letterSpacing="1"
          >
            v0.1
          </text>
        </g>

        {/* Text lines — fake doc content */}
        <g fill={INK_SOFT}>
          <rect x="16" y="52" width="120" height="3" rx="1.5" />
          <rect x="16" y="62" width="160" height="3" rx="1.5" />
          <rect x="16" y="72" width="96" height="3" rx="1.5" />

          <rect x="16" y="90" width="60" height="3" rx="1.5" fill={ORANGE} />
          <rect x="16" y="100" width="148" height="3" rx="1.5" />
          <rect x="16" y="110" width="132" height="3" rx="1.5" />

          <rect x="16" y="128" width="60" height="3" rx="1.5" fill={ORANGE} />
          <rect x="16" y="138" width="120" height="3" rx="1.5" />
        </g>
      </g>

      <text
        x="160"
        y="206"
        textAnchor="middle"
        fontFamily="var(--mneme-font-sans)"
        fontSize="9"
        letterSpacing="1.5"
        fill={INK_MUTE}
      >
        PUBLISHED · VERSIONED · OPEN
      </text>
    </svg>
  )
}

/** 04 — Central store with thin lines radiating out to the four AI marks. */
export function CrossProviderIllustration() {
  const apps = [
    { x: 60, y: 50, Logo: ClaudeLogo, label: 'Claude' },
    { x: 260, y: 50, Logo: CursorLogo, label: 'Cursor' },
    { x: 60, y: 170, Logo: OpenAILogo, label: 'ChatGPT' },
    { x: 260, y: 170, Logo: GeminiLogo, label: 'Gemini' },
  ]

  return (
    <svg
      {...baseProps}
      role="img"
      aria-label="One memory, every model — Claude, Cursor, ChatGPT, Gemini"
    >
      <title>Works across every model</title>

      {/* Lines from centre to each satellite */}
      {apps.map((app) => (
        <line
          key={`line-${app.label}`}
          x1="160"
          y1="110"
          x2={app.x}
          y2={app.y}
          stroke={INK}
          strokeWidth="1"
          strokeDasharray="2 4"
          opacity="0.45"
        />
      ))}

      {/* Satellite circles with actual product logos inside */}
      {apps.map((app) => {
        const Logo = app.Logo
        return (
          <g
            key={`sat-${app.label}`}
            transform={`translate(${app.x - 22}, ${app.y - 22})`}
            style={{ color: INK }}
          >
            <circle cx="22" cy="22" r="22" fill={CREAM} stroke={INK} strokeWidth="1.5" />
            <g transform="translate(8, 8)">
              <Logo size={28} />
            </g>
          </g>
        )
      })}

      {/* Central mneme store */}
      <g transform="translate(120, 70)">
        <rect width="80" height="80" rx="14" fill={PAPER} stroke={INK} strokeWidth="1.5" />
        {/* mneme bars motif */}
        <g transform="translate(14, 14)">
          <rect x="14" y="0" width="24" height="8" rx="3" fill={ORANGE} />
          <rect x="8" y="12" width="36" height="8" rx="3" fill={INK} />
          <rect x="2" y="24" width="48" height="8" rx="3" fill={INK} />
        </g>
        <text
          x="40"
          y="68"
          textAnchor="middle"
          fontFamily="var(--mneme-font-sans)"
          fontSize="8"
          letterSpacing="1.5"
          fill={INK_MUTE}
        >
          MNEME
        </text>
      </g>
    </svg>
  )
}

/** 05 — A portable case with the mneme bars peeking from inside; an arrow showing portability. */
export function PortableIllustration() {
  return (
    <svg {...baseProps} role="img" aria-label="Take your encrypted store with you">
      <title>Take it with you</title>

      {/* Direction arrow above */}
      <g transform="translate(36, 38)">
        <line
          x1="0"
          y1="0"
          x2="80"
          y2="0"
          stroke={INK_MUTE}
          strokeWidth="1"
          strokeDasharray="3 4"
        />
        <path
          d="M 78 -6 L 86 0 L 78 6"
          fill="none"
          stroke={INK_MUTE}
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <text
          x="100"
          y="4"
          fontFamily="var(--mneme-font-sans)"
          fontSize="9"
          letterSpacing="1.5"
          fill={INK_MUTE}
        >
          PORTABLE
        </text>
      </g>

      {/* Case — rounded rectangle with handle */}
      <g transform="translate(40, 70)">
        {/* Handle */}
        <path
          d="M 90 0 Q 90 -18, 120 -18 Q 150 -18, 150 0"
          fill="none"
          stroke={INK}
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* Body */}
        <rect
          x="0"
          y="0"
          width="240"
          height="120"
          rx="14"
          fill={CREAM}
          stroke={INK}
          strokeWidth="1.5"
        />
        {/* Latch */}
        <rect x="110" y="-2" width="20" height="6" rx="2" fill={INK} />

        {/* Inner inset */}
        <rect
          x="14"
          y="14"
          width="212"
          height="92"
          rx="8"
          fill={PAPER}
          stroke={INK_LINE}
          strokeWidth="1"
        />

        {/* mneme bars inside the case */}
        <g transform="translate(78, 32)">
          <rect x="28" y="0" width="48" height="14" rx="4" fill={ORANGE} />
          <rect x="14" y="22" width="76" height="14" rx="4" fill={INK} />
          <rect x="0" y="44" width="104" height="14" rx="4" fill={INK} />
        </g>
      </g>
    </svg>
  )
}
