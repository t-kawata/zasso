#!/usr/bin/env node

/**
 * loop-drive-readme.js — Independent loop-driving script for Step 2 + Step 3 (PX-156)
 *
 * Scans README.md markers by heading, reports unresolved usage sections,
 * verifies the loop exit condition (zero <::TEMPLATE-README::> markers), and
 * applies per-section transitions:
 *   - resolve-section:  replace a usage section with complete prose (marker removed)
 *   - mark-residue:     replace a usage section body with <::README-RESIDUE::> + evidence
 *
 * After the Step 2 loop converges, the trailing examples section is resolved by
 * the dedicated Step 3 commands:
 *   - resolve-examples:      replace the examples section with complete prose
 *   - mark-examples-residue: replace the examples body with <::EXAMPLES-RESIDUE::> + evidence
 *   - --check-examples:      exit 0 when the examples step is complete, else 1
 *
 * CLI:
 *   loop-drive-readme.js --graph=<path> --check     exit 0 when the loop converged, else 1
 *   loop-drive-readme.js --status=<path> --list     print the section classification
 *   loop-drive-readme.js --graph=<path> resolve-section  (stdin JSON {id, heading, content})
 *   loop-drive-readme.js --status=<path> mark-residue   (stdin JSON {id, heading, content})
 *   loop-drive-readme.js --graph=<path> resolve-examples  (stdin JSON {content})
 *   loop-drive-readme.js --status=<path> mark-examples-residue  (stdin JSON {content})
 *   loop-drive-readme.js --graph=<path> --check-examples
 *
 * The README path is derived internally from the status sourceFile:
 * rfcDir = dirname(sourceFile), readmePath = <rfcDir>/README.md. There is no
 * --readme flag.
 *
 * resolve-section / mark-residue are the Step 2 transition commands: from one
 * stdin JSON they both rewrite the README section (marker removed / replaced by
 * <::README-RESIDUE::>) and upsert CRYSTALIZE-Status.json grill.sections, so the
 * AI only supplies the section content — the mechanical edit is scripted.
 * --check reports convergence only when every usage section is complete or a
 * residue record AND the marker grammar is clean (cross-contamination or dual
 * markers keep the loop running). The examples transition commands additionally
 * refuse to run until the loop has converged (C003 precondition) and the
 * examples section still carries <::TEMPLATE-EXAMPLES::>.
 *
 * Output convention: every AI-facing message is natural-language English.
 * Machine data (--check/--list) stays JSON on stdout; polite English guidance is
 * written to stderr; confirmations are English prose and errors use the 3-part
 * [ERROR] / Cause: / Action: format.
 *
 * This script is independent: it is NOT an extension of update-step-status.js.
 */

const fs = require('fs');
const path = require('path');
const { fromHomeRelative } = require('../lib/path-utils');
const { readGraphFile } = require('./validate-graph-arg.js');
const {
  MARKER_TEMPLATE_README,
  MARKER_README_RESIDUE,
  MARKER_TEMPLATE_EXAMPLES,
  MARKER_EXAMPLES_RESIDUE,
  TRAILING_SECTION_TITLE,
  splitSections,
  validateMarkerGrammar,
} = require('./validate-marker-grammar.js');

/** CLI flag: explicit status file path */
const FLAG_STATUS = '--status=';

/** CLI flag: graph path from which the status path is derived */
const FLAG_GRAPH = '--graph=';

/** Fixed status filename inside rfcDir */
const CRYSTALIZE_STATUS_FILENAME = 'CRYSTALIZE-Status.json';

/** Fixed README filename inside rfcDir (derived internally, never a CLI flag) */
const README_FILENAME = 'README.md';

/** CLI subcommand: resolve a usage section to complete prose */
const SUBCOMMAND_RESOLVE = 'resolve-section';

/** CLI subcommand: mark a usage section as an in-README residue record */
const SUBCOMMAND_MARK_RESIDUE = 'mark-residue';

/** CLI subcommand: resolve the trailing examples section to complete prose */
const SUBCOMMAND_RESOLVE_EXAMPLES = 'resolve-examples';

/** CLI subcommand: mark the trailing examples section as an in-README residue record */
const SUBCOMMAND_MARK_EXAMPLES_RESIDUE = 'mark-examples-residue';

/** Reserved grill.sections id tracking the trailing examples section state */
const EXAMPLES_SECTION_ID = 'EXAMPLES';

