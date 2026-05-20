import { GithubLogo } from './Logos'
import { Mark } from './Mark'

export function Nav() {
  return (
    <nav className="nav">
      <a href="/" className="nav-lockup" aria-label="mneme home">
        <Mark size={28} />
        <span className="nav-wordmark">mneme</span>
      </a>
      <div className="nav-links">
        <a href="#benchmark" className="nav-link">
          Benchmark
        </a>
        <a href="#install" className="nav-link">
          Install
        </a>
        <a href="#architecture" className="nav-link">
          Architecture
        </a>
        <a
          href="https://github.com/ppserapiao/mneme"
          target="_blank"
          rel="noreferrer"
          className="btn btn-ghost nav-cta"
        >
          <GithubLogo size={14} />
          GitHub
        </a>
      </div>
    </nav>
  )
}
