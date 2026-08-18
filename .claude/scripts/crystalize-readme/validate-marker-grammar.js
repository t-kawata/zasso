#!/usr/bin/env node

/**
 * validate-marker-grammar.js — Single source of truth for the 4 README markers (PX-156)
 *
 * Marker taxonomy (1:1 pairing):
 *   usage sections   — <::TEMPLATE-README::> (work unit)  -> complete | <::README-RESIDUE::>
 *   examples section — <::TEMPLATE-EXAMPLES::> (work unit) -> complete | <::EXAMPLES-RESIDUE::>
 *
 * A usage section carrying an EXAMPLES marker (or vice versa) is a
 * cross-contamination structure violation; a section carrying both a work-unit
 * and a residue marker is also a violation.
 *
 * CLI: validate-marker-grammar.js --readme=<path>   (or stdin)
 */

const fs = require('fs');

/** Work-unit marker for a usage section pending the Step 2 loop */
const MARKER_TEMPLATE_README = '<::TEMPLATE-README::>';

/** Residue marker recording an unwritable usage section */
const MARKER_README_RESIDUE = '<::README-RESIDUE::>';

/** Work-unit marker for the examples section pending the post-loop step */
const MARKER_TEMPLATE_EXAMPLES = '<::TEMPLATE-EXAMPLES::>';

/** Residue marker recording an unwritable examples section */
const MARKER_EXAMPLES_RESIDUE = '<::EXAMPLES-RESIDUE::>';

/** CLI argument prefix specifying the README file path */
const README_ARG_PREFIX = '--readme=';

/** The mandatory trailing section title (shared with loop-drive-readme.js) */
const TRAILING_SECTION_TITLE = 'Examples (implementation samples) spec and design';

/** Any of the 4 markers */
const MARKER_PATTERN = /<::(?:TEMPLATE-README|README-RESIDUE|TEMPLATE-EXAMPLES|EXAMPLES-RESIDUE)::>/;

/**
 * Parse command line arguments.
 *
 * @param {string[]} [args] — Test argument array (defaults to process.argv when omitted)
 * @returns {{ readmePath: string|null }} null means read from stdin
 * @throws {Error} If the argument syntax is invalid
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function parseArguments(args) {
  const argv = args || process.argv.slice(2);
  if (argv.length > 1) {
    throw new Error(`Usage: validate-marker-grammar.js ${README_ARG_PREFIX}<path> (or stdin)`);
  }
  if (argv.length === 1) {
    if (!argv[0].startsWith(README_ARG_PREFIX)) {
      throw new Error(`Unknown argument: ${argv[0]}`);
    }
    const readmePath = argv[0].slice(README_ARG_PREFIX.length);
    if (!readmePath) {
      throw new Error('--readme value is empty.');
    }
    return { readmePath };
  }
  return { readmePath: null };
}

/**
 * Normalize text for case-insensitive comparison.
 *
 * @param {string} text — Raw text
 * @returns {string} Lower-cased, trimmed text
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function normalize(text) {
  return String(text).trim().toLowerCase();
}

/**
 * Split a README into sections by heading lines.
 *
 * @param {string} text — README markdown content
 * @returns {Array<{ headingLineIndex: number, headingLevel: number, headingText: string, body: string[] }>}
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function splitSections(text) {
  const lines = String(text).split('\n');
  const sections = [];
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#+)\s+(\S.*)$/);
    if (match) {
      if (current) sections.push(current);
      current = {
        headingLineIndex: i,
        headingLevel: match[1].length,
        headingText: match[2],
        body: [],
      };
    } else if (current) {
      current.body.push(lines[i]);
    }
  }
  if (current) sections.push(current);
  return sections;
}

/**
 * Count each marker kind inside a section body.
 *
 * @param {string} body — Section body (lines joined)
 * @returns {{ templateReadme: number, readmeResidue: number, templateExamples: number, examplesResidue: number }}
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function countMarkers(body) {
  return {
    templateReadme: (body.match(/<::TEMPLATE-README::>/g) || []).length,
    readmeResidue: (body.match(/<::README-RESIDUE::>/g) || []).length,
    templateExamples: (body.match(/<::TEMPLATE-EXAMPLES::>/g) || []).length,
    examplesResidue: (body.match(/<::EXAMPLES-RESIDUE::>/g) || []).length,
  };
}

/**
 * Validate the 4-marker grammar of a README.
 *
 * @param {string} text — README markdown content
 * @returns {{ ok: boolean, errors: string[], templateCount: number, sections: object[] }}
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function validateMarkerGrammar(text) {
  const errors = [];
  const sections = splitSections(text);
  let templateCount = 0;
  const sectionStates = [];

  for (const section of sections) {
    const counts = countMarkers(section.body.join('\n'));
    templateCount += counts.templateReadme + counts.templateExamples;
    const isExamples = normalize(section.headingText) === normalize(TRAILING_SECTION_TITLE);

    if (isExamples) {
      if (counts.templateReadme > 0 || counts.readmeResidue > 0) {
        errors.push(`Examples section "${section.headingText}" carries README markers (cross-contamination).`);
      }
    } else {
      if (counts.templateExamples > 0 || counts.examplesResidue > 0) {
        errors.push(`Usage section "${section.headingText}" carries EXAMPLES markers (cross-contamination).`);
      }
    }

    const workUnit = counts.templateReadme + counts.templateExamples;
    const residue = counts.readmeResidue + counts.examplesResidue;
    if (workUnit > 0 && residue > 0) {
      errors.push(`Section "${section.headingText}" carries both a work-unit marker and a residue marker.`);
    }
    const markerKinds = [counts.templateReadme, counts.readmeResidue, counts.templateExamples, counts.examplesResidue];
    if (markerKinds.some((n) => n > 1)) {
      errors.push(`Section "${section.headingText}" carries more than one marker of the same kind.`);
    }

    sectionStates.push({ heading: section.headingText, headingLevel: section.headingLevel, ...counts });
  }

  const firstHeadingIndex = String(text).search(/^#+\s+\S/m);
  if (firstHeadingIndex > 0) {
    const preamble = String(text).slice(0, firstHeadingIndex);
    if (MARKER_PATTERN.test(preamble)) {
      errors.push('A marker appears before the first heading.');
    }
  }

  return { ok: errors.length === 0, errors, templateCount, sections: sectionStates };
}

/**
 * main — CLI entry point (reads from --readme=<path> or stdin).
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function main() {
  const { readmePath } = parseArguments();
  const finish = (text) => {
    const result = validateMarkerGrammar(text);
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exit(result.ok ? 0 : 1);
  };
  if (readmePath) {
    try {
      finish(fs.readFileSync(readmePath, 'utf8'));
    } catch (error) {
      console.error(`[ERROR] Failed to read README: ${error.message}`);
      process.exit(1);
    }
  } else {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      input += chunk;
    });
    process.stdin.on('end', () => finish(input));
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  MARKER_TEMPLATE_README,
  MARKER_README_RESIDUE,
  MARKER_TEMPLATE_EXAMPLES,
  MARKER_EXAMPLES_RESIDUE,
  TRAILING_SECTION_TITLE,
  parseArguments,
  splitSections,
  validateMarkerGrammar,
  main,
};
