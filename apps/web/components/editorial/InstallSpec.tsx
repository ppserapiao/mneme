import { GithubLogo } from '../Logos'
import { CopyButton } from './CopyButton'

/**
 * Section 06 — try it. Install commands, mneme.recall() worked example.
 *
 * GTM rationale: by this section a HN reader is either convinced (and
 * wants to try) or has already left. So we drop the marketing voice
 * entirely — just commands, captions, the worked example, and a single
 * "go to GitHub" button. The captions are mono so the page reads as
 * "this is what a real developer would do" not "this is what a marketing
 * page wants you to do."
 *
 * Each block has a CopyButton in its header — clicking copies the raw
 * text to the clipboard. The display markup keeps syntax highlighting;
 * the copy text below is the clean version we actually paste.
 */

const INSTALL_TEXT = `bun add @mnemehq/sdk
bun add @mnemehq/embedder-local
bun add @mnemehq/sync-websocket`

const MCP_TEXT = 'claude mcp add mneme -- npx -y @mnemehq/mcp-server'

const EXAMPLE_TEXT = `import { Mneme } from '@mnemehq/sdk'
import { LocalEmbedder } from '@mnemehq/embedder-local'

const { mneme, recoveryPhrase } = await Mneme.initialize({
  path: './mneme.sqlite',
  passphrase: 'correct horse battery staple',
  embedder: new LocalEmbedder(),
})

// body sealed AES-256-GCM, signed Ed25519
await mneme.remember({
  kind: 'preference',
  body: 'Prefers concise code review comments',
})

const matches = await mneme.recall('feedback style on pull requests')
for (const { record, score } of matches) {
  console.log(score.toFixed(2), record.kind, '—', record.body.data)
}`

export function InstallSpec() {
  return (
    <section id="install" className="editorial-section editorial-section--install">
      <div className="editorial-install-grid">
        <div className="editorial-install-marker">
          <div className="editorial-numeral" aria-hidden="true">
            06
          </div>
          <div className="editorial-section-label">try it</div>
          <div className="editorial-section-kicker">five minutes from cold to first recall</div>
        </div>

        <div className="editorial-install-body">
          <h2 className="editorial-h2">
            <span className="editorial-mono">bun add @mnemehq/sdk</span>. Or paste an{' '}
            <span className="editorial-mono">npx</span> line into Claude Code.
          </h2>

          <div className="editorial-install-blocks">
            <article className="editorial-install-block">
              <header className="editorial-install-block-head">
                <div className="editorial-install-block-head-text">
                  <span className="editorial-eyebrow">install</span>
                  <span className="editorial-install-block-note">the core sdk</span>
                </div>
                <CopyButton text={INSTALL_TEXT} />
              </header>
              <pre className="editorial-code">
                <code>
                  <span className="editorial-code-prompt">$ </span>bun add @mnemehq/sdk
                  {'\n'}
                  <span className="editorial-code-prompt">$ </span>bun add @mnemehq/embedder-local
                  <span className="editorial-code-comment">{'  '}# optional, on-device search</span>
                  {'\n'}
                  <span className="editorial-code-prompt">$ </span>bun add @mnemehq/sync-websocket
                  <span className="editorial-code-comment">{'  '}# optional, multi-device</span>
                </code>
              </pre>
            </article>

            <article className="editorial-install-block">
              <header className="editorial-install-block-head">
                <div className="editorial-install-block-head-text">
                  <span className="editorial-eyebrow">mcp</span>
                  <span className="editorial-install-block-note">
                    one line in claude code, cursor, any mcp host
                  </span>
                </div>
                <CopyButton text={MCP_TEXT} />
              </header>
              <pre className="editorial-code">
                <code>
                  <span className="editorial-code-prompt">$ </span>claude mcp add mneme -- npx -y
                  @mnemehq/mcp-server
                </code>
              </pre>
            </article>

            <article className="editorial-install-block editorial-install-block--wide">
              <header className="editorial-install-block-head">
                <div className="editorial-install-block-head-text">
                  <span className="editorial-eyebrow">worked example</span>
                  <span className="editorial-install-block-note">
                    initialize → remember → recall · 24-word phrase shown once
                  </span>
                </div>
                <CopyButton text={EXAMPLE_TEXT} />
              </header>
              <pre className="editorial-code">
                <code>
                  <span className="editorial-code-kw">import</span>{' '}
                  <span className="editorial-code-id">{'{ Mneme }'}</span>{' '}
                  <span className="editorial-code-kw">from</span>{' '}
                  <span className="editorial-code-str">'@mnemehq/sdk'</span>
                  {'\n'}
                  <span className="editorial-code-kw">import</span>{' '}
                  <span className="editorial-code-id">{'{ LocalEmbedder }'}</span>{' '}
                  <span className="editorial-code-kw">from</span>{' '}
                  <span className="editorial-code-str">'@mnemehq/embedder-local'</span>
                  {'\n\n'}
                  <span className="editorial-code-kw">const</span> {'{'} mneme, recoveryPhrase {'}'}{' '}
                  =<span className="editorial-code-kw">await</span> Mneme.initialize({'{'}
                  {'\n'}
                  {'  '}path: <span className="editorial-code-str">'./mneme.sqlite'</span>,{'\n'}
                  {'  '}passphrase:{' '}
                  <span className="editorial-code-str">'correct horse battery staple'</span>,{'\n'}
                  {'  '}embedder: <span className="editorial-code-kw">new</span> LocalEmbedder(),
                  {'\n'}
                  {'}'}){'\n\n'}
                  <span className="editorial-code-comment">
                    {'// body sealed AES-256-GCM, signed Ed25519'}
                  </span>
                  {'\n'}
                  <span className="editorial-code-kw">await</span> mneme.remember({'{'}
                  {'\n'}
                  {'  '}kind: <span className="editorial-code-str">'preference'</span>,{'\n'}
                  {'  '}body:{' '}
                  <span className="editorial-code-str">'Prefers concise code review comments'</span>
                  ,{'\n'}
                  {'}'}){'\n\n'}
                  <span className="editorial-code-kw">const</span> matches ={' '}
                  <span className="editorial-code-kw">await</span> mneme.recall(
                  <span className="editorial-code-str">'feedback style on pull requests'</span>)
                  {'\n'}
                  <span className="editorial-code-kw">for</span> (
                  <span className="editorial-code-kw">const</span> {'{'} record, score {'}'}{' '}
                  <span className="editorial-code-kw">of</span> matches) {'{'}
                  {'\n'}
                  {'  '}console.log(score.toFixed(<span className="editorial-code-num">2</span>),
                  record.kind, <span className="editorial-code-str">'—'</span>, record.body.data)
                  {'\n'}
                  {'}'}
                </code>
              </pre>
            </article>
          </div>

          <div className="editorial-install-cta">
            <a
              href="https://github.com/ppserapiao/mneme"
              target="_blank"
              rel="noreferrer"
              className="editorial-cta editorial-cta--primary editorial-cta--lg"
            >
              <GithubLogo size={16} />
              github.com/ppserapiao/mneme
            </a>
            <span className="editorial-install-cta-meta">
              public · apache 2.0 · 185 tests pass · smoke green against live npm
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
