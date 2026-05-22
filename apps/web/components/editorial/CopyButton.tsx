'use client'

import { useState } from 'react'

/**
 * Small copy-to-clipboard button. Sits in the header bar of each install
 * block. Brand-consistent: mono lowercase, subtle outline, flips to
 * "copied ✓" in orange for 1.5s on success.
 *
 * navigator.clipboard.writeText is gated behind a secure context check —
 * on http://localhost it works because Chrome / Firefox treat localhost
 * as secure. Falls back to silent failure if the API is unavailable.
 */
export function CopyButton({ text, label = 'copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!navigator.clipboard) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // swallow — never throw from a UI handler
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`editorial-copy-btn ${copied ? 'is-copied' : ''}`}
      aria-label={copied ? 'copied to clipboard' : 'copy to clipboard'}
    >
      {copied ? (
        <>
          <span aria-hidden="true">✓</span>
          <span>copied</span>
        </>
      ) : (
        <span>{label}</span>
      )}
    </button>
  )
}
