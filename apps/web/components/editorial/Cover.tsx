import { Mark } from '../Mark'

/**
 * Section 01 — the cover. Magazine-cover discipline: mark, wordmark,
 * one italic tagline, scroll cue. No CTAs, no copy soup, no pills.
 *
 * GTM rationale: this is the brand statement. A HN reader arriving here
 * has 1.5 seconds to register "this is a serious thing" before they
 * scroll. We are paying that with restraint, not noise.
 */
export function Cover() {
  return (
    <section id="cover" className="editorial-cover">
      <div className="editorial-cover-bar editorial-cover-bar-top">
        <span>mneme</span>
        <span>v0.1 · the lede issue</span>
        <span>may 2026</span>
      </div>

      <div className="editorial-cover-stack">
        <Mark size={156} />
        <h1 className="editorial-cover-wordmark">
          mneme<span className="editorial-cover-dot">.</span>
        </h1>
        <p className="editorial-cover-tagline">
          the open, <em>user-sovereign</em> memory layer for AI.
        </p>
      </div>

      <div className="editorial-cover-bar editorial-cover-bar-bottom">
        <span>apache 2.0</span>
        <span>local-first · cross-provider · open protocol</span>
        <span>scroll</span>
      </div>
    </section>
  )
}
