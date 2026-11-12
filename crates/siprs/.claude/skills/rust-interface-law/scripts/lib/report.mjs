export function renderCoverageReport(coverage) {
  const rows = coverage.files.map((file) => [
    '| `' + file.path + '`',
    file.lines,
    file.attributed,
    file.excluded,
    file.gaps.length,
    file.overlaps.length + ' |',
  ].join(' | '));

  const total = coverage.files.reduce((sum, file) => ({
    lines: sum.lines + file.lines,
    attributed: sum.attributed + file.attributed,
    excluded: sum.excluded + file.excluded,
    gaps: sum.gaps + file.gaps.length,
    overlaps: sum.overlaps + file.overlaps.length,
  }), { lines: 0, attributed: 0, excluded: 0, gaps: 0, overlaps: 0 });

  return [
    '# Coverage',
    '',
    '| Path | Lines | Attributed | Excluded | Gaps | Overlaps |',
    '|---|---:|---:|---:|---:|---:|',
    ...rows,
    '| **TOTAL** | ' + total.lines + ' | ' + total.attributed + ' | ' + total.excluded
      + ' | ' + total.gaps + ' | ' + total.overlaps + ' |',
    '',
  ].join('\n');
}
