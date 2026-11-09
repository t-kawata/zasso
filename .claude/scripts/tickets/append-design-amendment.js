'use strict';

/**
 * Append-only amendment writer for SPEC and RFC.md.
 *
 * Both documents are authored prose, so the writer never edits an existing line.
 * It appends under one stable anchor and proves the pre-existing bytes survived.
 * A missing target is a refusal, not a create: creating a design document is the
 * owner command's job, not the transaction's.
 */

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const AMENDMENT_SECTION = '## Design Amendments';
const AMENDMENT_HEADING = /^### Amendment (.+)-(\d+)\s*$/;
const SECTION_BOUNDARY = /^## /;

const APPEND_TARGET_MISSING = 'APPEND_TARGET_MISSING';
const AMENDMENT_EDIT_REFUSED = 'AMENDMENT_EDIT_REFUSED';
const AMENDMENT_ANCHOR_COLLISION = 'AMENDMENT_ANCHOR_COLLISION';

/** The sha256 of a buffer. */
// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
function digestBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Write through a temporary file and rename, so a reader never sees a partial file. */
// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
function writeAtomically(filePath, bytes) {
  const temporary = filePath + '.amendment-tmp.' + process.pid;
  fs.writeFileSync(temporary, bytes);
  fs.renameSync(temporary, filePath);
}

/**
 * The amendment sections a document already carries.
 *
 * The body is everything between one heading and the next heading, trimmed, so
 * an identical body is recognised without depending on surrounding blank lines.
 */
// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
function parseAmendments(content) {
  const entries = [];
  let current = null;
  for (const line of content.split('\n')) {
    const heading = AMENDMENT_HEADING.exec(line);
    if (heading) {
      if (current) entries.push(current);
      current = { ticketKey: heading[1], sequence: Number(heading[2]), lines: [] };
      continue;
    }
    if (current && SECTION_BOUNDARY.test(line)) {
      entries.push(current);
      current = null;
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) entries.push(current);
  return entries.map((entry) => ({ ...entry, body: entry.lines.join('\n').trim() }));
}

/** The next sequence for a ticket key. */
// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
function nextSequence(entries, ticketKey) {
  const sequences = entries
    .filter((entry) => entry.ticketKey === ticketKey)
    .map((entry) => entry.sequence);
  return sequences.length === 0 ? 1 : Math.max(...sequences) + 1;
}

/** The bytes appended for one amendment. */
// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
function renderAmendment({ content, ticketKey, sequence, title, body }) {
  const heading = '### Amendment ' + ticketKey + '-' + sequence;
  const block = title
    ? heading + '\n\n' + title + '\n\n' + body.trim() + '\n'
    : heading + '\n\n' + body.trim() + '\n';
  if (!content.includes(AMENDMENT_SECTION)) {
    return '\n\n' + AMENDMENT_SECTION + '\n\n' + block;
  }
  return '\n' + block;
}

/**
 * Append one amendment to an existing document.
 *
 * @param {{ filePath: string, ticketKey: string, title?: string, body: string,
 *           sequence?: number|null, op?: string }} input
 * @returns {{ ok: boolean, code?: string, noChange?: boolean, beforeDigest?: string,
 *             afterDigest?: string, appendedBytes?: number }}
 */
// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
function appendAmendment({ filePath, ticketKey, title = '', body, sequence = null, op = 'append' }) {
  if (op !== 'append') return { ok: false, code: AMENDMENT_EDIT_REFUSED };
  if (typeof body !== 'string' || body.trim().length === 0) {
    return { ok: false, code: AMENDMENT_EDIT_REFUSED };
  }
  if (!fs.existsSync(filePath)) return { ok: false, code: APPEND_TARGET_MISSING };

  const beforeBytes = fs.readFileSync(filePath);
  const content = beforeBytes.toString('utf8');
  const entries = parseAmendments(content);
  const renderedBody = title ? title + '\n\n' + body.trim() : body.trim();

  if (entries.some((entry) => entry.ticketKey === ticketKey && entry.body === renderedBody)) {
    return { ok: true, noChange: true, beforeDigest: digestBytes(beforeBytes), afterDigest: digestBytes(beforeBytes) };
  }

  const desired = sequence === null ? nextSequence(entries, ticketKey) : sequence;
  if (entries.some((entry) => entry.ticketKey === ticketKey && entry.sequence === desired)) {
    return { ok: false, code: AMENDMENT_ANCHOR_COLLISION };
  }

  const appended = renderAmendment({ content, ticketKey, sequence: desired, title, body });
  const afterBytes = Buffer.from(content + appended, 'utf8');
  writeAtomically(filePath, afterBytes);

  return {
    ok: true,
    noChange: false,
    beforeDigest: digestBytes(beforeBytes),
    afterDigest: digestBytes(afterBytes),
    appendedBytes: afterBytes.length - beforeBytes.length,
  };
}

/** Whether every byte of the before buffer is the prefix of the after buffer. */
// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
function verifyAppendOnly(beforeBytes, afterBytes) {
  if (afterBytes.length < beforeBytes.length) return false;
  return afterBytes.subarray(0, beforeBytes.length).equals(beforeBytes);
}

module.exports = {
  AMENDMENT_SECTION,
  APPEND_TARGET_MISSING,
  AMENDMENT_EDIT_REFUSED,
  AMENDMENT_ANCHOR_COLLISION,
  appendAmendment,
  parseAmendments,
  verifyAppendOnly,
};
