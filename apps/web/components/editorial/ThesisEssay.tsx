/**
 * Section 04 — the thesis. Long-form essay structure, NOT a horizontal
 * marker-left/text-right stack. Each principle is a self-contained
 * editorial unit with vertical rhythm:
 *
 *   ─── horizontal rule ───
 *   01 / DEVICE
 *   "Your memory lives on your device."
 *   Tight body text in a narrow readable column.
 *
 * Magazine pattern: a narrow text column (~60ch) reads faster than a
 * wide one because the eye doesn't have to traverse far between line
 * ends. Long-form sites that do this well: Stratechery, The Atlantic
 * (long-read), the Latent Space blog.
 *
 * GTM rationale: the previous design had marker-left, text-right
 * horizontal cards. Pedro flagged it as "too much text, all horizontal,
 * hard to read." The fix is structural: stop laying out per-principle
 * horizontally, lay out per-principle vertically with a tight column.
 *
 * One pull quote breaks the column at the midpoint — visual rhythm,
 * one moment to look up from the text, then back in.
 */
export function ThesisEssay() {
  return (
    <section id="thesis" className="editorial-section editorial-section--thesis">
      <div className="editorial-thesis-marker-row">
        <div className="editorial-numeral" aria-hidden="true">
          04
        </div>
        <div className="editorial-thesis-marker-meta">
          <div className="editorial-section-label">the thesis</div>
          <div className="editorial-section-kicker">why mneme exists</div>
        </div>
      </div>

      <div className="editorial-thesis-column">
        <h2 className="editorial-thesis-lead">
          We compete on <em>whose</em> memory it is — not on whose retrieval scores half a point
          higher.
        </h2>

        <p className="editorial-thesis-intro">
          Every existing memory system — Mem0, Letta, Zep, ChatGPT Memory, Claude Projects — chose
          the same model: your data on their servers, in their schema, available only inside their
          product. mneme is the structural inverse. Six principles, in order of how much they
          constrain every decision.
        </p>

        <Principle num="01" label="device" headline="Your memory lives on your device.">
          The store is a SQLite file on your machine. Sealed on disk with AES-256-GCM, signed with
          Ed25519, queryable in milliseconds. No round trip to a server for a single recall. No
          subpoena risk we can satisfy in plaintext — we never have it in plaintext.
        </Principle>

        <Principle num="02" label="keys" headline="You hold the keys. We never do.">
          Master keys derive from your passphrase via Argon2id — slow on purpose. A 24-word BIP-39
          phrase recovers the same store if the passphrase is lost. The server, when there is one,
          sees only encrypted envelopes.
        </Principle>

        <Principle num="03" label="protocol" headline="An open, versioned spec.">
          <span className="editorial-mono">remember</span>,{' '}
          <span className="editorial-mono">recall</span>,{' '}
          <span className="editorial-mono">forget</span>,{' '}
          <span className="editorial-mono">supersede</span>,{' '}
          <span className="editorial-mono">export</span>,{' '}
          <span className="editorial-mono">sync</span>. Five verbs and a schema. Anyone can
          implement it — Python next, then Go, then Rust. Conformance tests in the same repo as the
          reference SDK.
        </Principle>

        <aside className="editorial-thesis-pullquote">
          <p>
            <em>Tied to none.</em> The same memory store you build with Claude is the one ChatGPT,
            Cursor, Gemini, and whatever ships next read from. Neutrality is the moat.
          </p>
        </aside>

        <Principle num="04" label="cross-provider" headline="One memory. Every model.">
          The MCP server ships today; HTTP and SSE adapters follow. The same protocol speaks to
          every host — no model-specific schema, no provider lock-in.
        </Principle>

        <Principle num="05" label="portable" headline="Take your encrypted store with you.">
          One verb to export the whole file. The format is the same one we use internally — no
          proprietary wrapper. If a better memory system ships tomorrow, copy your file there. Our
          advantage is quality and neutrality, not friction.
        </Principle>

        <Principle
          num="06"
          label="boring"
          headline="Boring where it doesn't matter. World-class where it does."
        >
          Postgres. SQLite. Bun. tsdown. Apache 2.0. Tested against real backends, not mocks. The
          novelty budget goes to the genuinely hard problems — encrypted semantic retrieval, CRDT
          sync across devices, cross-provider portability. The rest is meant to be unremarkable.
        </Principle>
      </div>
    </section>
  )
}

function Principle({
  num,
  label,
  headline,
  children,
}: {
  num: string
  label: string
  headline: string
  children: React.ReactNode
}) {
  return (
    <article className="editorial-principle">
      <header className="editorial-principle-head">
        <span className="editorial-principle-num">{num}</span>
        <span className="editorial-principle-divider" aria-hidden="true" />
        <span className="editorial-principle-label">{label}</span>
      </header>
      <h3 className="editorial-principle-headline">{headline}</h3>
      <p className="editorial-principle-text">{children}</p>
    </article>
  )
}