/**
 * Parse command line arguments.
 *
 * @param {string[]} [args] — Test argument array (defaults to process.argv when omitted)
 * @returns {{ statusPath: string|null, graphPath: string|null, check: boolean, checkExamples: boolean, list: boolean, subcommand: string|null }}
 * @throws {Error} If the argument syntax is invalid
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function parseArguments(args) {
  const argv = args || process.argv.slice(2);
  let statusPath = null;
  let graphPath = null;
  let check = false;
  let checkExamples = false;
  let list = false;
  let subcommand = null;
  for (const arg of argv) {
    if (arg.startsWith(FLAG_STATUS)) {
      statusPath = arg.slice(FLAG_STATUS.length);
    } else if (arg.startsWith(FLAG_GRAPH)) {
      graphPath = arg.slice(FLAG_GRAPH.length);
    } else if (arg === '--check') {
      check = true;
    } else if (arg === '--check-examples') {
      checkExamples = true;
    } else if (arg === '--list') {
      list = true;
    } else if (arg === SUBCOMMAND_RESOLVE || arg === SUBCOMMAND_MARK_RESIDUE
      || arg === SUBCOMMAND_RESOLVE_EXAMPLES || arg === SUBCOMMAND_MARK_EXAMPLES_RESIDUE) {
      subcommand = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (check && checkExamples) {
    throw new Error('Specify either --check or --check-examples, not both.');
  }
  if (statusPath && graphPath) {
    throw new Error('Specify either --status or --graph, not both.');
  }
  if (!statusPath && !graphPath) {
    throw new Error('--graph=<path> or --status=<path> is required.');
  }
  return { statusPath, graphPath, check, checkExamples, list, subcommand };
}

/**
 * Resolve the status file path: explicit --status or derived from --graph.
 *
 * @param {{ statusPath: string|null, graphPath: string|null }} parsed — Parsed arguments
 * @returns {string} Absolute status file path
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function resolveStatusPath(parsed) {
  if (parsed.statusPath) return parsed.statusPath;
  const graph = readGraphFile(parsed.graphPath);
  const expandedSource = path.resolve(fromHomeRelative(graph.sourceFile));
  return path.join(path.dirname(expandedSource), CRYSTALIZE_STATUS_FILENAME);
}

/**
 * Read the status file as JSON, backfilling an empty per-section state so the
 * transition commands can upsert grill.sections even on a legacy status.
 *
 * @param {string} statusPath — Status file path
 * @returns {Object} Status data
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function readStatus(statusPath) {
  const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  if (!status.grill) status.grill = {};
  if (!Array.isArray(status.grill.sections)) status.grill.sections = [];
  return status;
}

/**
 * Read and parse a JSON object from stdin.
 *
 * @returns {Object} Parsed stdin JSON object
 * @throws {Error} If stdin is not a JSON object
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function readStdinJson() {
  const raw = fs.readFileSync(0, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Input must be a JSON object.');
  }
  return parsed;
}

/**
 * Return the confirmedContent of the toc node matching the given id, or null.
 *
 * @param {Object} status — Status data
 * @param {string} id — TOC node id
 * @returns {string|null} The node's confirmedContent, or null when absent
 */
function confirmedContentOf(status, id) {
  const nodes = status.grill && status.grill.toc && status.grill.toc.nodes;
  if (!Array.isArray(nodes)) return null;
  const node = nodes.find((n) => n.id === id);
  return node && typeof node.confirmedContent === 'string' ? node.confirmedContent : null;
}

