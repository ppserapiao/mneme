import { Mark } from './Mark'

export function PullQuote() {
  return (
    <section className="pull-quote-section">
      <div className="quote-banner">
        <div className="quote-banner-inner">
          <Mark size={40} variant="inverse" />
          <p className="quote-eyebrow">The thesis, in one line</p>

          <p className="quote-them">
            Mem0 helps agents <em>remember</em> users.
          </p>

          <div className="quote-rule" aria-hidden="true" />

          <p className="quote-us">
            mneme helps users <em>own</em> their memory.
          </p>
        </div>
      </div>
    </section>
  )
}
