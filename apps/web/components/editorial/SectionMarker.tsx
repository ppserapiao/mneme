/**
 * The huge mono numeral that opens every editorial section.
 * Sets a Vanity-Fair-table-of-contents tone — confident, calm, opinionated.
 */
export function SectionMarker({
  num,
  label,
  kicker,
}: {
  num: string
  label: string
  kicker?: string
}) {
  return (
    <header className="editorial-section-marker">
      <div className="editorial-numeral" aria-hidden="true">
        {num}
      </div>
      <div className="editorial-section-meta">
        <div className="editorial-section-label">{label}</div>
        {kicker ? <div className="editorial-section-kicker">{kicker}</div> : null}
      </div>
    </header>
  )
}