/**
 * Upsert a section's transition state into status.grill.sections, carrying the
 * user's confirmedContent over from the matching toc node so the section layer
 * and README render it as the section lead.
 *
 * @param {Object} status — Status data (readStatus output)
 * @param {string} id — TOC node id
 * @param {string} heading — Section heading text
 * @param {string} state — 'complete' | 'residue'
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function updateSectionState(status, id, heading, state) {
  const sections = status.grill.sections;
  let record = sections.find((s) => s.id === id);
  if (record) {
    record.heading = heading;
    record.state = state;
  } else {
    record = { id, heading, state };
    sections.push(record);
  }
  record.confirmedContent = confirmedContentOf(status, id);
  return record;
}

/**
 * Return the heading line (with its original level) of the given section.
 *
 * @param {string} text — README markdown content
 * @param {string} headingText — Section heading text
 * @returns {string} The heading line, e.g. '## アカウントの追加'
 * @throws {Error} If the section heading is not found
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function sectionHeadingLine(text, headingText) {
  const sections = splitSections(text);
  const target = sections.find((s) => s.headingText === headingText);
  if (!target) {
    throw new Error(`Section "${headingText}" not found.`);
  }
  return text.split('\n')[target.headingLineIndex];
}

/**
 * Write a file atomically using temp file + rename.
 *
 * @param {string} targetPath — Target file path
 * @param {string} data — UTF-8 content to write
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function atomicWrite(targetPath, data) {
  const tmpPath = `${targetPath}.tmp.${process.pid}`;
  fs.writeFileSync(tmpPath, data, 'utf8');
  fs.renameSync(tmpPath, targetPath);
}

/**
 * Print a 3-part English error (message / cause / action) to stderr and exit 1.
 *
 * @param {string} message — What happened
 * @param {string} reason — Why it happened
 * @param {string} action — What the AI should do next
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function exitWithError(message, reason, action) {
  console.error(`[ERROR] ${message}`);
  console.error(`Cause: ${reason}`);
  console.error(`Action: ${action}`);
  process.exit(1);
}

/**
 * Human-readable English summary of the --list section scan for the AI driver.
 *
 * @param {Object} scan — scanMarkers result
 * @returns {string} English guidance
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function scanSummary(scan) {
  return `Section scan: ${scan.pending.length} pending, ${scan.complete.length} complete, ${scan.residue.length} residue. Use 'resolve-section' for writable sections and 'mark-residue' for unwritable ones.`;
}

/**
 * Human-readable English summary of the --check loop verdict for the AI driver.
 *
 * @param {Object} verdict — checkLoopReady result
 * @returns {string} English guidance
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function checkSummary(verdict) {
  if (verdict.ready) {
    return 'Loop converged: every usage section is complete or a residue record. Proceed to the examples step.';
  }
  const reasons = [];
  if (verdict.unresolved.length > 0) {
    reasons.push(`${verdict.unresolved.length} usage section(s) still carry <::TEMPLATE-README::>: ${verdict.unresolved.join(', ')}`);
  }
  if (verdict.violations && verdict.violations.length > 0) {
    reasons.push(`marker grammar violation(s): ${verdict.violations.join('; ')}`);
  }
  const detail = reasons.length > 0 ? reasons.join('; ').replace(/\.$/, '') : 'the README is not in a converged state';
  const fix = verdict.violations && verdict.violations.length > 0
    ? 'Fix the marker grammar violation(s), then re-run --check.'
    : "Resolve each writable section with 'resolve-section', or record its evidence with 'mark-residue', then re-run --check.";
  return `Loop not converged: ${detail}. ${fix}`;
}

/**
 * Derive the README path from the status sourceFile.
 *
 * @param {Object} status — CRYSTALIZE-Status.json content
 * @returns {string} Absolute README path (<rfcDir>/README.md)
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function deriveReadmePath(status) {
  return path.join(path.dirname(status.sourceFile), README_FILENAME);
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
 * been resolved AND the marker grammar is clean (no cross-contamination, no dual
 * markers). The TEMPLATE-EXAMPLES marker in the trailing examples section is
 * allowed to remain — it is the post-loop examples step's work item. When not
 * ready, `violations` lists the marker-grammar errors so the AI can act on them.
 *
 * @param {string} text — README markdown content
 * @returns {{ ready: boolean, unresolved: string[], violations: string[] }}
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function checkLoopReady(text) {
  const scan = scanMarkers(text);
  const grammar = validateMarkerGrammar(text);
  return {
    ready: scan.readmeTemplateCount === 0 && grammar.ok,
    unresolved: scan.pending,
    violations: grammar.errors,
  };
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
 * evidence and reinforcement design, preserving the original heading line. When
 * a confirmedContent is given it is placed between the heading and the marker as
 * the section lead.
 *
 * @param {string} text — README markdown content
 * @param {string} headingText — Section heading text
 * @param {string} residueBody — Evidence + reinforcement design prose
 * @param {string|null} [confirmedContent] — Section lead paragraph, or null
 * @returns {string} Updated README
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function markResidue(text, headingText, residueBody, confirmedContent = null) {
  const lines = text.split('\n');
  const sections = splitSections(text);
  const target = sections.find((s) => s.headingText === headingText);
  if (!target) {
    throw new Error(`Section "${headingText}" not found.`);
  }
  const headingLine = lines[target.headingLineIndex];
  const lead = confirmedContent && confirmedContent.trim() !== '' ? `${confirmedContent}\n\n` : '';
  const newSectionText = `${headingLine}\n\n${lead}${MARKER_README_RESIDUE}\n${residueBody}`;
  return replaceSection(text, headingText, newSectionText);
}

/**
 * Scan the trailing examples section and classify its marker state.
 *
 * The examples section is resolved by the dedicated post-loop step (Step 3), not
 * the Step 2 loop; this helper reports whether it is still a template work unit,
 * a residue record, or already complete.
 *
 * @param {string} text — README markdown content
 * @returns {{ present: boolean, template: boolean, residue: boolean, complete: boolean }}
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function scanExamplesState(text) {
  const sections = splitSections(text);
  const examples = sections.find((s) => normalize(s.headingText) === normalize(TRAILING_SECTION_TITLE));
  if (!examples) {
    return { present: false, template: false, residue: false, complete: false };
  }
  const body = examples.body.join('\n');
  return {
    present: true,
    template: body.includes(MARKER_TEMPLATE_EXAMPLES),
    residue: body.includes(MARKER_EXAMPLES_RESIDUE),
    complete: !body.includes(MARKER_TEMPLATE_EXAMPLES) && !body.includes(MARKER_EXAMPLES_RESIDUE),
  };
}

/**
 * Mark the trailing examples section as residue: replace its body with
 * <::EXAMPLES-RESIDUE::> plus the evidence and reinforcement design, preserving
 * the original heading line.
 *
 * @param {string} text — README markdown content
 * @param {string} headingText — Examples section heading text
 * @param {string} residueBody — Evidence + reinforcement design prose
 * @returns {string} Updated README
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function markExamplesResidue(text, headingText, residueBody) {
  const lines = text.split('\n');
  const sections = splitSections(text);
  const target = sections.find((s) => s.headingText === headingText);
  if (!target) {
    throw new Error(`Section "${headingText}" not found.`);
  }
  const headingLine = lines[target.headingLineIndex];
  const newSectionText = `${headingLine}\n\n${MARKER_EXAMPLES_RESIDUE}\n${residueBody}`;
  return replaceSection(text, headingText, newSectionText);
}

/**
 * Check the Step 3 completion condition: the Step 2 loop has converged AND the
 * trailing examples section no longer carries <::TEMPLATE-EXAMPLES::>. The
 * section must still be present — a missing trailing section is a structural
 * defect, not a resolved state.
 *
 * @param {string} text — README markdown content
 * @returns {{ ready: boolean, unresolved: string[], violations: string[], examples: object }}
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function checkExamplesReady(text) {
  const loop = checkLoopReady(text);
  const examples = scanExamplesState(text);
  return {
    ready: loop.ready && examples.present && !examples.template,
    unresolved: loop.unresolved,
    violations: loop.violations,
    examples,
  };
}

/**
 * Human-readable English summary of the --check-examples verdict for the AI driver.
 *
 * @param {Object} verdict — checkExamplesReady result
 * @returns {string} English guidance
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function examplesSummary(verdict) {
  if (verdict.ready) {
    return 'Examples resolved: the Step 2 loop has converged and <::TEMPLATE-EXAMPLES::> is resolved to a complete or residue record. The README is final.';
  }
  const reasons = [];
  if (verdict.unresolved.length > 0) {
    reasons.push(`${verdict.unresolved.length} usage section(s) still carry <::TEMPLATE-README::>: ${verdict.unresolved.join(', ')}`);
  }
  if (verdict.examples && !verdict.examples.present) {
    reasons.push('the trailing examples section is missing');
  } else if (verdict.examples && verdict.examples.template) {
    reasons.push('the examples section still carries <::TEMPLATE-EXAMPLES::>');
  }
  if (verdict.violations && verdict.violations.length > 0) {
    reasons.push(`marker grammar violation(s): ${verdict.violations.join('; ')}`);
  }
  const detail = reasons.length > 0 ? reasons.join('; ').replace(/\.$/, '') : 'the examples step is not in a resolved state';
  let fix;
  if (verdict.unresolved.length > 0) {
    fix = "Resolve each writable usage section with 'resolve-section', or record its evidence with 'mark-residue', then re-run --check-examples.";
  } else if (verdict.violations && verdict.violations.length > 0) {
    fix = 'Fix the marker grammar violation(s), then re-run --check-examples.';
  } else {
    fix = "Resolve the examples section with 'resolve-examples', or record its evidence with 'mark-examples-residue', then re-run --check-examples.";
  }
  return `Examples not resolved: ${detail}. ${fix}`;
}

/**
 * Apply one Step 2 section transition (resolve or mark-residue) to both files.
 *
 * Reads {id, heading, content} from stdin, rewrites the README section via the
 * pure transformation functions, and upserts grill.sections in the status — all
 * paths derived internally. Both files are written atomically, so the AI only
 * supplies the section content and never hand-edits the README.
 *
 * @param {{ statusPath: string|null, graphPath: string|null, subcommand: string|null }} parsed — Parsed arguments
 * @throws {Error} If input is invalid or the section is not found
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function executeSectionTransition(parsed) {
  const statusPath = resolveStatusPath(parsed);
  const status = readStatus(statusPath);
  const readmePath = deriveReadmePath(status);
  const input = readStdinJson();
  const { id, heading, content } = input;
  if (typeof id !== 'string' || id.trim() === '') throw new Error('input.id is required.');
  if (typeof heading !== 'string' || heading.trim() === '') throw new Error('input.heading is required.');
  if (typeof content !== 'string' || content.trim() === '') throw new Error('input.content is required.');

  const text = fs.readFileSync(readmePath, 'utf8');
  const isResolve = parsed.subcommand === SUBCOMMAND_RESOLVE;
  const confirmedContent = confirmedContentOf(status, id);
  const lead = confirmedContent && confirmedContent.trim() !== '' ? confirmedContent : null;
  // Keep a blank line after the section so the next heading stays separated.
  const body = content.endsWith('\n') ? content : `${content}\n`;
  const next = isResolve
    ? resolveSection(text, heading, `${sectionHeadingLine(text, heading)}\n\n${lead ? `${lead}\n\n${body}` : body}`)
    : markResidue(text, heading, body, lead);

  atomicWrite(readmePath, next);
  updateSectionState(status, id, heading, isResolve ? 'complete' : 'residue');
  atomicWrite(statusPath, JSON.stringify(status, null, 2));
  process.stdout.write(isResolve
    ? `Section resolved: ${id} (${heading}). README.md now holds the complete description and CRYSTALIZE-Status.json marks it 'complete'.\n`
    : `Section marked as residue: ${id} (${heading}). README.md now records <::README-RESIDUE::> with the evidence, and CRYSTALIZE-Status.json marks it 'residue'.\n`);
}

/**
 * Apply one examples-step transition (resolve-examples or mark-examples-residue)
 * to both files.
 *
 * Reads {content} from stdin, verifies the Step 2 loop has converged (C003
 * precondition) and that the examples section still carries its template marker,
 * then rewrites the trailing examples section and upserts the status
 * (examplesApproved plus a grill.sections EXAMPLES record). Both files are
 * written atomically, so the AI only supplies the content and never hand-edits
 * the README.
 *
 * @param {{ statusPath: string|null, graphPath: string|null, subcommand: string|null }} parsed — Parsed arguments
 * @throws {Error} If input is invalid, the loop has not converged, or the section lacks its template marker
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function executeExamplesTransition(parsed) {
  const statusPath = resolveStatusPath(parsed);
  const status = readStatus(statusPath);
  const readmePath = deriveReadmePath(status);
  const input = readStdinJson();
  const { content } = input;
  if (typeof content !== 'string' || content.trim() === '') throw new Error('input.content is required.');

  const text = fs.readFileSync(readmePath, 'utf8');
  const loop = checkLoopReady(text);
  if (!loop.ready) {
    throw new Error('The Step 2 loop has not converged; resolve every <::TEMPLATE-README::> before resolving the examples section.');
  }
  const examplesState = scanExamplesState(text);
  if (!examplesState.template) {
    throw new Error('The examples section no longer carries <::TEMPLATE-EXAMPLES::>; it is already resolved or missing.');
  }

  const isResolve = parsed.subcommand === SUBCOMMAND_RESOLVE_EXAMPLES;
  const body = content.endsWith('\n') ? content : `${content}\n`;
  const headingLine = sectionHeadingLine(text, TRAILING_SECTION_TITLE);
  const next = isResolve
    ? resolveSection(text, TRAILING_SECTION_TITLE, `${headingLine}\n\n${body}`)
    : markExamplesResidue(text, TRAILING_SECTION_TITLE, body);

  atomicWrite(readmePath, next);
  status.grill.examplesApproved = isResolve;
  updateSectionState(status, EXAMPLES_SECTION_ID, TRAILING_SECTION_TITLE, isResolve ? 'complete' : 'residue');
  atomicWrite(statusPath, JSON.stringify(status, null, 2));
  process.stdout.write(isResolve
    ? 'Examples section resolved. README.md now holds the complete examples design and CRYSTALIZE-Status.json marks it \'complete\'.\n'
    : 'Examples section marked as residue. README.md now records <::EXAMPLES-RESIDUE::> with the evidence, and CRYSTALIZE-Status.json marks it \'residue\'.\n');
}

/**
 * main — CLI entry point.
 */
