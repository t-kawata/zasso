// [::TICKET::] PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-427 --for-spec --no-implementation-order`.
// [::TICKET::] PX-428 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-428 --for-spec --no-implementation-order`.
// @verifies C001 C002
// C001 precondition: A package heading path H with a byte span
// C001 postcondition: Exactly one concept or one declared non-normative entry names H
// C002 precondition: A rule table row with id R
// C002 postcondition: R resolves to one canonical concept; a legacy R is recorded in x-alias-rule-ids of its canonical concept
/**
 * The expert package parser reads every heading and every rule table row.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseExpertPackage } from '../../../.claude/skills/rust-interface-law/scripts/lib/expert-package.mjs';

const PACKAGE = join(process.cwd(), 'docs/archive/IMPLEMENTATION-SPEC/EXPERT-REVIEW-PACKAGE.md');
const TEXT = readFileSync(PACKAGE, 'utf8');

test('C001: the package has 324 H2/H3 headings and 24 parts', () => {
  const tree = parseExpertPackage(TEXT);
  assert.equal(tree.headings.length, 324);
  assert.equal(tree.parts.length, 24);
  assert.equal(tree.headings.filter((entry) => entry.level === 2).length, 232);
  assert.equal(tree.headings.filter((entry) => entry.level === 3).length, 92);
});

test('C001: every heading has a stable path and a byte span', () => {
  const tree = parseExpertPackage(TEXT);
  for (const heading of tree.headings) {
    assert.match(heading.path, /^(front|part-)/);
    assert.ok(heading.start >= 0 && heading.end > heading.start, heading.path);
    assert.ok(heading.title.length > 0, heading.path);
  }
  assert.equal(new Set(tree.headings.map((entry) => entry.path)).size, tree.headings.length);
});

test('C002: every rule table row is extracted once', () => {
  const tree = parseExpertPackage(TEXT);
  assert.equal(tree.ruleRows.length, 457);
  assert.equal(new Set(tree.ruleRows.map((row) => row.id)).size, 457);
});

test('C002: 2-column, 3-column, and 5-column tables are all understood', () => {
  const tree = parseExpertPackage(TEXT);
  const free = tree.ruleRows.find((row) => row.id === 'FREE-01');
  const arc = tree.ruleRows.find((row) => row.id === 'ARC-01');
  const idem = tree.ruleRows.find((row) => row.id === 'OP-IDEM-01');
  assert.match(free.statement, /MUST NOT enumerate/);
  assert.equal(free.fixed, null);
  assert.match(arc.statement, /primary runtime role/);
  assert.equal(idem.fixed, 'Namespace.');
  assert.equal(idem.open, '—');
  assert.equal(idem.verification, 'V3 test.');
});

test('C002: code fences and non-rule tables are not read as rules', () => {
  const tree = parseExpertPackage(TEXT);
  assert.equal(tree.ruleRows.some((row) => row.id === 'ID'), false);
  assert.equal(tree.ruleRows.some((row) => row.id.startsWith('PART')), false);
});

test('Part I carries review guidance headings, not rule rows', () => {
  const tree = parseExpertPackage(TEXT);
  const partOne = tree.headings.filter((entry) => entry.part === 'part-i');
  assert.equal(partOne.filter((entry) => entry.level === 2).length, 12);
  assert.equal(partOne.filter((entry) => entry.level === 3).length, 15);
});
