#!/usr/bin/env node
/**
 * backfill-confirmed-content.js — Idempotent migration that backfills the
 * confirmedContent field into an existing crystalize-readme run.
 *
 * The confirmedContent feature copies the user's confirmed section content from
 * grill.toc.nodes into grill.sections and renders it as the README section lead.
 * Runs produced before the feature carry neither. This migration closes that gap
 * for a single run: backfillStatus() fills sections[].confirmedContent from the
 * matching toc node by id, and backfillReadme() inserts a confirmedContent lead
 * paragraph after each usage heading. Re-running the migration is safe.
 *
 * CLI: node backfill-confirmed-content.js --status=<path>
 *   The README path is derived from status.sourceFile (same convention as
 *   loop-drive-readme.js).
 */

const fs = require('fs');
const path = require('path');
const { TRAILING_SECTION_TITLE, splitSections } = require('./validate-marker-grammar.js');
const { confirmedContentOf, replaceSection } = require('./loop-drive-readme.js');

const README_FILENAME = 'README.md';

/** Normalize text for case-insensitive heading comparison. */
function normalize(text) {
  return String(text).trim().toLowerCase();
}

/**
 * Return whether a section body already leads with the given paragraph, ignoring
 * the blank line(s) between the heading and the body.
 *
 * @param {string[]} bodyLines — Lines of the section body (including leading blanks)
 * @param {string} leadText — The confirmedContent paragraph
 * @returns {boolean}
 */
function bodyLeadsWith(bodyLines, leadText) {
  const leadLines = leadText.split('\n');
  let index = 0;
  while (index < bodyLines.length && bodyLines[index].trim() === '') index++;
  const rest = bodyLines.slice(index);
  if (rest.length < leadLines.length) return false;
  return leadLines.every((line, offset) => rest[offset] === line);
}

/**
 * Backfill sections[].confirmedContent from the matching toc node by id.
 *
 * @param {Object} status — Status data (mutated in place)
 * @returns {Object} The same status object
 */
function backfillStatus(status) {
  const sections = status.grill && status.grill.sections;
  if (!Array.isArray(sections)) return status;
  for (const section of sections) {
    section.confirmedContent = confirmedContentOf(status, section.id);
  }
  return status;
}

/**
 * Backfill a confirmedContent lead paragraph after each usage heading.
 *
 * The Examples section is left untouched. Sections whose heading matches no toc
 * node, or whose node has no confirmedContent, are left untouched. A section that
 * already leads with the paragraph is skipped, making the migration idempotent.
 *
 * @param {string} readmeText — README markdown content
 * @param {Object} status — Status data
 * @returns {string} Updated README
 */
function backfillReadme(readmeText, status) {
  const nodes = status.grill && status.grill.toc && status.grill.toc.nodes;
  const nodeList = Array.isArray(nodes) ? nodes : [];
  const sections = splitSections(readmeText);
  let result = readmeText;
  // Process from last to first so earlier heading line indices stay valid.
  for (let i = sections.length - 1; i >= 0; i--) {
    const section = sections[i];
    if (normalize(section.headingText) === normalize(TRAILING_SECTION_TITLE)) continue;
    const node = nodeList.find((n) => n.heading === section.headingText);
    const lead = node && typeof node.confirmedContent === 'string' && node.confirmedContent.trim() !== ''
      ? node.confirmedContent
      : null;
    if (!lead) continue;
    if (bodyLeadsWith(section.body, lead)) continue;
    const headingLine = readmeText.split('\n')[section.headingLineIndex];
    const bodyContent = section.body.join('\n').trim();
    const newSectionText = `${headingLine}\n\n${lead}${bodyContent ? `\n\n${bodyContent}` : ''}\n`;
    result = replaceSection(result, section.headingText, newSectionText);
  }
  return result;
}

/** Derive the README path from the status (same convention as loop-drive-readme). */
function deriveReadmePath(status) {
  return path.join(path.dirname(status.sourceFile), README_FILENAME);
}

/** Write a file atomically using temp file + rename. */
function atomicWrite(targetPath, data) {
  const tmpPath = `${targetPath}.tmp.${process.pid}`;
  fs.writeFileSync(tmpPath, data, 'utf8');
  fs.renameSync(tmpPath, targetPath);
}

/** CLI entry point. */
function main() {
  const args = process.argv.slice(2);
  const statusArg = args.find((arg) => arg.startsWith('--status='));
  if (!statusArg) {
    console.error('[ERROR] --status=<path> is required.');
    console.error('Action: Re-run with --status=<path to CRYSTALIZE-Status.json>.');
    process.exit(1);
  }
  const statusPath = path.resolve(statusArg.slice('--status='.length));
  const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  backfillStatus(status);
  const readmePath = deriveReadmePath(status);
  const readmeText = fs.readFileSync(readmePath, 'utf8');
  const nextReadme = backfillReadme(readmeText, status);
  atomicWrite(statusPath, JSON.stringify(status, null, 2));
  atomicWrite(readmePath, nextReadme);
  process.stdout.write('Backfilled confirmedContent into CRYSTALIZE-Status.json and README.md.\n');
}

if (require.main === module) {
  main();
}

module.exports = {
  normalize,
  bodyLeadsWith,
  backfillStatus,
  backfillReadme,
  deriveReadmePath,
  main,
};
