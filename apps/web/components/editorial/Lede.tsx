import { ClaudeLogo, CursorLogo, GeminiLogo, GithubLogo, OpenAILogo } from '../Logos'

/**
 * Section 02 — the lede. The single editorial paragraph that establishes
 * the central tension: memory has become the lock-in of the AI era;
 * mneme is the structural inverse.
 *
 * GTM rationale: this is the page's most important paragraph. A HN reader
 * decides whether to keep scrolling here. We give them ONE long sentence
 * with three escalating clauses ("on servers you don't run, in schemas
 * you can't read, locked to a product you might want to leave"), then
 * the single-sentence claim ("mneme is the structural inverse"), then
 * the cycling product line that telegraphs cross-provider portability.
 *
 * Design choices:
 *   - Drop cap (Instrument Serif M, four-line, orange) — magazine signature
 *   - Newsreader serif body, generous tracking
 *   - The cycling line is now a SUBHEAD, not the headline (existing design
 *     led with it; new design leads with the editorial argument)
 *   - Status / Protocol / Licence metadata moves to a marginal note
 */
export function Lede() {
  return (
    <section id="lede" className="editorial-section editorial-section--lede">
      <div className="editorial-lede-grid">
        <div className="editorial-lede-marker">
          <div className="editorial-numeral" aria-hidden="true">
            02
          </div>
          <div className="editorial-section-label">the lede</div>
          <div className="editorial-section-kicker">what this is</div>
        </div>

        <div className="editorial-lede-body">
          <p className="editorial-lede-paragraph">
            <span className="editorial-drop-cap" aria-hidden="true">
              M
            </span>
            <span className="editorial-drop-cap-sr">M</span>emory has become the lock-in of the AI
            era. Every chatbot, every assistant, every agent now learns who you are — your
            preferences, your projects, your patterns — and stores it on servers you don't run, in
            schemas you can't read, locked to a product you might want to leave.{' '}
            <strong>mneme is the structural inverse</strong>: an open protocol for memory that lives
            on your device, encrypted with keys only you hold, and synced through whichever backend
            you trust.
          </p>

          <div className="editorial-lede-cycling">
            <span className="editorial-lede-cycling-label">memory for</span>
            <span
              className="cycling-product editorial-lede-cycling-track"
              aria-label="Claude, Cursor, ChatGPT, Gemini, and anything next"
            >
              <span className="cycling-item">
                <ClaudeLogo size={28} />
                <span>Claude</span>
              </span>
              <span className="cycling-item">
                <CursorLogo size={28} />
                <span>Cursor</span>
              </span>
              <span className="cycling-item">
                <OpenAILogo size={28} />
                <span>ChatGPT</span>
              </span>
              <span className="cycling-item">
                <GeminiLogo size={28} />
                <span>Gemini</span>
              </span>
              <span className="cycling-item">
                <em>anything next</em>
              </span>
            </span>
          </div>

          <div className="editorial-lede-ctas">
            <a
              href="https://github.com/ppserapiao/mneme"
              target="_blank"
              rel="noreferrer"
              className="editorial-cta editorial-cta--primary"
            >
              <GithubLogo size={14} />
              read the source
            </a>
            <a href="#evidence" className="editorial-cta editorial-cta--ghost">
              jump to the evidence ↓
            </a>
          </div>
        </div>

        <aside className="editorial-lede-marginalia">
          <div className="editorial-marginalia-item">
            <span className="editorial-marginalia-label">status</span>
            <span className="editorial-marginalia-value">public beta · sdk on npm</span>
          </div>
          <div className="editorial-marginalia-item">
            <span className="editorial-marginalia-label">protocol</span>
            <span className="editorial-marginalia-value">v0.1 draft · open spec</span>
          </div>
          <div className="editorial-marginalia-item">
            <span className="editorial-marginalia-label">licence</span>
            <span className="editorial-marginalia-value">apache 2.0</span>
          </div>
          <div className="editorial-marginalia-item">
            <span className="editorial-marginalia-label">runtime</span>
            <span className="editorial-marginalia-value">bun ≥ 1.3</span>
          </div>
        </aside>
      </div>
    </section>
  )
}
