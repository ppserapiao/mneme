import { ClaudeLogo, CursorLogo, GeminiLogo, OpenAILogo, ZedLogo } from './Logos'

export function Architecture() {
  return (
    <section className="section" id="architecture">
      <div className="section-head">
        <div>
          <div className="num">04 — Architecture</div>
        </div>
        <div>
          <h2 className="h-section">
            Memory lives with the user. Apps <em>request access</em>. The protocol is the only
            contract.
          </h2>
        </div>
      </div>

      <div className="arch-diagram">
        <ArchDiagram />
      </div>

      <div className="arch-explain">
        <div className="arch-card">
          <span className="eyebrow">User device</span>
          <p>
            Encrypted SQLite, AES-256-GCM at rest, Ed25519-signed writes, on-device embeddings,
            BIP-39 recovery phrase. Keys never leave the device.
          </p>
        </div>
        <div className="arch-card">
          <span className="eyebrow">Open protocol</span>
          <p>
            The Mneme Protocol — versioned wire format and verb set. Anyone can implement it.{' '}
            <a
              href="https://github.com/ppserapiao/mneme/tree/main/docs/protocol"
              target="_blank"
              rel="noreferrer"
            >
              Read the spec.
            </a>
          </p>
        </div>
        <div className="arch-card">
          <span className="eyebrow">Transports</span>
          <p>
            In-process, WebSocket, or hosted (forthcoming). Whichever you pick, the encrypted
            envelope stays sealed end-to-end.
          </p>
        </div>
        <div className="arch-card">
          <span className="eyebrow">Apps</span>
          <p>
            Claude Code, Cursor, any MCP host, any direct SDK consumer. They request access; the
            user authorises and revokes.
          </p>
        </div>
      </div>
    </section>
  )
}

/**
 * Editorial cross-section. One central vault carrying the mneme mark + a small
 * padlock above it (user holds the key). A thin dashed protocol horizon below
 * the vault. A row of actual product logos along the bottom, split by status:
 * supported today (full ink) versus roadmap (ink-mute).
 */
