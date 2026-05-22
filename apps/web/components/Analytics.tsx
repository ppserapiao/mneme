'use client'

import { useEffect } from 'react'

// Client-side pageview beacon. Fires once on mount, fire-and-forget via
// navigator.sendBeacon (with a fetch keepalive fallback). Never throws,
// never logs, never blocks. If the endpoint is unreachable the user
// sees nothing.

export function Analytics() {
  useEffect(() => {
    const payload = JSON.stringify({
      path: window.location.pathname + window.location.search,
      referrer: document.referrer,
    })

    try {
      if (navigator.sendBeacon) {
        const blob = new Blob([payload], { type: 'application/json' })
        navigator.sendBeacon('/api/event', blob)
        return
      }
    } catch {
      // fall through to fetch
    }

    try {
      void fetch('/api/event', {
        method: 'POST',
        keepalive: true,
        headers: { 'content-type': 'application/json' },
        body: payload,
      })
    } catch {
      // swallow
    }
  }, [])

  return null
}
