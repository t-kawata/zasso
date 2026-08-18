#!/usr/bin/env node

/**
 * loop-drive-readme.js — Independent loop-driving script for Step 2 (PX-156)
 *
 * Scans README.md markers by heading, reports unresolved usage sections,
 * verifies the loop exit condition (zero <::TEMPLATE-README::> markers), and
 * applies per-section transitions:
 *   - resolveSection:  replace a section with complete prose (marker removed)
 *   - markResidue:     replace a section body with <::README-RESIDUE::> + evidence
 *
 * CLI:
 *   loop-drive-readme.js --readme=<path> --check   exit 0 when the loop converged, else 1
 *   loop-drive-readme.js --readme=<path> --list    print the section classification
 *
 * This script is independent: it is NOT an extension of validate-readme-output.js
 * or update-step-status.js.
 */

const fs = require('fs');
const {
  MARKER_TEMPLATE_README,
  MARKER_README_RESIDUE,
  MARKER_TEMPLATE_EXAMPLES,
  MARKER_EXAMPLES_RESIDUE,
  TRAILING_SECTION_TITLE,
  splitSections,
} = require('./validate-marker-grammar.js');

/** CLI flag: README path */
const FLAG_README = '--readme=';

/**
 * Parse command line arguments.
 *
 * @param {string[]} [args] — Test argument array (defaults to process.argv when omitted)
 * @returns {{ readmePath: string, check: boolean, list: boolean }}
 * @throws {Error} If the argument syntax is invalid
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function parseArguments(args) {
  const argv = args || process.argv.slice(2);
  let readmePath = null;
  let check = false;
  let list = false;
  for (const arg of argv) {
    if (arg.startsWith(FLAG_README)) {
      readmePath = arg.slice(FLAG_README.length);
    } else if (arg === '--check') {
      check = true;
    } else if (arg === '--list') {
      list = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!readmePath) {
    throw new Error('--readme=<path> is required.');
  }
  return { readmePath, check, list };
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
 * Scan a README and classify its usage sections. The document title (first
 * section) and the trailing examples section are not loop work items; the
 * examples section is resolved by the dedicated post-loop step.
 *
 * @param {string} text — README markdown content
 * @returns {{ pending: string[], complete: string[], residue: string[], templateCount: number, readmeTemplateCount: number, examplesTemplateCount: number }}
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function scanMarkers(text) {
  const sections = splitSections(text);
  const result = {
    pending: [],
    complete: [],
    residue: [],
    templateCount: 0,
    readmeTemplateCount: 0,
    examplesTemplateCount: 0,
  };
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const body = section.body.join('\n');
    const templateReadme = (body.match(/<::TEMPLATE-README::>/g) || []).length;
    const templateExamples = (body.match(/<::TEMPLATE-EXAMPLES::>/g) || []).length;
    result.templateCount += templateReadme + templateExamples;
    result.readmeTemplateCount += templateReadme;
    result.examplesTemplateCount += templateExamples;

    const isTitle = i === 0;
    const isExamples = normalize(section.headingText) === normalize(TRAILING_SECTION_TITLE);
    if (isTitle || isExamples) continue;

    if (body.includes(MARKER_TEMPLATE_README)) {
      result.pending.push(section.headingText);
    } else if (body.includes(MARKER_README_RESIDUE) || body.includes(MARKER_EXAMPLES_RESIDUE)) {
      result.residue.push(section.headingText);
    } else {
      result.complete.push(section.headingText);
    }
  }
  return result;
}

/**
 * Check the Step 2 loop exit condition: every TEMPLATE-README usage section has
 * been resolved. The TEMPLATE-EXAMPLES marker is allowed to remain — it is the
 * post-loop examples step's work item.
 *
 * @param {string} text — README markdown content
 * @returns {{ ready: boolean, unresolved: string[] }}
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function checkLoopReady(text) {
  const scan = scanMarkers(text);
  return { ready: scan.readmeTemplateCount === 0, unresolved: scan.pending };
}

/**
 * Replace a whole section (heading line through end of its body) with new text.
 *
 * @param {string} text — README markdown content
 * @param {string} headingText — Section heading text to locate
 * @param {string} newSectionText — Replacement section text (heading + body)
 * @returns {string} Updated README
 * @throws {Error} If the section heading is not found
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function replaceSection(text, headingText, newSectionText) {
  const lines = text.split('\n');
  const sections = splitSections(text);
  const target = sections.find((s) => s.headingText === headingText);
  if (!target) {
    throw new Error(`Section "${headingText}" not found.`);
  }
  const next = sections.find((s) => s.headingLineIndex > target.headingLineIndex);
  const start = target.headingLineIndex;
  const end = next ? next.headingLineIndex - 1 : lines.length - 1;
  return [...lines.slice(0, start), ...newSectionText.split('\n'), ...lines.slice(end + 1)].join('\n');
}

/**
 * Resolve a section to complete prose, removing its TEMPLATE-README marker.
 *
 * @param {string} text — README markdown content
 * @param {string} headingText — Section heading text
 * @param {string} newSectionText — Complete replacement section (heading + body)
 * @returns {string} Updated README
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function resolveSection(text, headingText, newSectionText) {
  return replaceSection(text, headingText, newSectionText);
}

/**
 * Mark a section as residue: replace its body with <::README-RESIDUE::> plus the
 * evidence and reinforcement design, preserving the original heading line.
 *
 * @param {string} text — README markdown content
 * @param {string} headingText — Section heading text
 * @param {string} residueBody — Evidence + reinforcement design prose
 * @returns {string} Updated README
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function markResidue(text, headingText, residueBody) {
  const lines = text.split('\n');
  const sections = splitSections(text);
  const target = sections.find((s) => s.headingText === headingText);
  if (!target) {
    throw new Error(`Section "${headingText}" not found.`);
  }
  const headingLine = lines[target.headingLineIndex];
  const newSectionText = `${headingLine}\n\n${MARKER_README_RESIDUE}\n${residueBody}`;
  return replaceSection(text, headingText, newSectionText);
}

/**
 * main — CLI entry point.
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function main() {
  const parsed = parseArguments();
  const text = fs.readFileSync(parsed.readmePath, 'utf8');
  if (parsed.check) {
    const verdict = checkLoopReady(text);
    process.stdout.write(JSON.stringify(verdict) + '\n');
    process.exit(verdict.ready ? 0 : 1);
  }
  const scan = scanMarkers(text);
  process.stdout.write(JSON.stringify(scan) + '\n');
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArguments,
  scanMarkers,
  checkLoopReady,
  replaceSection,
  resolveSection,
  markResidue,
  main,
  FLAG_README,
};
