// [::TICKET::] PX-428 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-428 --for-spec --no-implementation-order`.
/**
 * Build the source coverage ledger and prove that no heading or rule row is
 * silently dropped.
 *
 * Every heading has exactly one disposition: a concept, a justified
 * non-normative entry, or nothing (an unmapped gap). Every rule row is either a
 * concept or an alias of a canonical concept.
 */

export function buildCoverageLedger({
  headings = [],
  concepts = [],
  nonNormative = [],
  ruleRows = [],
  ruleConcepts = new Map(),
  aliases = {},
}) {
  const conceptPaths = new Map(concepts.map((concept) => [concept.sourcePath, concept.id]));
  const declared = new Map(nonNormative.map((entry) => [entry.path, entry]));
  const aliasMap = aliases.aliases ?? aliases;
  const headingEntries = [];
  const unmapped = [];

  for (const heading of headings) {
    const conceptId = conceptPaths.get(heading.path);
    const declaration = declared.get(heading.path);
    if (conceptId && declaration) {
      throw Object.assign(
        new Error(`heading ${heading.path} has both a concept and a non-normative declaration`),
        { code: 'HEADING_DUPLICATE_DISPOSITION' },
      );
    }
    if (conceptId) {
      headingEntries.push({ path: heading.path, line: heading.line, disposition: 'concept', target: conceptId });
      continue;
    }
    if (declaration) {
      if (!declaration.reason || declaration.reason.trim().length === 0) {
        throw Object.assign(new Error(`non-normative heading ${heading.path} needs a reason`), {
          code: 'NON_NORMATIVE_UNJUSTIFIED',
        });
      }
      headingEntries.push({ path: heading.path, line: heading.line, disposition: 'non-normative', reason: declaration.reason });
      continue;
    }
    unmapped.push(heading.path);
  }

  const ruleEntries = [];
  let unmappedRuleRows = 0;
  for (const row of ruleRows) {
    const conceptId = ruleConcepts.get(row.id);
    if (conceptId) {
      ruleEntries.push({ id: row.id, line: row.line, disposition: 'concept', target: conceptId });
      continue;
    }
    const alias = aliasMap[row.id];
    if (alias?.target) {
      ruleEntries.push({ id: row.id, line: row.line, disposition: 'alias', target: alias.target, reason: alias.reason });
      continue;
    }
    unmappedRuleRows += 1;
  }

  return {
    schema: 'law-source-coverage/v3',
    counts: {
      headings: headings.length,
      ruleRows: ruleRows.length,
      concepts: conceptPaths.size,
      aliases: Object.keys(aliasMap).length,
      nonNormative: nonNormative.length,
      unmappedHeadings: unmapped.length,
      unmappedRuleRows,
    },
    headings: headingEntries,
    rules: ruleEntries,
    unmapped,
  };
}

export function assertBodyFidelity(section, body) {
  const expected = normalize(section.text);
  const actual = normalize(body);
  if (expected.length === 0) return;
  if (!actual.includes(expected)) {
    throw Object.assign(
      new Error(`FIDELITY_MISMATCH: ${section.path}`),
      { code: 'FIDELITY_MISMATCH', path: section.path },
    );
  }
}

// [::TICKET::] PX-428, PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-428|PX-427) --for-spec --no-implementation-order`.
function normalize(text) {
  return String(text ?? '').replace(/\r\n?/g, '\n').trim();
}
