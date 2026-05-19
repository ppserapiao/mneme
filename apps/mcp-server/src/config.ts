import { defaultStoragePath } from '@mnemehq/sdk'

export type ServerConfig = {
  /** SQLite store path. Defaults to the SDK's platform-appropriate location. */
  storePath: string
  /** Owner identifier used for every verb. */
  ownerId: string
  /** When set, the store runs in encrypted mode. */
  passphrase: string | undefined
}

/**
 * Build the server config from process env. Env vars:
 *
 * - `MNEME_STORE_PATH` — path to the SQLite store (default: platform-specific)
 * - `MNEME_OWNER_ID`   — owner identifier (default: "local")
 * - `MNEME_PASSPHRASE` — when set, enables encryption-at-rest. If the store
 *   has no keyring yet, the server initialises a fresh one and writes the
 *   generated recovery phrase to stderr exactly once for the user to save.
 *
 * The MCP transport uses stdout for JSON-RPC, so any informational output
 * (recovery phrase, startup banner) MUST go to stderr.
 */
export function configFromEnv(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const storePath = env['MNEME_STORE_PATH']?.trim() || defaultStoragePath()
  const ownerId = env['MNEME_OWNER_ID']?.trim() || 'local'
  const passphraseRaw = env['MNEME_PASSPHRASE']
  const passphrase = passphraseRaw && passphraseRaw.length > 0 ? passphraseRaw : undefined
  return { storePath, ownerId, passphrase }
}
