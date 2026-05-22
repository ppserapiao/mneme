import { ClaudeLogo, CursorLogo, GeminiLogo, OpenAILogo } from '../Logos'

/**
 * Section 05 — the architecture. Illustrated cross-section in the
 * field-guide style. Four horizontal layers stacked top-to-bottom:
 *
 *   APP SURFACE       Claude, Cursor, ChatGPT, Gemini, your own
 *   PROTOCOL          remember · recall · forget · supersede · export · sync
 *   ENCRYPTION        AES-256-GCM + Argon2id + Ed25519 signatures
 *   STORE             SQLite on your device · BIP-39 recovery
 *
 * GTM rationale: a HN reader who has accepted the thesis wants to know
 * "is the architecture as clean as the pitch?" This shows it: four
 * layers, named, with the actual mechanism listed beside each. No
 * fake-arrows, no logos on a venn diagram, no "AI" cloud icons.
 */
export function ArchitectureField() {
  return (
    <section id="architecture" className="editorial-section editorial-section--architecture">
      <div className="editorial-arch-grid">
        <div className="editorial-arch-marker">
          <div className="editorial-numeral" aria-hidden="true">
            05
          </div>
          <div className="editorial-section-label">the architecture</div>
          <div className="editorial-section-kicker">how it actually works</div>
        </div>

        <div className="editorial-arch-body">
          <h2 className="editorial-h2">
            Four layers. Each one replaceable. Each one inspectable. Each one capable of being its
            own product.
          </h2>

          <p className="editorial-prose">
            A cross-section, top to bottom. The app surface is where users see memory; the protocol
            is what apps speak; the encryption layer is where keys do their work; the store is the
            single SQLite file on your device. The server, when there is one, never holds plaintext.
          </p>

          <div className="editorial-arch-stack">
            <ArchLayer
              num="L4"
              label="app surface"
              note="any MCP-aware host today; HTTP + SSE adapters follow"
              accent="surface"
            >
              <div className="editorial-arch-apps">
                <span className="editorial-arch-app">
                  <ClaudeLogo size={20} />
                  <em>Claude</em>
                </span>
                <span className="editorial-arch-app">
                  <CursorLogo size={20} />
                  <em>Cursor</em>
                </span>
                <span className="editorial-arch-app">
                  <OpenAILogo size={20} />
                  <em>ChatGPT</em>
                </span>
                <span className="editorial-arch-app">
                  <GeminiLogo size={20} />
                  <em>Gemini</em>
                </span>
                <span className="editorial-arch-app editorial-arch-app--your">
                  <span className="editorial-arch-app-dot" />
                  <em>your own</em>
                </span>
              </div>
            </ArchLayer>

            <ArchLayer
              num="L3"
              label="the protocol"
              note="five verbs · open spec at /docs/protocol · v0.1 draft"
              accent="protocol"
            >
              <div className="editorial-arch-verbs">
                {['remember', 'recall', 'forget', 'supersede', 'export', 'sync'].map((v) => (
                  <span key={v} className="editorial-arch-verb">
                    {v}
                  </span>
                ))}
              </div>
            </ArchLayer>

            <ArchLayer
              num="L2"
              label="encryption"
              note="client-side · server sees only envelopes · zero plaintext server-side"
              accent="encryption"
            >
              <div className="editorial-arch-crypto">
                <span className="editorial-arch-crypto-tag">
                  <strong>AES-256-GCM</strong>
                  <em>body sealing</em>
                </span>
                <span className="editorial-arch-crypto-tag">
                  <strong>Argon2id</strong>
                  <em>passphrase KDF</em>
                </span>
                <span className="editorial-arch-crypto-tag">
                  <strong>Ed25519</strong>
                  <em>write signatures</em>
                </span>
                <span className="editorial-arch-crypto-tag">
                  <strong>BIP-39</strong>
                  <em>24-word recovery</em>
                </span>
              </div>
            </ArchLayer>

            <ArchLayer
              num="L1"
              label="the store"
              note="SQLite file on your device · syncable via any SyncPeer · CRDT-style convergence"
              accent="store"
            >
              <div className="editorial-arch-store">
                <span className="editorial-arch-store-file">
                  <span className="editorial-mono">~/.mneme/store.sqlite</span>
                  <em>encrypted at rest · queryable in milliseconds</em>
                </span>
              </div>
            </ArchLayer>
          </div>

          <p className="editorial-arch-note">
            The server is just another <span className="editorial-mono">SyncPeer</span>. WebSocket
            ships today (LAN-only, no auth); HTTP+JSON with bearer-token auth ships with Mneme Cloud
            in v0.2. Self-host the same code if you'd rather. The boundary between you and us is
            encryption, not trust.
          </p>
        </div>
      </div>
    </section>
  )
}

function ArchLayer({
  num,
  label,
  note,
  accent,
  children,
}: {
  num: string
  label: string
  note: string
  accent: 'surface' | 'protocol' | 'encryption' | 'store'
  children: React.ReactNode
}) {
  return (
    <div className={`editorial-arch-layer editorial-arch-layer--${accent}`}>
      <div className="editorial-arch-layer-head">
        <span className="editorial-arch-layer-num">{num}</span>
        <span className="editorial-arch-layer-label">{label}</span>
        <span className="editorial-arch-layer-note">{note}</span>
      </div>
      <div className="editorial-arch-layer-body">{children}</div>
    </div>
  )
}
