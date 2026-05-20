import { ClaudeLogo, CursorLogo, GeminiLogo, GithubLogo, OpenAILogo } from './Logos'

/**
 * Second-screen hero. Mirrors the Profound landing pattern: one giant display
 * headline with a CYCLING product (logo + name) that swaps every 2s on a 10s
 * loop, then a subheader, then the metadata DL and CTAs. The cycling visually
 * proves portability — "the same memory, every model" — without saying it.
 */
export function HeroDescription() {
  return (
    <section className="hero-desc">
      <div className="hero-desc-inner">
        <h2 className="hero-desc-h reveal">
          memory for{' '}
          <span
            className="cycling-product"
            aria-label="Claude, Cursor, ChatGPT, Gemini, and anything next"
          >
            <CyclingItem>
              <ClaudeLogo size={48} />
              <span>Claude</span>
            </CyclingItem>
            <CyclingItem>
              <CursorLogo size={48} />
              <span>Cursor</span>
            </CyclingItem>
            <CyclingItem>
              <OpenAILogo size={48} />
              <span>ChatGPT</span>
            </CyclingItem>
            <CyclingItem>
              <GeminiLogo size={48} />
              <span>Gemini</span>
            </CyclingItem>
            <CyclingItem>
              <em>anything next</em>
            </CyclingItem>
          </span>
        </h2>

        <p className="hero-desc-lede reveal">
          Your memory lives on your device, encrypted with keys only you hold, synced to a backend
          you choose. One memory, every model — local-first, cross-provider, yours to take with you.
        </p>

        <dl className="hero-desc-dl reveal">
          <dt>Status</dt>
          <dd>Public beta · SDK shipping on npm</dd>
          <dt>Protocol</dt>
          <dd>v0.1 draft · open spec at /docs/protocol</dd>
          <dt>Licence</dt>
          <dd>Apache 2.0</dd>
        </dl>

        <div className="hero-desc-ctas reveal">
          <a
            href="https://github.com/ppserapiao/mneme"
            target="_blank"
            rel="noreferrer"
            className="btn btn-primary"
          >
            <GithubLogo size={15} />
            View on GitHub
          </a>
          <a href="#benchmark" className="btn btn-ghost">
            See the benchmark
          </a>
        </div>
      </div>
    </section>
  )
}

function CyclingItem({ children }: { children: React.ReactNode }) {
  return <span className="cycling-item">{children}</span>
}
