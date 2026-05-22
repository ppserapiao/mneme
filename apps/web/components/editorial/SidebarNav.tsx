'use client'

import { useEffect, useState } from 'react'

const sections = [
  { id: 'cover', num: '01', label: 'cover' },
  { id: 'lede', num: '02', label: 'the lede' },
  { id: 'evidence', num: '03', label: 'the evidence' },
  { id: 'thesis', num: '04', label: 'the thesis' },
  { id: 'architecture', num: '05', label: 'the architecture' },
  { id: 'install', num: '06', label: 'try it' },
] as const

/**
 * Fixed magazine-style table of contents on the right edge (desktop only).
 *
 * Visual model: a continuous vertical "ruler" of small ticks runs down
 * the left edge; each section's label sits beside a longer "anchor" tick.
 * Active section: anchor tick extends and flips to orange; label and
 * number shift from ink-mute to ink. Reference: the ElevenLabs case-study
 * side nav, restyled in mneme's vocabulary.
 *
 * Active-state tracking: a plain scroll listener (throttled via rAF).
 * On each frame we find the section whose top has scrolled above a
 * trigger line at 30% of the viewport, taking the bottommost such
 * section. This is more deterministic than IntersectionObserver for
 * a TOC: the active row updates predictably whether the user scrolls
 * one pixel at a time or jumps by Page Down, and we never get into
 * the "two sections both intersect" or "no section intersects"
 * ambiguous states that IO can produce when section heights vary.
 *
 * GTM rationale: gives the landing the feel of a multi-chapter article,
 * not a long marketing page.
 */
export function SidebarNav() {
  const [active, setActive] = useState<string>('cover')

  useEffect(() => {
    let raf = 0
    const compute = () => {
      raf = 0
      const trigger = window.innerHeight * 0.3
      let bestId: string = sections[0].id
      for (const { id } of sections) {
        const el = document.getElementById(id)
        if (!el) continue
        const top = el.getBoundingClientRect().top
        if (top <= trigger) {
          bestId = id
        } else {
          break
        }
      }
      setActive(bestId)
    }
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(compute)
    }
    compute()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <aside className="editorial-sidebar-nav" aria-label="table of contents">
      <div className="editorial-sidebar-nav-issue">
        <span className="editorial-sidebar-nav-issue-label">contents</span>
        <span className="editorial-sidebar-nav-issue-num">v0.1 · 06 chapters</span>
      </div>
      <ol className="editorial-sidebar-nav-list">
        {sections.map(({ id, num, label }) => (
          <li key={id} className={active === id ? 'is-active' : ''}>
            <a href={`#${id}`} className="editorial-sidebar-nav-item">
              <span className="editorial-sidebar-nav-tick" aria-hidden="true" />
              <span className="editorial-sidebar-nav-num">{num}</span>
              <span className="editorial-sidebar-nav-label">{label}</span>
            </a>
          </li>
        ))}
      </ol>
    </aside>
  )
}
