import { mkdirSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { dirname, join } from 'node:path'

const APP_DIR = 'Mneme'
const DB_FILENAME = 'memory.sqlite'

/**
 * Resolve the default platform-appropriate path for the local memory store.
 *
 * - macOS: `~/Library/Application Support/Mneme/memory.sqlite`
 * - Windows: `%APPDATA%/Mneme/memory.sqlite`
 * - Linux/other: `$XDG_DATA_HOME/Mneme/memory.sqlite` (falls back to `~/.local/share`)
 */
export function defaultStoragePath(): string {
  const home = homedir()
  switch (platform()) {
    case 'darwin':
      return join(home, 'Library', 'Application Support', APP_DIR, DB_FILENAME)
    case 'win32': {
      const appData = process.env['APPDATA'] ?? join(home, 'AppData', 'Roaming')
      return join(appData, APP_DIR, DB_FILENAME)
    }
    default: {
      const xdg = process.env['XDG_DATA_HOME'] ?? join(home, '.local', 'share')
      return join(xdg, APP_DIR, DB_FILENAME)
    }
  }
}

/** Ensure the parent directory of a file path exists. */
export function ensureParentDir(filePath: string): void {
  if (filePath === ':memory:') return
  mkdirSync(dirname(filePath), { recursive: true })
}
