import { GithubLogo } from './Logos'
import { Mark } from './Mark'

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-cta">
        <div className="footer-cta-text">
          <p className="eyebrow">Get started</p>
          <h2 className="h-section footer-h">
            The whole thing is open source. <em>Read it. Run it. Fork it.</em>
          </h2>
        </div>
        <div className="footer-cta-buttons">
          <a
            href="https://github.com/ppserapiao/mneme"
            target="_blank"
            rel="noreferrer"
            className="btn btn-primary"
          >
            <GithubLogo size={15} />
            GitHub
          </a>
          <a
            href="https://www.npmjs.com/package/@mnemehq/sdk"
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost"
          >
            npm · @mnemehq/sdk
          </a>
        </div>
      </div>

      <div className="footer-meta">
        <div className="footer-brand">
          <Mark size={22} variant="inverse" />
          <span className="footer-wordmark">mneme</span>
        </div>
        <div className="footer-links">
          <a href="https://github.com/ppserapiao/mneme" target="_blank" rel="noreferrer">
            Repo
          </a>
          <a
            href="https://github.com/ppserapiao/mneme/tree/main/docs/protocol"
            target="_blank"
            rel="noreferrer"
          >
            Protocol
          </a>
          <a
            href="https://github.com/ppserapiao/mneme/blob/main/BRIEF.md"
            target="_blank"
            rel="noreferrer"
          >
            Brief
          </a>
          <a
            href="https://github.com/ppserapiao/mneme/blob/main/ARCHITECTURE.md"
            target="_blank"
            rel="noreferrer"
          >
            Architecture
          </a>
        </div>
        <div className="footer-license">
          <span className="eyebrow">Apache 2.0</span>
        </div>
      </div>
    </footer>
  )
}
