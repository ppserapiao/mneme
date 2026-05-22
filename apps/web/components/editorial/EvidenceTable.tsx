/**
 * Section 03 — the evidence. Benchmark presented as a financial-style
 * sidebar table, not a generic SaaS "stats" section.
 *
 * GTM rationale: this is where a HN reader pauses. The 62.4-vs-8.5
 * gap is our most defensible artefact and the screenshotted-on-Twitter
 * moment. We frame it carefully:
 *   - Two paragraphs of methodology BEFORE the numbers (not "look at
 *     these numbers" — "here's how we measured, and here's what we found")
 *   - Tied semantic F1 acknowledged before the strict-F1 win (honest
 *     framing — Mem0 extracts the same facts; we just preserve the
 *     source language)
 *   - Three bullets explaining WHY strict matters (citations, audit,
 *     reproducibility) — closes the "isn't strict an arbitrary measure"
 *     counterargument before it's raised
 *   - Source footnote with the actual baseline file path (auditable)
 */
export function EvidenceTable() {
  return (
    <section id="evidence" className="editorial-section editorial-section--evidence">
      <div className="editorial-evidence-grid">
        <div className="editorial-evidence-marker">
          <div className="editorial-numeral" aria-hidden="true">
            03
          </div>
          <div className="editorial-section-label">the evidence</div>
          <div className="editorial-section-kicker">what we measured</div>
        </div>

        <div className="editorial-evidence-body">
          <h2 className="editorial-h2">
            100 samples, six everyday contexts, scored two ways. Same models on both sides.
          </h2>

          <p className="editorial-prose">
            We extract memories from real conversation transcripts, then check whether the right
            things were extracted. Two matchers run on every sample: a strict keyword check (does
            the extracted memory mention the expected facts?) and an independent LLM judge (does the
            extracted memory mean the same thing as the expected one?). Both numbers are reported
            every run.
          </p>

          <p className="editorial-prose">
            Against{' '}
            <a
              href="https://github.com/mem0ai/mem0"
              target="_blank"
              rel="noreferrer"
              className="editorial-link"
            >
              Mem0 v3.0.3
            </a>{' '}
            — the open-source memory system most often cited as state of the art — we tie on
            semantic F1 and dominate on strict F1 by 53.9 points. The semantic tie means we extract
            roughly the same underlying facts. The strict gap is <em>structural</em>: Mem0
            paraphrases inputs into its own canonical form; mneme preserves the user's source
            language.
          </p>

          <div className="editorial-evidence-table-frame">
            <div className="editorial-evidence-table-head">
              <span className="editorial-evidence-table-source">tests/eval/baselines/</span>
              <span className="editorial-evidence-table-stamp">2026-05-20 · 100 samples</span>
            </div>
            <table className="editorial-evidence-table">
              <thead>
                <tr>
                  <th>metric</th>
                  <th>method</th>
                  <th className="num">mneme</th>
                  <th className="num">Mem0 v3.0.3</th>
                  <th className="num">Δ</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>semantic F1</td>
                  <td>LLM judge</td>
                  <td className="num">
                    78.1<span className="pct">%</span>
                  </td>
                  <td className="num">
                    78.5<span className="pct">%</span>
                  </td>
                  <td className="num delta delta-tied">tied</td>
                </tr>
                <tr className="editorial-evidence-table-row-feature">
                  <td>strict F1</td>
                  <td>keyword match</td>
                  <td className="num win">
                    62.4<span className="pct">%</span>
                  </td>
                  <td className="num">
                    8.5<span className="pct">%</span>
                  </td>
                  <td className="num delta delta-win">+53.9 pts</td>
                </tr>
              </tbody>
            </table>
            <div className="editorial-evidence-table-foot">
              <span>
                judge: claude-haiku-4-5 · distillers: claude-sonnet-4-6 (both sides) · runtime 228s
                · $2.02 judge spend
              </span>
            </div>
          </div>

          <div className="editorial-evidence-bullets">
            <div className="editorial-evidence-bullet">
              <span className="editorial-evidence-bullet-mark">01</span>
              <div>
                <h3>citations</h3>
                <p>
                  Every surfaced memory traces back to what was actually said. The user can inspect
                  the source line in their own store, with cryptographic provenance.
                </p>
              </div>
            </div>
            <div className="editorial-evidence-bullet">
              <span className="editorial-evidence-bullet-mark">02</span>
              <div>
                <h3>audit</h3>
                <p>
                  Compliance teams can verify the encrypted store against the original transcript.
                  Paraphrased canonical forms break that chain.
                </p>
              </div>
            </div>
            <div className="editorial-evidence-bullet">
              <span className="editorial-evidence-bullet-mark">03</span>
              <div>
                <h3>reproducibility</h3>
                <p>
                  Strict keyword matching is deterministic. Semantic similarity drifts as judge
                  models improve — useful, but not load-bearing for a regression test.
                </p>
              </div>
            </div>
          </div>

          <p className="editorial-evidence-meta">
            <span className="editorial-eyebrow">methodology</span>
            <a
              href="https://github.com/ppserapiao/mneme/blob/main/decisions/0013-eval-harness.md"
              target="_blank"
              rel="noreferrer"
              className="editorial-link"
            >
              adr 0013 — eval harness
            </a>{' '}
            ·{' '}
            <a
              href="https://github.com/ppserapiao/mneme/blob/main/decisions/0014-eval-judge-mode.md"
              target="_blank"
              rel="noreferrer"
              className="editorial-link"
            >
              adr 0014 — dual matcher
            </a>{' '}
            ·{' '}
            <a
              href="https://github.com/ppserapiao/mneme/blob/main/decisions/0015-comparative-eval.md"
              target="_blank"
              rel="noreferrer"
              className="editorial-link"
            >
              adr 0015 — comparative eval
            </a>{' '}
            · raw baselines at{' '}
            <a
              href="https://github.com/ppserapiao/mneme/tree/main/tests/eval/baselines"
              target="_blank"
              rel="noreferrer"
              className="editorial-link editorial-mono"
            >
              tests/eval/baselines/
            </a>
          </p>
        </div>
      </div>
    </section>
  )
}
