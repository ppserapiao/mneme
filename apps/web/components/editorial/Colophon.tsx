import { GithubLogo } from '../Logos'

/**
 * Section 08 — the colophon. Magazine-publishing term for "this is who
 * made this and how." Single line, mono, confident understatement.
 *
 * GTM rationale: nothing trying to convert. Nothing trying to capture
 * email. Just the meta — license, repo, contact, the type system used,
 * the page's own provenance. Signals "we know the rules, we're choosing
 * to break them" because every SaaS landing has a footer link farm here.
 */
export function Colophon() {
  return (
    <footer className="editorial-colophon">
      <div className="editorial-colophon-rule" aria-hidden="true" />

      <div className="editorial-colophon-grid">
        <div className="editorial-colophon-cell">
          <span className="editorial-colophon-label">licence</span>
          <span className="editorial-colophon-value">apache 2.0</span>
        </div>
        <div className="editorial-colophon-cell">
          <span className="editorial-colophon-label">source</span>
          <a
            href="https://github.com/ppserapiao/mneme"
            target="_blank"
            rel="noreferrer"
            className="editorial-colophon-value editorial-link"
          >
            <GithubLogo size={12} />
            github.com/ppserapiao/mneme
          </a>
        </div>
        <div className="editorial-colophon-cell">
          <span className="editorial-colophon-label">community</span>
          <a
            href="https://github.com/ppserapiao/mneme/discussions"
            target="_blank"
            rel="noreferrer"
            className="editorial-colophon-value editorial-link"
          >
            github discussions
          </a>
        </div>
        <div className="editorial-colophon-cell">
          <span className="editorial-colophon-label">contact</span>
          <a
            href="mailto:ptengelmann@gmail.com"
            className="editorial-colophon-value editorial-link"
          >
            ptengelmann@gmail.com
          </a>
        </div>
        <div className="editorial-colophon-cell">
          <span className="editorial-colophon-label">security</span>
          <a
            href="https://github.com/ppserapiao/mneme/blob/main/SECURITY.md"
            target="_blank"
            rel="noreferrer"
            className="editorial-colophon-value editorial-link"
          >
            responsible disclosure
          </a>
        </div>
      </div>

      <div className="editorial-colophon-foot">
        <span>v0.1 · the lede issue · may 2026 · london.</span>
      </div>
    </footer>
  )
}
