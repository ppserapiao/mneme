import { GithubLogo } from '../Logos'
import { Mark } from '../Mark'

/**
 * Top nav — simplified for the editorial design. Wordmark left, GitHub
 * right. Internal anchor links live in the fixed SidebarNav on desktop;
 * no anchor cluster here.
 *
 * GTM rationale: a confident magazine doesn't have an anchor nav across
 * the top. The wordmark says "this is the publication" and the GitHub
 * link says "here's where the code lives." Everything else is the page
 * itself.
 */
export function EditorialNav() {
  return (
    <nav className="editorial-nav">
      <a href="#cover" className="editorial-nav-lockup" aria-label="mneme home">
        <Mark size={26} />
        <span className="editorial-nav-wordmark">mneme</span>
      </a>
      <a
        href="https://github.com/ppserapiao/mneme"
        target="_blank"
        rel="noreferrer"
        className="editorial-nav-cta"
      >
        <GithubLogo size={13} />
        <span>github</span>
      </a>
    </nav>
  )
}