function ArchDiagram() {
  return (
    <svg
      viewBox="0 0 1200 640"
      role="img"
      aria-label="mneme architecture: a vault on the user's device, an open protocol, and the apps that request access"
      width="100%"
      style={{ display: 'block', maxWidth: 1200 }}
    >
      <title>mneme architecture</title>
      <defs>
        <filter id="archVaultGrain" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="1.4"
            numOctaves={2}
            seed={1}
            stitchTiles="stitch"
          />
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.7 0" />
        </filter>
        <clipPath id="archMarkClip">
          <rect x={0} y={120} width={200} height={36} rx={8} />
          <rect x={20} y={64} width={160} height={36} rx={8} />
          <rect x={45} y={8} width={110} height={36} rx={8} />
        </clipPath>
      </defs>

      {/* === Eyebrow above vault === */}
      <text
        x={600}
        y={42}
        textAnchor="middle"
        fontFamily="var(--mneme-font-sans)"
        fontSize={11}
        letterSpacing={2.5}
        fill="#8a7a6a"
      >
        YOUR DEVICE · ENCRYPTED · LOCAL-FIRST
      </text>

      {/* === Padlock sitting above the vault, top-centre === */}
      <g transform="translate(584, 62)">
        <title>User-held key</title>
        {/* Shackle */}
        <path
          d="M9 14 V10 a7 7 0 0 1 14 0 V14"
          fill="none"
          stroke="#E0651D"
          strokeWidth={2}
          strokeLinecap="round"
        />
        {/* Body */}
        <rect
          x={4}
          y={14}
          width={24}
          height={20}
          rx={4}
          fill="#FAF6EE"
          stroke="#E0651D"
          strokeWidth={2}
        />
        {/* Keyhole */}
        <circle cx={16} cy={22} r={2.2} fill="#E0651D" />
        <rect x={15} y={23} width={2} height={5} fill="#E0651D" />
      </g>

      {/* === THE VAULT === */}
      <g transform="translate(360, 110)">
        <rect width={480} height={232} rx={18} fill="#FAF6EE" stroke="#15110F" strokeWidth={1.5} />
        <rect
          x={6}
          y={6}
          width={468}
          height={220}
          rx={14}
          fill="none"
          stroke="#d9cfbd"
          strokeWidth={1}
        />

        {/* The mark, left side of vault */}
        <g transform="translate(46, 36)">
          <rect x={0} y={120} width={200} height={36} rx={8} fill="#15110F" />
          <rect x={20} y={64} width={160} height={36} rx={8} fill="#15110F" />
          <rect x={45} y={8} width={110} height={36} rx={8} fill="#E0651D" />
          <g clipPath="url(#archMarkClip)" style={{ mixBlendMode: 'multiply' }} opacity={0.55}>
            <rect x={0} y={0} width={220} height={170} filter="url(#archVaultGrain)" />
          </g>
        </g>

        {/* Vault labels, right of mark */}
        <g transform="translate(284, 60)">
          <text
            fontFamily="var(--mneme-font-display)"
            fontSize={28}
            fill="#15110F"
            letterSpacing={-0.4}
          >
            <tspan x={0} y={0}>
              encrypted
            </tspan>
            <tspan x={0} y={32}>
              store
            </tspan>
          </text>

          <line x1={0} y1={54} x2={160} y2={54} stroke="#d9cfbd" strokeWidth={1} />

          <g fontFamily="var(--mneme-font-sans)" fontSize={11} fill="#3d342c" letterSpacing={1.2}>
            <text x={0} y={76}>
              AES-256-GCM · ED25519
            </text>
            <text x={0} y={94}>
              LOCAL SQLITE
            </text>
            <text x={0} y={112}>
              BIP-39 RECOVERY
            </text>
          </g>

          <text
            x={0}
            y={146}
            fontFamily="var(--mneme-font-serif)"
            fontStyle="italic"
            fontSize={13}
            fill="#8a7a6a"
          >
            keys never leave the device
          </text>
        </g>
      </g>

      {/* === Vertical connector down to protocol horizon === */}
      <line
        x1={600}
        y1={342}
        x2={600}
        y2={398}
        stroke="#15110F"
        strokeOpacity={0.35}
        strokeWidth={1}
        strokeDasharray="3 4"
      />

      {/* === PROTOCOL HORIZON === */}
      <g transform="translate(0, 412)">
        <line
          x1={80}
          y1={0}
          x2={1120}
          y2={0}
          stroke="#15110F"
          strokeWidth={1.25}
          strokeDasharray="6 6"
          opacity={0.55}
        />

        {/* Centred capsule label */}
        <g transform="translate(600, 0)">
          <rect
            x={-220}
            y={-18}
            width={440}
            height={36}
            rx={18}
            fill="#F2ECE0"
            stroke="#15110F"
            strokeOpacity={0.4}
          />
          <text
            x={0}
            y={5}
            textAnchor="middle"
            fontFamily="var(--mneme-font-sans)"
            fontSize={12}
            letterSpacing={2.5}
            fill="#15110F"
          >
            MNEME PROTOCOL v0.1 — OPEN SPEC
          </text>
        </g>

        {/* Single italic annotation below the horizon, centred — no left-side
            verbs label, no right-side side-note. The capsule label IS the
            information layer; the italic line gives it editorial voice. */}
        <text
          x={600}
          y={48}
          textAnchor="middle"
          fontFamily="var(--mneme-font-serif)"
          fontStyle="italic"
          fontSize={14}
          fill="#3d342c"
        >
          apps request access — the user decides
        </text>
      </g>

      {/* === Section labels above logo row.
             Sit above the cells, NOT above the dashed connectors (which we
             removed). Positioned so they read as group headers, not as
             collisions with anything. */}
      <text
        x={420}
        y={482}
        textAnchor="middle"
        fontFamily="var(--mneme-font-sans)"
        fontSize={11}
        letterSpacing={2.2}
        fill="#15110F"
      >
        TODAY · VIA MCP
      </text>
      <text
        x={870}
        y={482}
        textAnchor="middle"
        fontFamily="var(--mneme-font-sans)"
        fontSize={11}
        letterSpacing={2.2}
        fill="#8a7a6a"
      >
        ROADMAP · VIA CLOUD API
      </text>

      {/* Soft vertical divider between today vs roadmap groups */}
      <line
        x1={690}
        y1={498}
        x2={690}
        y2={602}
        stroke="#d9cfbd"
        strokeWidth={1}
        strokeDasharray="2 4"
      />

      {/* === Logo cells === */}
      <LogoCell x={240} y={510} label="Claude" sublabel="MCP" Logo={ClaudeLogo} />
      <LogoCell x={420} y={510} label="Cursor" sublabel="MCP" Logo={CursorLogo} />
      <LogoCell x={600} y={510} label="Zed" sublabel="MCP" Logo={ZedLogo} />
      <LogoCell x={780} y={510} label="ChatGPT" sublabel="v0.2" Logo={OpenAILogo} muted />
      <LogoCell x={960} y={510} label="Gemini" sublabel="v0.2" Logo={GeminiLogo} muted />

      {/* === Footer caption — covers the SDK-consumer surface area === */}
      <text
        x={600}
        y={628}
        textAnchor="middle"
        fontFamily="var(--mneme-font-serif)"
        fontStyle="italic"
        fontSize={13}
        fill="#8a7a6a"
      >
        or any TypeScript app via{' '}
        <tspan fontFamily="var(--mneme-font-mono)" fontStyle="normal" fontSize={12} fill="#3d342c">
          @mnemehq/sdk
        </tspan>
      </text>
    </svg>
  )
}

function LogoCell({
  x,
  y,
  label,
  sublabel,
  Logo,
  muted,
}: {
  x: number
  y: number
  label: string
  sublabel: string
  Logo: (props: { size?: number; className?: string }) => React.ReactElement
  muted?: boolean
}) {
  const ink = muted ? '#8a7a6a' : '#15110F'
  return (
    <g transform={`translate(${x}, ${y})`} style={{ color: ink }}>
      {/* Logo rendered in currentColor */}
      <g transform="translate(-18, 0)">
        <Logo size={36} />
      </g>
      <text
        y={62}
        textAnchor="middle"
        fontFamily="var(--mneme-font-display)"
        fontSize={20}
        letterSpacing={-0.3}
        fill={ink}
      >
        {label}
      </text>
      <text
        y={82}
        textAnchor="middle"
        fontFamily="var(--mneme-font-sans)"
        fontSize={10}
        letterSpacing={2}
        fill={muted ? '#B8481A' : '#8a7a6a'}
      >
        {sublabel}
      </text>
    </g>
  )
}
