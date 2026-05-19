import { Mneme } from '@mnemehq/sdk'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ServerConfig } from './config'
import {
  exportSchema,
  forgetSchema,
  getSchema,
  makeHandlers,
  recallSchema,
  rememberSchema,
  supersedeSchema,
} from './tools'

const SERVER_NAME = 'mneme'
const SERVER_VERSION = '0.0.1'

export type StartResult = {
  server: McpServer
  mneme: Mneme
}

/**
 * Build the MCP server with a fresh `Mneme` opened from the given config.
 *
 * Encryption: when `config.passphrase` is set, the server either initialises
 * a new keyring (printing the recovery phrase to stderr once) or opens the
 * existing keyring with the passphrase. Stderr is used because stdout is the
 * MCP JSON-RPC transport.
 */
export async function buildServer(config: ServerConfig): Promise<StartResult> {
  const mneme = await openMneme(config)
  const handlers = makeHandlers(mneme)

  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION })

  server.registerTool(
    'mneme_remember',
    {
      description:
        'Persist a new memory record on behalf of the current owner. Returns the canonical stored record.',
      inputSchema: rememberSchema,
    },
    handlers.remember,
  )

  server.registerTool(
    'mneme_recall',
    {
      description:
        'Search memory by natural-language query. Semantic ranking when an embedder is configured; lexical BM25 otherwise (and disabled under encryption).',
      inputSchema: recallSchema,
    },
    handlers.recall,
  )

  server.registerTool(
    'mneme_get',
    {
      description: 'Fetch a single memory record by its ULID.',
      inputSchema: getSchema,
    },
    handlers.get,
  )

  server.registerTool(
    'mneme_forget',
    {
      description:
        'Mark a memory as forgotten (soft expire by default; pass hard=true to schedule hard delete).',
      inputSchema: forgetSchema,
    },
    handlers.forget,
  )

  server.registerTool(
    'mneme_supersede',
    {
      description:
        'Atomically replace an existing memory with a new one. The old record remains, linked via lifecycle.supersededBy.',
      inputSchema: supersedeSchema,
    },
    handlers.supersede,
  )

  server.registerTool(
    'mneme_export',
    {
      description:
        'Export every memory record for the current owner, including superseded and expired ones.',
      inputSchema: exportSchema,
    },
    handlers.export,
  )

  return { server, mneme }
}

async function openMneme(config: ServerConfig): Promise<Mneme> {
  if (config.passphrase === undefined) {
    return new Mneme({ path: config.storePath, ownerId: config.ownerId })
  }

  // Encryption requested. Probe the store: if there's no keyring yet, this is
  // a fresh encrypted setup and we MUST surface the recovery phrase exactly
  // once. The MCP transport owns stdout, so we write the phrase to stderr.
  try {
    return await Mneme.open({
      path: config.storePath,
      ownerId: config.ownerId,
      passphrase: config.passphrase,
    })
  } catch (err) {
    if (
      err !== null &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code?: unknown }).code === 'record_not_found'
    ) {
      const { mneme, recoveryPhrase } = await Mneme.initialize({
        path: config.storePath,
        ownerId: config.ownerId,
        passphrase: config.passphrase,
      })
      process.stderr.write(
        [
          '',
          '======================================================================',
          ' mneme: new encrypted store initialised',
          ' Recovery phrase (24 words) — SAVE THIS NOW; it will not be shown again:',
          '',
          `   ${recoveryPhrase}`,
          '',
          ' Public key (Ed25519):',
          `   ${mneme.publicKey}`,
          '======================================================================',
          '',
        ].join('\n'),
      )
      return mneme
    }
    throw err
  }
}
