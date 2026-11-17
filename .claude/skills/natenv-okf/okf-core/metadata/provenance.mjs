/**
 * Source and footnote provenance.
 */

export function sourceIds(concept) {
  return (concept?.sources ?? [])
    .map((source) => source.id)
    .filter((id) => typeof id === 'string' && id.length > 0);
}

export function footnoteLabels(concept) {
  return (concept?.footnotes ?? [])
    .map((footnote) => footnote.label)
    .filter((label) => typeof label === 'string' && label.length > 0);
}
