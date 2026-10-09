// What a generation measured of its artifact.
//
// The rail cannot see the specification's true sequence space, so it does not measure a
// fraction of one: a denominator nobody can enumerate would make every printed number a
// guess wearing a percentage. What it can measure is what the artifact holds and which
// lines of the document the reading reached, and both are recorded facts — a count of
// records, and the union of the line numbers those records name.
//
// Nothing here is a pass condition. The counts are reported side by side across
// generations so a reader can see whether the returns are diminishing and decide,
// outside the run, whether to ask for another one. A generation that merges two
// sequences into one is an improvement carrying a smaller number, so a threshold on any
// of these would refuse the work it is meant to encourage.

/** Every integer from `first` to `last`, or none when the ends are not a range. */
// [::TICKET::] PX-245 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-245 --for-spec --no-implementation-order`.
function linesBetween(first, last) {
  if (!Number.isInteger(first) || !Number.isInteger(last) || last < first) return [];
  const lines = [];
  for (let line = first; line <= last; line += 1) lines.push(line);
  return lines;
}

/**
 * The line numbers the artifact declares, before any clipping.
 *
 * A sequence names the span it was read from and an operation names the line its entry
 * presupposes. A record that names neither contributes nothing rather than raising:
 * the shape of a thin artifact is a fact to report, not an error to throw.
 */
// [::TICKET::] PX-245 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-245 --for-spec --no-implementation-order`.
function declaredLinesIn(artifact) {
  const fromSequences = (artifact.sequences ?? []).flatMap((sequence) => linesBetween(sequence.firstLine, sequence.lastLine));
  const fromOperations = (artifact.operations ?? []).map((operation) => operation.grounding?.presupposition);
  return [...fromSequences, ...fromOperations];
}

/** The declared lines that lie inside the specification, each counted once. */
// [::TICKET::] PX-245 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-245 --for-spec --no-implementation-order`.
function reachedLinesIn(artifact) {
  const specLines = artifact.spec?.lines ?? 0;
  return new Set(declaredLinesIn(artifact).filter((line) => Number.isInteger(line) && line >= 1 && line <= specLines));
}

/**
 * What the artifact holds and how much of the specification it reaches.
 *
 * @returns {{sequences: number, steps: number, operations: number, rows: number,
 *            linesReached: number, specLines: number}}
 */
export function coverageOf(artifact) {
  return {
    sequences: (artifact.sequences ?? []).length,
    steps: (artifact.steps ?? []).length,
    operations: (artifact.operations ?? []).length,
    rows: (artifact.pins?.blocks ?? []).length,
    linesReached: reachedLinesIn(artifact).size,
    specLines: artifact.spec?.lines ?? 0,
  };
}

/**
 * The measurements as one line, spelled the same wherever they are printed.
 *
 * Two surfaces print them — the product path and the phase driver's `begin` — and a
 * second spelling would be a second thing to keep in step with the first.
 */
export function coverageLine(coverage) {
  return [
    `sequences=${coverage.sequences}`,
    `steps=${coverage.steps}`,
    `operations=${coverage.operations}`,
    `rows=${coverage.rows}`,
    `linesReached=${coverage.linesReached} of ${coverage.specLines}`,
  ].join(' ');
}
