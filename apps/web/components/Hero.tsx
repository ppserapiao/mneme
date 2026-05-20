import { Mark } from './Mark'

export function Hero() {
  return (
    <section className="hero-clean section first" id="top">
      <div className="hero-clean-stack">
        <div className="hero-clean-mark">
          <Mark size={140} />
        </div>
        <h1 className="hero-clean-wordmark">
          mneme<span className="dot">.</span>
        </h1>
        <p className="hero-clean-tagline">
          the open, <em>user-sovereign</em> memory layer for AI
        </p>
      </div>

      <div className="hero-scroll-cue" aria-hidden="true">
        <span>scroll</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <title>scroll indicator</title>
          <path
            d="M12 5v14M5 12l7 7 7-7"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </section>
  )
}
