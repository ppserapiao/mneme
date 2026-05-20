export function Benchmark() {
  return (
    <section className="section" id="benchmark">
      <div className="section-head">
        <div>
          <div className="num">02 — What we&apos;ve measured</div>
        </div>
        <div>
          <h2 className="h-section">
            100 samples, six everyday contexts, same models on both sides, scored two ways.
          </h2>
        </div>
      </div>

      <p className="lede benchmark-intro">
        Strict keyword match against expected facts. Independent LLM judging semantic equivalence.
        Both numbers reported every run — they tell two different stories about extraction quality.
      </p>

      <div className="benchmark-table">
        <div className="benchmark-row benchmark-header">
          <div className="benchmark-cell benchmark-metric">
            <span className="eyebrow">Metric</span>
          </div>
          <div className="benchmark-cell benchmark-number-head">
            <span className="eyebrow">mneme</span>
          </div>
          <div className="benchmark-cell benchmark-number-head">
            <span className="eyebrow">
              Mem0 <span className="mono">v3.0.3</span>
            </span>
          </div>
          <div className="benchmark-cell benchmark-number-head">
            <span className="eyebrow">Δ</span>
          </div>
        </div>

        <div className="benchmark-row">
          <div className="benchmark-cell benchmark-metric">
            <div className="benchmark-metric-name">Semantic F1</div>
            <div className="benchmark-metric-note">LLM judge</div>
          </div>
          <div className="benchmark-cell benchmark-number">78.1%</div>
          <div className="benchmark-cell benchmark-number">78.5%</div>
          <div className="benchmark-cell benchmark-delta">
            <span className="benchmark-tied">tied</span>
          </div>
        </div>

        <div className="benchmark-row benchmark-row-highlight">
          <div className="benchmark-cell benchmark-metric">
            <div className="benchmark-metric-name">Strict F1</div>
            <div className="benchmark-metric-note">Keyword match</div>
          </div>
          <div className="benchmark-cell benchmark-number benchmark-number-win">62.4%</div>
          <div className="benchmark-cell benchmark-number">8.5%</div>
          <div className="benchmark-cell benchmark-delta">
            <span className="benchmark-win">+53.9 pts</span>
          </div>
        </div>
      </div>

      <div className="benchmark-explainer">
        <p className="lede">
          At the content level mneme and Mem0 are effectively tied — both extract roughly the same
          underlying facts and the judge can&apos;t reliably tell them apart. The 53.9-point
          strict-match gap is <em>structural</em>: Mem0 paraphrases inputs into its own canonical
          form; mneme preserves the user&apos;s source language.
        </p>
        <div className="benchmark-bullets">
          <div className="benchmark-bullet">
            <div className="benchmark-bullet-title">Citations</div>
            <p>Surfaced memories trace back to what was actually said.</p>
          </div>
          <div className="benchmark-bullet">
            <div className="benchmark-bullet-title">Audit</div>
            <p>Compliance teams can verify the store against the source.</p>
          </div>
          <div className="benchmark-bullet">
            <div className="benchmark-bullet-title">Reproducibility</div>
            <p>
              Strict keyword match is deterministic; semantic similarity drifts as judge models
              improve.
            </p>
          </div>
        </div>
      </div>

      <div className="benchmark-meta">
        <span className="eyebrow">Methodology</span>
        <span className="benchmark-meta-text">
          Dual-matcher evaluation —{' '}
          <a
            href="https://github.com/ppserapiao/mneme/blob/main/decisions/0014-eval-judge-mode.md"
            target="_blank"
            rel="noreferrer"
          >
            ADR 0014
          </a>
          . Comparative-eval architecture —{' '}
          <a
            href="https://github.com/ppserapiao/mneme/blob/main/decisions/0015-comparative-eval.md"
            target="_blank"
            rel="noreferrer"
          >
            ADR 0015
          </a>
          . Raw baselines at{' '}
          <a
            href="https://github.com/ppserapiao/mneme/tree/main/tests/eval/baselines"
            target="_blank"
            rel="noreferrer"
            className="mono"
          >
            tests/eval/baselines/
          </a>
          .
        </span>
      </div>

      <pre className="code benchmark-repro">
        <header>Reproduce locally</header>
        <code>
          <span className="c-com"># Requires Docker, ANTHROPIC_API_KEY, OPENAI_API_KEY</span>
          {'\n'}
          <span className="c-prop">docker</span> run -d --name qdrant -p{' '}
          <span className="c-num">6333</span>:<span className="c-num">6333</span> qdrant/qdrant
          {'\n'}
          <span className="c-prop">bun</span> run eval:baseline -- --distiller=mem0 --judge=claude
        </code>
      </pre>
    </section>
  )
}
