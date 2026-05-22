import { Mark } from '../Mark'

/**
 * Section 07 — the close. Single huge pull quote, magazine spread style.
 *
 * GTM rationale: the page has made its argument. This is the emotional
 * close — one sentence that compresses the whole thesis into something
 * tweetable. We set it bigger than anything else on the page.
 *
 * No CTAs here. The CTA was the install section.
 */
export function PullQuoteBig() {
  return (
    <section className="editorial-section editorial-section--pull-quote">
      <div className="editorial-pull-quote-wrap">
        <Mark size={56} variant="inverse" className="editorial-pull-quote-mark" />
        <blockquote className="editorial-pull-quote">
          <p className="editorial-pull-quote-line editorial-pull-quote-line--them">
            Mem0 helps agents <em>remember</em> users.
          </p>
          <hr className="editorial-pull-quote-rule" />
          <p className="editorial-pull-quote-line editorial-pull-quote-line--us">
            mneme helps users <em>own</em> their memory.
          </p>
        </blockquote>
        <div className="editorial-pull-quote-attr">— the thesis, in one line</div>
      </div>
    </section>
  )
}
