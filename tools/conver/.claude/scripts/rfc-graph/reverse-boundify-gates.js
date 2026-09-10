#!/usr/bin/env node
// [::TICKET::] P22-15 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-15 --for-spec --no-implementation-order`.

/**
 * reverse-boundify-gates.js — the pure judgements of B1, B2 and B3 (§6.7, §6.14.5).
 *
 * Every function here is a predicate over strings and arrays: no filesystem, no graph, no
 * CLI. That separation is what makes the guarantees arguable. B2's claim — that the only
 * difference is the header — is reconstructed from two strings alone, so it holds whatever
 * the caller read from disk, and it can be tested without a fixture tree.
 *
 * The vocabularies live here too, because a gate and its caller disagreeing about what a
 * status or a disposition is called is the defect the constants exist to prevent.
 *
 * Two properties carry the whole gate:
 *
 *   - B2 reconstructs the after-content from the before-content with one contiguous
 *     insertion. That is a byte-for-byte equality, so it cannot be satisfied by a change
 *     that happens to land inside the header band, and a same-length substitution is
 *     rejected rather than accepted as "no size change".
 *   - B1 compares two measured inventories. A created path fails it by name, and so does a
 *     removed one, because a deletion disturbs the existing structure as much as a creation.
 *
 * Usage: required by `reverse-boundify.js`; not a CLI of its own.
 */
'use strict';

const crypto = require('crypto');

const { HEADER_MARKER_TEXT } = require('./boundify-helpers.js');

/** The gate vocabulary, declared locally for the reason `reverse-boundify.js` gives. */
const GATE_STATUS = Object.freeze({ PASS: 'PASS', FAIL: 'FAIL' });

/** The three gate identifiers, named once so report, tests and design cannot disagree. */
const GATE_IDS = Object.freeze({ B1: 'B1', B2: 'B2', B3: 'B3' });

/** What became of one declared file. The keys are the vocabulary a reader acts on. */
const DISPOSITIONS = Object.freeze({
  ATTACHED: 'header_attached',
  PRESERVED: 'header_preserved',
  ABSENT: 'absent',
  REFUSED: 'refused',
});

/** Why a header could not be attached. Named so a caller can branch without parsing prose. */
const REFUSAL_REASONS = Object.freeze({
  ALREADY_CARRIES_HEADER: 'already_carries_a_header',
  NOT_A_TEXT_FILE: 'not_a_text_file',
  HEADER_CANNOT_BE_GENERATED: 'header_cannot_be_generated',
});

/** Why a resolved path is not usable. The two are reported differently, so they differ. */
const RESOLUTION_REASONS = Object.freeze({
  ABSENT: 'absent',
  NOT_A_READABLE_FILE: 'not_a_readable_file',
});

/**
 * Comment forms a header line may open with.
 *
 * `#` is listed because the oracle's counting rule accepts it, and a detection rule that
 * disagreed with the counting rule would report disagreements that belong to us rather
 * than to the tree.
 */
const HEADER_COMMENT_PREFIXES = Object.freeze(['//', '#']);

