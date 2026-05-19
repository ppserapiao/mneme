#!/usr/bin/env bun
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { configFromEnv } from './config'
import { buildServer } from './server'

async function main(): Promise<void> {
  const config = configFromEnv()
  const { server } = await buildServer(config)
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // The transport now owns the process — it reads stdin and writes JSON-RPC
  // to stdout until the client disconnects. We deliberately do not write to
  // stdout from anywhere else.
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  process.stderr.write(`mneme-mcp: fatal: ${message}\n`)
  process.exit(1)
})
