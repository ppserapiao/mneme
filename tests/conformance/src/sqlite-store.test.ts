import { SqliteStore } from '@mneme/sdk'
import { runV01ConformanceSuite } from './index'

runV01ConformanceSuite('@mneme/sdk SqliteStore', async () => {
  const store = new SqliteStore({ path: ':memory:' })
  return {
    store,
    dispose: () => {
      store.close()
    },
  }
})
