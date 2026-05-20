export function Install() {
  return (
    <section className="section" id="install">
      <div className="section-head">
        <div>
          <div className="num">03 — Install</div>
        </div>
        <div>
          <h2 className="h-section">
            Drop into any TypeScript project. Or expose mneme as MCP tools to your editor.
          </h2>
        </div>
      </div>

      <div className="install-grid">
        <div className="install-col">
          <span className="badge">SDK</span>
          <h3 className="h-card install-h">Local-first TypeScript SDK</h3>
          <p>
            Encrypted by default, semantic recall via on-device embeddings, multi-device sync over
            WebSocket. Works on Bun, Node, and the browser.
          </p>
          <pre className="code">
            <header>bash</header>
            <code>
              <span className="c-prop">bun</span> add @mnemehq/sdk{'\n'}
              <span className="c-prop">bun</span> add @mnemehq/embedder-local
              <span className="c-com"> # optional, semantic recall</span>
              {'\n'}
              <span className="c-prop">bun</span> add @mnemehq/sync-websocket
              <span className="c-com"> # optional, multi-device</span>
            </code>
          </pre>
          <pre className="code install-usage">
            <header>typescript</header>
            <code>
              <span className="c-tok">import</span> <span className="c-prop">{'{ Mneme }'}</span>{' '}
              <span className="c-tok">from</span> <span className="c-str">{`'@mnemehq/sdk'`}</span>
              {'\n'}
              <span className="c-tok">import</span>{' '}
              <span className="c-prop">{'{ LocalEmbedder }'}</span>{' '}
              <span className="c-tok">from</span>{' '}
              <span className="c-str">{`'@mnemehq/embedder-local'`}</span>
              {'\n\n'}
              <span className="c-tok">const</span>{' '}
              <span className="c-prop">{'{ mneme, recoveryPhrase }'}</span> ={' '}
              <span className="c-tok">await</span> Mneme.initialize({'{'}
              {'\n  '}passphrase: <span className="c-str">{`'correct horse battery staple'`}</span>,
              {'\n  '}embedder: <span className="c-tok">new</span> LocalEmbedder(),
              {'\n'}
              {'}'});{'\n\n'}
              <span className="c-tok">await</span> mneme.remember({'{'}
              {'\n  '}kind: <span className="c-str">{`'preference'`}</span>,{'\n  '}body:{' '}
              <span className="c-str">{`'Prefers concise code review comments'`}</span>,{'\n'}
              {'}'});{'\n\n'}
              <span className="c-com">
                {'// Body is sealed with AES-256-GCM. Embeddings computed pre-encryption.'}
              </span>
              {'\n'}
              <span className="c-tok">const</span> matches = <span className="c-tok">await</span>{' '}
              mneme.recall(
              <span className="c-str">{`'feedback style on PRs'`}</span>);
            </code>
          </pre>
        </div>

        <div className="install-col">
          <span className="badge">MCP</span>
          <h3 className="h-card install-h">Plug into Claude Code, Cursor, any MCP host</h3>
          <p>
            One line. The MCP server exposes <span className="mono">mneme_remember</span>,{' '}
            <span className="mono">mneme_recall</span>, <span className="mono">mneme_get</span>,{' '}
            <span className="mono">mneme_forget</span>,{' '}
            <span className="mono">mneme_supersede</span>, and{' '}
            <span className="mono">mneme_export</span> as tools.
          </p>
          <pre className="code">
            <header>bash</header>
            <code>
              <span className="c-prop">claude</span> mcp add mneme -- npx -y @mnemehq/mcp-server
            </code>
          </pre>
          <p className="install-mcp-note">
            For other hosts (Cursor, Continue, Zed): point at{' '}
            <span className="mono">npx -y @mnemehq/mcp-server</span> from your MCP config. See{' '}
            <a
              href="https://github.com/ppserapiao/mneme/tree/main/apps/mcp-server"
              target="_blank"
              rel="noreferrer"
            >
              apps/mcp-server
            </a>{' '}
            for encrypted-mode setup.
          </p>
        </div>
      </div>
    </section>
  )
}