/** A separator line bounding the header band, in either comment form. */
const HEADER_SEPARATOR_RE = /^\s*(?:\/\/|#)\s*=+\s*$/;

/** A line that a header may be made of: a line comment, or nothing at all. */
const COMMENT_OR_BLANK_RE = /^\s*(?:\/\/|#)/;

/** A shebang must stay the first line, so a header goes below it or the file stops running. */
const SHEBANG_RE = /^#!.*$/;

/**
 * A NUL byte means the file is not text, and a comment in it would be corruption.
 *
 * Built from its code point rather than written into the source, so this file stays plain
 * text and no tool has to guess whether it is binary.
 */
const NUL_BYTE = String.fromCharCode(0);

/** The one blank line the generator places between the header and the body. */
const BLANK_LINE = '';

/** One gate record, in the shape the reverse-rotation gates already report. */
// [::TICKET::] P22-15 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-15 --for-spec --no-implementation-order`.
function gateRecord(gateId, status, counts, reasons, failures) {
  return { gateId, status, counts, reasons, ...failures };
}

/** A lowercase hex sha256 of a UTF-8 string. */
// [::TICKET::] P22-15 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-15 --for-spec --no-implementation-order`.
function sha256Hex(text) {
  return crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

/** The character offset at which a zero-indexed line begins, or the end of the content. */
// [::TICKET::] P22-15 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-15 --for-spec --no-implementation-order`.
function lineStartOffset(content, lineIndex) {
  if (lineIndex <= 0) return 0;
  let offset = 0;
  for (let line = 0; line < lineIndex; line += 1) {
    const nextBreak = content.indexOf('\n', offset);
    if (nextBreak === -1) return content.length;
    offset = nextBreak + 1;
  }
  return offset;
}

/** The one-indexed line numbers at which two texts differ, up to the longer of the two. */
// [::TICKET::] P22-15 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-15 --for-spec --no-implementation-order`.
function differingLines(left, right) {
  const leftLines = left.split('\n');
  const rightLines = right.split('\n');
  const lines = [];
  for (let index = 0; index < Math.max(leftLines.length, rightLines.length); index += 1) {
    if ((leftLines[index] ?? '<absent>') !== (rightLines[index] ?? '<absent>')) lines.push(index + 1);
  }
  return lines;
}

/**
 * Whether a single line begins a provenance header.
 *
 * The marker must follow the comment prefix directly: the string `Initial Design Artifact`
 * occurs in 43 files of RFC and ticket prose that carry no header, and counting those would
 * report headers that nothing wrote.
 *
 * @param {string} line
 * @returns {boolean}
 */
// [::TICKET::] P22-15 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-15 --for-spec --no-implementation-order`.
function headerLine(line) {
  if (typeof line !== 'string') return false;
  const trimmed = line.trim();
  return HEADER_COMMENT_PREFIXES.some((prefix) => (
    trimmed.startsWith(prefix) && trimmed.slice(prefix.length).trim().startsWith(HEADER_MARKER_TEXT)
  ));
}

/**
 * The header band of a file, or null when it carries no header.
 *
 * The band is the opening comment block that contains the marker, and its closing separator
 * is the last separator inside that block. A file's *final* separator is not the boundary:
 * `src/config/codec_policy_fallback.rs` carries decorative `// ====` banners at lines 44 and
 * 46, and a rule that reached them would absorb 46 lines of body into the header and report
 * a body change that never happened.
 *
 * A marker standing alone, with no separator after it, is its own band, so a hand-written
 * header is still found.
 *
 * @param {string} content
 * @returns {{present: boolean, markerLine: number, startLine: number, endLine: number}|null}
 */
// [::TICKET::] P22-15 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-15 --for-spec --no-implementation-order`.
function detectHeader(content) {
  if (typeof content !== 'string') return null;
  const lines = content.split('\n');
  const markerLine = lines.findIndex(headerLine);
  if (markerLine === -1) return null;

  let openingBlockEnd = 0;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() !== '' && !COMMENT_OR_BLANK_RE.test(lines[index])) break;
    openingBlockEnd = index;
  }

  let endLine = markerLine;
  for (let index = openingBlockEnd; index > markerLine; index -= 1) {
    if (HEADER_SEPARATOR_RE.test(lines[index])) { endLine = index; break; }
  }

  return { present: true, markerLine, startLine: 0, endLine };
}

/**
 * sha256 of the file with its header band removed, so the body's identity survives a header.
 *
 * Detection and hashing are separate functions on purpose: the "body unchanged" assertion
 * compares this value on both sides, and a file with no header hashes in full. If the
 * detector were wrong the comparison would still hold, because both sides would be wrong
 * the same way — which is why the exact guarantee is carried by `assertHeaderOnlyDiff`
 * rather than by this hash alone.
 *
 * The blank line the generator places after the band is removed too, because it is part of
 * the header's own spacing rather than the body's. At most one is removed, so a body that
 * genuinely opens with blank lines is not silently shortened.
 *
 * @param {string} content
 * @returns {string} lowercase hex sha256
 */
// [::TICKET::] P22-15 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-15 --for-spec --no-implementation-order`.
function bodyHash(content) {
  if (typeof content !== 'string') return sha256Hex('');
  const header = detectHeader(content);
  if (!header) return sha256Hex(content);

  const lines = content.split('\n');
  let bodyStart = header.endLine + 1;
  if (lines[bodyStart] === BLANK_LINE) bodyStart += 1;
  return sha256Hex(lines.slice(bodyStart).join('\n'));
}

/** The zero-indexed line a header is inserted before: below a shebang, otherwise at the top. */
// [::TICKET::] P22-15 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-15 --for-spec --no-implementation-order`.
function headerInsertLine(content) {
  return SHEBANG_RE.test(content.split('\n')[0]) ? 1 : 0;
}

/**
 * Attach a header to a file that does not carry one.
 *
 * Refusals are named rather than silent. An existing header is never rewritten (supreme
 * law 4); a binary file is never given a comment; an empty header is never written. A
 * shebang is not a refusal — the header goes below it, because inserting above it would
 * stop the file being executable.
 *
 * @param {{path?: string, content?: string, headerText?: string}} input
 * @returns {{ok: true, path: string, content: string, atLine: number}
 *          |{ok: false, path: string, reason: string}}
 */
// [::TICKET::] P22-15 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-15 --for-spec --no-implementation-order`.
function attachHeader({ path: filePath, content, headerText } = {}) {
  const refusal = (reason) => ({ ok: false, path: filePath ?? '<unnamed file>', reason });

  if (typeof headerText !== 'string' || headerText.length === 0) {
    return refusal(REFUSAL_REASONS.HEADER_CANNOT_BE_GENERATED);
  }
  if (typeof content !== 'string') return refusal(RESOLUTION_REASONS.NOT_A_READABLE_FILE);
  if (content.includes(NUL_BYTE)) return refusal(REFUSAL_REASONS.NOT_A_TEXT_FILE);
  if (detectHeader(content)) return refusal(REFUSAL_REASONS.ALREADY_CARRIES_HEADER);

  const atLine = headerInsertLine(content);
  const offset = lineStartOffset(content, atLine);
  return {
    ok: true,
    path: filePath,
    atLine,
    content: content.slice(0, offset) + headerText + content.slice(offset),
  };
}

/**
 * B2 — the only difference between the two contents is the header.
 *
 * Reconstruct rather than inspect: the after-content must equal the before-content with
 * exactly one contiguous insertion at the declared line. A byte-for-byte equality is a
 * stronger claim than a line diff, and it cannot be satisfied by a change that happens to
 * land inside the band.
 *
 * @param {{path?: string, before?: string, after?: string, atLine?: number, headerText?: string}} input
 * @returns {{gateId: string, status: string, counts: object, reasons: string[], escaped: Array<{path: string, line: number}>}}
 */
// [::TICKET::] P22-15 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-15 --for-spec --no-implementation-order`.
function assertHeaderOnlyDiff({ path: filePath, before, after, atLine, headerText } = {}) {
  const name = filePath ?? '<unnamed file>';
  const beforeText = typeof before === 'string' ? before : '';
  const afterText = typeof after === 'string' ? after : '';

  if (beforeText === afterText) {
    return gateRecord(
      GATE_IDS.B2,
      GATE_STATUS.PASS,
      { changedLines: 0, escaped: 0 },
      [`${name} produced an empty diff: the file already carried a header, so no line changed`],
      { escaped: [] },
    );
  }

  if (!Number.isInteger(atLine) || typeof headerText !== 'string') {
    const lines = differingLines(afterText, beforeText);
    return gateRecord(
      GATE_IDS.B2,
      GATE_STATUS.FAIL,
      { changedLines: lines.length, escaped: lines.length },
      [
        `${name} was refused: the contents differ but no insertion point was declared, so the `
        + 'change cannot be shown to be header-only and must not be applied',
      ],
      { escaped: lines.map((line) => ({ path: name, line })) },
    );
  }

  const offset = lineStartOffset(beforeText, atLine);
  const expected = beforeText.slice(0, offset) + headerText + beforeText.slice(offset);
  const insertedLines = headerText.split('\n').length - 1;

  if (afterText === expected) {
    return gateRecord(
      GATE_IDS.B2,
      GATE_STATUS.PASS,
      { changedLines: insertedLines, escaped: 0 },
      [`${name} differs from its original by the header alone: ${insertedLines} line(s) inserted at line ${atLine + 1}, no other line changed`],
      { escaped: [] },
    );
  }

  const escaped = differingLines(afterText, expected).map((line) => ({ path: name, line }));
  return gateRecord(
    GATE_IDS.B2,
    GATE_STATUS.FAIL,
    { changedLines: escaped.length, escaped: escaped.length },
    escaped.map((finding) => (
      `${finding.path}:${finding.line} reaches outside the header, so the change is refused rather than applied`
    )),
    { escaped },
  );
}

/**
 * B1 — reverse mode generated no file, and removed none.
 *
 * A removal is reported too: deleting a file disturbs the existing structure exactly as
 * much as creating one, and "the existing structure is preserved" is the invariant this
 * gate exists to hold.
 *
 * @param {string[]} before — the inventory taken before the write
 * @param {string[]} after — the inventory taken after it
 * @returns {{gateId: string, status: string, counts: object, reasons: string[], created: string[], removed: string[]}}
 */
// [::TICKET::] P22-15 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-15 --for-spec --no-implementation-order`.
function assertNoNewFiles(before, after) {
  if (!Array.isArray(before) || !Array.isArray(after)) {
    return gateRecord(GATE_IDS.B1, GATE_STATUS.FAIL, { before: 0, after: 0, created: 0, removed: 0 }, [
      'no measured inventory was supplied, so no file can be shown to have been preserved; '
      + 'a gate that cannot see its input fails rather than passes',
    ], { created: [], removed: [] });
  }

  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const created = after.filter((name) => !beforeSet.has(name));
  const removed = before.filter((name) => !afterSet.has(name));
  const counts = { before: before.length, after: after.length, created: created.length, removed: removed.length };

  if (created.length === 0 && removed.length === 0) {
    return gateRecord(GATE_IDS.B1, GATE_STATUS.PASS, counts, [
      `all ${before.length} file(s) present before the write are still present, and none was added`,
    ], { created, removed });
  }

  const reasons = [];
  for (const name of created) reasons.push(`${name} was created, which reverse mode must never do`);
  for (const name of removed) reasons.push(`${name} was removed, which disturbs the existing structure`);
  return gateRecord(GATE_IDS.B1, GATE_STATUS.FAIL, counts, reasons, { created, removed });
}

/** One row of the correspondence table. Every field is a domain concept, not a position. */
// [::TICKET::] P22-15 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-15 --for-spec --no-implementation-order`.
function correspondenceEntry(operation) {
  return {
    declaredPath: operation.declaredPath,
    existingPath: operation.existingPath,
    originatingNodeId: operation.originatingNodeId,
    disposition: operation.disposition,
    reason: operation.reason,
    bodyHashBefore: operation.bodyHashBefore,
    bodyHashAfter: operation.bodyHashAfter,
  };
}

/**
 * B3's artefact — which declared files were not generated, because they already existed.
 *
 * An empty list is returned as an empty list rather than as null: zero declared files is a
 * finding to report, not an absence of a report, and the two must not look alike.
 *
 * @param {Array<object>} operations
 * @returns {Array<object>}
 */
// [::TICKET::] P22-15 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-15 --for-spec --no-implementation-order`.
function buildCorrespondenceTable(operations) {
  return (operations ?? []).map(correspondenceEntry);
}

/**
 * B3 — the correspondence table exists.
 *
 * The failure this gate names is a *missing* table, not a disagreement inside one. The
 * reverse rotation's gates treat a recorded difference as a pass and an unrecorded one as
 * the failure, and a run that emits nothing cannot be distinguished from a run that found
 * nothing.
 *
 * @param {Array<object>|null} table
 * @returns {{gateId: string, status: string, counts: object, reasons: string[], missing: string[]}}
 */
// [::TICKET::] P22-15 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-15 --for-spec --no-implementation-order`.
function assertCorrespondenceTable(table) {
  if (!Array.isArray(table)) {
    return gateRecord(GATE_IDS.B3, GATE_STATUS.FAIL, { entries: 0 }, [
      'the correspondence table was not emitted, so which declared files were not generated '
      + 'is unrecorded; a missing table and an empty one must not look alike',
    ], { missing: [] });
  }

  if (table.length === 0) {
    return gateRecord(GATE_IDS.B3, GATE_STATUS.PASS, { entries: 0 }, [
      'the correspondence table is explicit and empty: zero files were declared, so an empty '
      + 'table is the honest record rather than a missing one',
    ], { missing: [] });
  }

  const unnamed = table
    .filter((entry) => typeof entry?.reason !== 'string' || entry.reason.length === 0)
    .map((entry) => entry?.declaredPath ?? '<unnamed file>');
  if (unnamed.length > 0) {
    return gateRecord(GATE_IDS.B3, GATE_STATUS.FAIL, { entries: table.length }, unnamed.map((name) => (
      `${name} is listed without a reason, so the record cannot be acted on`
    )), { missing: unnamed });
  }

  return gateRecord(GATE_IDS.B3, GATE_STATUS.PASS, { entries: table.length }, [
    `the correspondence table records all ${table.length} declared file(s), including the ones that were not generated`,
  ], { missing: [] });
}

/** Every gate's judgement folded into one record, so the worst finding leads. */
// [::TICKET::] P22-15 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-15 --for-spec --no-implementation-order`.
function summarizeGate(gateId, records, counts) {
  const escaped = records.flatMap((record) => record.escaped ?? []);
  const failed = records.filter((record) => record.status === GATE_STATUS.FAIL);
  const status = failed.length > 0 ? GATE_STATUS.FAIL : GATE_STATUS.PASS;
  const reasons = failed.length > 0
    ? failed.flatMap((record) => record.reasons)
    : records.flatMap((record) => record.reasons);

  return gateRecord(gateId, status, { ...counts, escaped: escaped.length }, reasons, { escaped });
}

/** B2's judgement over every operation the plan would apply. */
// [::TICKET::] P22-15 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-15 --for-spec --no-implementation-order`.
function judgeHeaderOnlyDiffs(operations) {
  const written = operations.filter((operation) => (
    operation.disposition === DISPOSITIONS.ATTACHED || operation.disposition === DISPOSITIONS.PRESERVED
  ));
  const records = written.map((operation) => assertHeaderOnlyDiff({
    path: operation.declaredPath,
    before: operation.before,
    after: operation.after,
    atLine: operation.atLine,
    headerText: operation.headerText,
  }));

  const changedLines = records.reduce((total, record) => total + record.counts.changedLines, 0);
  const summary = summarizeGate(GATE_IDS.B2, records, { files: written.length, changedLines });
  if (summary.status === GATE_STATUS.PASS) {
    summary.reasons = [
      `every one of the ${written.length} file(s) that would be written produced a header-only diff `
      + `(${changedLines} line(s) inserted, 0 escaped); an empty diff is reported as such rather than as a failure`,
    ];
    summary.escaped = [];
  }
  return summary;
}

module.exports = {
  BLANK_LINE,
  COMMENT_OR_BLANK_RE,
  DISPOSITIONS,
  GATE_IDS,
  GATE_STATUS,
  HEADER_COMMENT_PREFIXES,
  HEADER_MARKER_TEXT,
  HEADER_SEPARATOR_RE,
  NUL_BYTE,
  REFUSAL_REASONS,
  RESOLUTION_REASONS,
  SHEBANG_RE,
  assertCorrespondenceTable,
  assertHeaderOnlyDiff,
  assertNoNewFiles,
  attachHeader,
  bodyHash,
  buildCorrespondenceTable,
  correspondenceEntry,
  detectHeader,
  differingLines,
  gateRecord,
  headerInsertLine,
  headerLine,
  judgeHeaderOnlyDiffs,
  lineStartOffset,
  sha256Hex,
  summarizeGate,
};
