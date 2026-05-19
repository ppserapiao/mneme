import { SqliteStore } from '@mnemehq/sdk'
import { runV01ConformanceSuite } from './index'

runV01ConformanceSuite('@mnemehq/sdk SqliteStore', async () => {
  const store = new SqliteStore({ path: ':memory:' })
  return {
    store,
    dispose: () => {
      store.close()
    },
  }
})
