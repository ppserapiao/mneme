import {
  CrossProviderIllustration,
  DeviceIllustration,
  KeyIllustration,
  PortableIllustration,
  SpecIllustration,
} from './ThesisIllustrations'

type Statement = {
  num: string
  principle: React.ReactNode
  contrast: string
  Illustration: () => React.JSX.Element
}

const statements: Statement[] = [
  {
    num: '01',
    principle: (
      <>
        Your memory lives on <em>your device</em>.
      </>
    ),
    contrast: 'Not in their cloud.',
    Illustration: DeviceIllustration,
  },
  {
    num: '02',
    principle: (
      <>
        <em>You</em> hold the keys.
      </>
    ),
    contrast: 'They never do.',
    Illustration: KeyIllustration,
  },
  {
    num: '03',
    principle: (
      <>
        The protocol is an <em>open</em>, versioned spec.
      </>
    ),
    contrast: 'Not a moat.',
    Illustration: SpecIllustration,
  },
  {
    num: '04',
    principle: (
      <>
        Works across <em>every</em> model.
      </>
    ),
    contrast: 'Tied to none.',
    Illustration: CrossProviderIllustration,
  },
  {
    num: '05',
    principle: (
      <>
        Take your encrypted store <em>with you</em>.
      </>
    ),
    contrast: 'Even when you leave.',
    Illustration: PortableIllustration,
  },
]

export function Thesis() {
  // Bento layout: 3-col grid.
  //   Row 1: 01 (cols 1-2) · 02 (col 3)
  //   Row 2: 03 (col 1)    · 04 (cols 2-3)
  //   Row 3: 05 (cols 1-3)
  const span = ['wide', 'narrow', 'narrow', 'wide', 'full'] as const

  return (
    <section className="section" id="thesis">
      <div className="section-head">
        <div>
          <div className="num">01 — Thesis</div>
        </div>
        <div>
          <h2 className="h-section">
            We compete on <em>whose memory it is</em>, not on whose retrieval scores half a point
            higher.
          </h2>
        </div>
      </div>

      <div className="thesis-bento">
        {statements.map((s, i) => {
          const Illustration = s.Illustration
          const variant = span[i]
          return (
            <article key={s.num} className={`bento-cell bento-${variant}`}>
              <div className="bento-text">
                <div className="bento-num">{s.num}</div>
                <p className="bento-principle">{s.principle}</p>
                <p className="bento-contrast">{s.contrast}</p>
              </div>
              <div className="bento-illustration">
                <Illustration />
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