// [::TICKET::] PX-156 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-156 --for-spec --no-implementation-order`.
function main() {
  let parsed;
  try {
    parsed = parseArguments();
  } catch (parseError) {
    exitWithError(
      'Argument parse failed.',
      parseError.message,
      'Re-run with --graph=<path> or --status=<path>, plus --check, --check-examples, --list, resolve-section, mark-residue, resolve-examples, or mark-examples-residue.'
    );
  }

  if (parsed.subcommand === SUBCOMMAND_RESOLVE_EXAMPLES || parsed.subcommand === SUBCOMMAND_MARK_EXAMPLES_RESIDUE) {
    try {
      executeExamplesTransition(parsed);
    } catch (execError) {
      exitWithError(
        'Examples transition failed.',
        execError.message,
        'Provide {content} in the stdin JSON, make sure the Step 2 loop has converged, and make sure the examples section still carries <::TEMPLATE-EXAMPLES::>, then re-run.'
      );
    }
    return;
  }

  if (parsed.subcommand === SUBCOMMAND_RESOLVE || parsed.subcommand === SUBCOMMAND_MARK_RESIDUE) {
    try {
      executeSectionTransition(parsed);
    } catch (execError) {
      exitWithError(
        'Section transition failed.',
        execError.message,
        'Provide {id, heading, content} in the stdin JSON and make sure the heading matches a section reported by --list, then re-run.'
      );
    }
    return;
  }

  try {
    const statusPath = resolveStatusPath(parsed);
    const status = readStatus(statusPath);
    const readmePath = deriveReadmePath(status);
    const text = fs.readFileSync(readmePath, 'utf8');
    if (parsed.check) {
      const verdict = checkLoopReady(text);
      process.stdout.write(JSON.stringify(verdict) + '\n');
      process.stderr.write(checkSummary(verdict) + '\n');
      process.exit(verdict.ready ? 0 : 1);
    }
    if (parsed.checkExamples) {
      const verdict = checkExamplesReady(text);
      process.stdout.write(JSON.stringify(verdict) + '\n');
      process.stderr.write(examplesSummary(verdict) + '\n');
      process.exit(verdict.ready ? 0 : 1);
    }
    const scan = scanMarkers(text);
    process.stdout.write(JSON.stringify(scan) + '\n');
    process.stderr.write(scanSummary(scan) + '\n');
    process.exit(0);
  } catch (execError) {
    exitWithError(
      'loop-drive-readme failed.',
      execError.message,
      'Verify that the --graph/--status path resolves to a valid CRYSTALIZE-Status.json and README.md, then re-run.'
    );
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArguments,
  resolveStatusPath,
  readStatus,
  deriveReadmePath,
  readStdinJson,
  updateSectionState,
  confirmedContentOf,
  sectionHeadingLine,
  atomicWrite,
  exitWithError,
  scanSummary,
  checkSummary,
  executeSectionTransition,
  scanMarkers,
  checkLoopReady,
  replaceSection,
  resolveSection,
  markResidue,
  scanExamplesState,
  markExamplesResidue,
  checkExamplesReady,
  examplesSummary,
  executeExamplesTransition,
  main,
  FLAG_STATUS,
  FLAG_GRAPH,
  README_FILENAME,
  SUBCOMMAND_RESOLVE,
  SUBCOMMAND_MARK_RESIDUE,
  SUBCOMMAND_RESOLVE_EXAMPLES,
  SUBCOMMAND_MARK_EXAMPLES_RESIDUE,
  EXAMPLES_SECTION_ID,
};
