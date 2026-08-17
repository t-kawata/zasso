#!/usr/bin/env node

/**
 * check-toc-structure.js — Validate a TOC proposal (Step 1, C003)
 *
 * CLI: echo '{"toc":[{level,title}],"expectedSections":[...]}' | check-toc-structure.js
 *
 * Prints {"ok":bool,"violations":[{type,heading,detail}]}. Exit 0 when ok,
 * exit 1 when violations exist.
 *
 * Violation types:
 *   duplicate             — same heading title appears more than once
 *   skippedLevel          — a heading level skips a level (H2 -> H4)
 *   missingCoverage       — an expected top-level section is absent
 *   missingTrailingSection — the last heading is not the examples section
 */

/** The mandatory trailing section title (C003 invariant, case-insensitive) */
const TRAILING_SECTION_TITLE = 'examples (implementation samples) spec and design';

/**
 * Normalize a heading title for comparison.
 *
 * @param {string} text — Raw title text
 * @returns {string} Lower-cased, trimmed text
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function normalize(text) {
  return String(text).trim().toLowerCase();
}

/**
 * Parse TOC input from a JSON string.
 *
 * @param {string} json — JSON string (array or {toc, expectedSections})
 * @returns {{ toc: Array<{level,title}>, expectedSections: string[] }}
 * @throws {Error} If the input shape is invalid
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function parseTocInput(json) {
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch (parseError) {
    throw new Error(`Invalid JSON input: ${parseError.message}`);
  }

  let toc;
  let expectedSections = [];
  if (Array.isArray(parsed)) {
    toc = parsed;
  } else if (parsed && Array.isArray(parsed.toc)) {
    toc = parsed.toc;
    if (Array.isArray(parsed.expectedSections)) {
      expectedSections = parsed.expectedSections;
    }
  } else {
    throw new Error('Input must be a TOC array or {toc, expectedSections}.');
  }

  for (const entry of toc) {
    if (!entry || typeof entry.level !== 'number' || typeof entry.title !== 'string') {
      throw new Error(`Invalid TOC entry: ${JSON.stringify(entry)}`);
    }
  }

  return { toc, expectedSections };
}

/**
 * Validate a TOC proposal.
 *
 * @param {{ toc: Array<{level,title}>, expectedSections?: string[] }} input
 * @returns {{ ok: boolean, violations: Array<{type,heading,detail}> }}
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function checkTocStructure({ toc, expectedSections = [] }) {
  const violations = [];
  const seen = new Set();

  for (let i = 0; i < toc.length; i++) {
    const entry = toc[i];
    const key = normalize(entry.title);

    if (seen.has(key)) {
      violations.push({
        type: 'duplicate',
        heading: entry.title,
        detail: `Duplicate heading title: ${entry.title}`,
      });
    }
    seen.add(key);

    if (i > 0 && entry.level > toc[i - 1].level + 1) {
      violations.push({
        type: 'skippedLevel',
        heading: entry.title,
        detail: `Level ${toc[i - 1].level} -> ${entry.level} skips a level`,
      });
    }
  }

  const present = new Set(toc.map((entry) => normalize(entry.title)));
  for (const section of expectedSections) {
    if (!present.has(normalize(section))) {
      violations.push({
        type: 'missingCoverage',
        heading: section,
        detail: `Expected top-level section missing: ${section}`,
      });
    }
  }

  const last = toc[toc.length - 1];
  if (!last || normalize(last.title) !== normalize(TRAILING_SECTION_TITLE)) {
    violations.push({
      type: 'missingTrailingSection',
      heading: last ? last.title : '(empty toc)',
      detail: `Last section must be '${TRAILING_SECTION_TITLE}'`,
    });
  }

  return { ok: violations.length === 0, violations };
}

/**
 * main — CLI entry point (reads TOC JSON from stdin).
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function main() {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    input += chunk;
  });
  process.stdin.on('end', () => {
    try {
      const { toc, expectedSections } = parseTocInput(input);
      const result = checkTocStructure({ toc, expectedSections });
      process.stdout.write(JSON.stringify(result) + '\n');
      process.exit(result.ok ? 0 : 1);
    } catch (error) {
      console.error(`[ERROR] ${error.message}`);
      process.exit(1);
    }
  });
}

// Call main only when executed as CLI
if (require.main === module) {
  main();
}

module.exports = {
  parseTocInput,
  checkTocStructure,
  normalize,
  TRAILING_SECTION_TITLE,
};
