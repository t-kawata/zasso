/**
 * The observable health of the evidence instruments.
 *
 * A zero-finding run is not a measurement unless the instrument could have
 * reported a finding. These ratios are diagnostics: they describe how often an
 * instrument departed from its clean answer and never change a verdict.
 */

const WHITESPACE = /\s+/g;

/** A whitespace-normalized, case-folded string for quote identity. */
// [::TICKET::] PX-302 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-302 --for-spec --no-implementation-order`.
function normalizedQuote(value) {
  return String(value ?? '').replace(WHITESPACE, ' ').trim().toLowerCase();
}

/** A ratio with a zero-denominator answer of 0, never NaN. */
// [::TICKET::] PX-302 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-302 --for-spec --no-implementation-order`.
function ratioOrZero(numerator, denominator) {
  return denominator === 0 ? 0 : numerator / denominator;
}

/** The empty instrument a workspace without readings reports. */
export function emptyInstrument() {
  return {
    inquest: { records: 0, yes: 0, no: 0, yesRatio: 0 },
    attacks: { records: 0, held: 0, broken: 0, unresolved: 0, brokenRatio: 0 },
    judgments: { records: 0, basisQuotes: 0, distinctBasisQuotes: 0, discriminationRatio: 0 },
    effort: { records: 0, distinctAlternatives: 0, distinctDiscriminators: 0 },
    nonDiscriminating: true,
  };
}

/**
 * Summarize the instrument health from the current readings and records.
 *
 * `nonDiscriminating` is true when neither the inquest nor the attack set has
 * ever departed from its clean answer. An empty instrument is also non-
 * discriminating: it has not shown that it can fire.
 */
export function summarizeInstrument({
  readings = null,
  judgments = [],
  attacks = [],
  effort = [],
} = {}) {
  const inquest = readings?.inquest ?? {};
  const records = Number.isInteger(inquest.records) ? inquest.records : 0;
  const yes = Number.isInteger(inquest.yes) ? inquest.yes : 0;
  const no = Number.isInteger(inquest.no) ? inquest.no : 0;

  const attackRecords = Array.isArray(attacks) ? attacks : [];
  const held = attackRecords.filter((entry) => entry?.outcome === 'held').length;
  const broken = attackRecords.filter((entry) => entry?.outcome === 'broken').length;
  const unresolved = attackRecords.filter((entry) => entry?.outcome === 'unresolved').length;

  const judgmentRecords = Array.isArray(judgments) ? judgments : [];
  const basisQuotes = judgmentRecords
    .flatMap((entry) => (Array.isArray(entry?.basis) ? entry.basis : []))
    .map((entry) => normalizedQuote(entry?.quote))
    .filter((quote) => quote !== '');
  const distinctBasisQuotes = new Set(basisQuotes).size;

  const effortRecords = Array.isArray(effort) ? effort : [];
  const distinctAlternatives = new Set(
    effortRecords.map((entry) => JSON.stringify(entry?.alternatives ?? null)),
  ).size;
  const distinctDiscriminators = new Set(
    effortRecords.map((entry) => JSON.stringify(entry?.discriminator ?? null)),
  ).size;

  const inquestSilent = records === 0 || yes === 0;
  const attackSilent = attackRecords.length === 0 || broken === 0;

  return {
    inquest: { records, yes, no, yesRatio: ratioOrZero(yes, records) },
    attacks: {
      records: attackRecords.length,
      held,
      broken,
      unresolved,
      brokenRatio: ratioOrZero(broken, attackRecords.length),
    },
    judgments: {
      records: judgmentRecords.length,
      basisQuotes: basisQuotes.length,
      distinctBasisQuotes,
      discriminationRatio: ratioOrZero(distinctBasisQuotes, basisQuotes.length),
    },
    effort: {
      records: effortRecords.length,
      distinctAlternatives,
      distinctDiscriminators,
    },
    nonDiscriminating: inquestSilent && attackSilent,
  };
}
