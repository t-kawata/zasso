#!/usr/bin/env node

/**
 * stub-marker-scan.js — Shared [::STUB::] line detection for the ticket scanners.
 *
 * A [::STUB::] marker is a comment annotation in source code. Text that merely
 * contains the marker tag inside a quoted string literal is a data reference
 * (e.g. a test fixture), not a marker. This module is the single source of that
 * distinction; enumerate-ticket-targets.js and review/find-all-stubs.js import
 * it so both scanners classify a line identically.
 *
 * Usage (import):
 *   const { containsStubMarker, isStubInQuotes } = require('./lib/stub-marker-scan');
 */

const STUB_RE = /\[::STUB::\]/;

// A marker bounded by quotes on the same line is a data reference, not a marker.
const STUB_IN_QUOTES_RE = /['"`][^'"`]*\[::STUB::\][^'"`]*['"`]/;

// Exceptional scan exclusion: `fixtures` is the storage directory for test
// fixture files (test INPUTS), not production code. Both scanners skip it so
// they agree; it is NOT a blanket tests/ exclusion.
const FIXTURE_STORAGE_DIR = 'fixtures';

/**
 * Whether a line contains the [::STUB::] tag at all.
 * @param {string} line — A single line of source text
 * @returns {boolean}
 */
// [::TICKET::] PX-139 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-139 --for-spec --no-implementation-order`.
function containsStubMarker(line) {
  return STUB_RE.test(line);
}

/**
 * Whether the [::STUB::] tag on a line sits inside a quoted string literal.
 * @param {string} line — A single line of source text
 * @returns {boolean}
 */
// [::TICKET::] PX-139 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-139 --for-spec --no-implementation-order`.
function isStubInQuotes(line) {
  return STUB_IN_QUOTES_RE.test(line);
}

module.exports = { containsStubMarker, isStubInQuotes, FIXTURE_STORAGE_DIR };
