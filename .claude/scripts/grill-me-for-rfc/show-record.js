#!/usr/bin/env node
/**
 * show-record.js <path> --section "<heading>"
 *
 * Prints one section of a record, so that "open the cited section" is a command rather
 * than a paragraph of advice. A defect inherited from another package's appendix is a
 * reading, not a record, and this is what turns the reading into something a run can
 * confirm before carrying it.
 *
 * The heading may be given with or without its level markers and its section sign.
 *
 * Exit 0 — the heading resolved; its body is on stdout.
 * Exit 1 — the heading did not resolve, or the file could not be read. A heading that
 *          does not resolve is itself the finding: a claimed defect citing a section
 *          that does not exist is a defect in the claim.
 */
import { readFileSync } from 'node:fs';

import { findSectionByTitlePrefix, normalizeHeading } from './lib/markdown-sections.mjs';

const USAGE = 'usage: show-record.js <path> --section "<heading>"';

/**
 * @param {string[]} argv
 * @returns {{ path: string, section: string }}
 */
// [::TICKET::] PX-239 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-239 --for-spec --no-implementation-order`.
function parseArgs(argv) {
  const sectionIndex = argv.indexOf('--section');
  const section = sectionIndex === -1 ? '' : (argv[sectionIndex + 1] ?? '');
  const path = argv.find((arg, index) => !arg.startsWith('--') && index !== sectionIndex + 1) ?? '';
  return { path, section };
}

/**
 * @param {string[]} argv
 * @returns {number} the exit status
 */
export function run(argv) {
  const { path, section } = parseArgs(argv);

  if (path.length === 0 || section.length === 0) {
    process.stderr.write(`${USAGE}\n`);
    return 1;
  }

  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    process.stderr.write(`cannot read ${path}: ${error.message}\n`);
    return 1;
  }

  const found = findSectionByTitlePrefix(text, normalizeHeading(section));
  if (!found.found) {
    process.stderr.write(`no section matching "${section}" in ${path}\n`);
    return 1;
  }

  process.stdout.write(`${found.body}\n`);
  return 0;
}

process.exit(run(process.argv.slice(2)));
