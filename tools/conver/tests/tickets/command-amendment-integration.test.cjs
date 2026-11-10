'use strict';

/**
 * PX-400 — command wiring and installed-copy parity.
 *
 * The Design Amendment Rule is additive: existing Steps keep their numbers,
 * arguments and roles. The transaction is installed in all three copies.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const CONVER = path.resolve(__dirname, '../..');
const REPO = path.resolve(__dirname, '../../../..');
const COMMANDS = path.join(CONVER, '.claude/commands');

// [::TICKET::] PX-400, PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-400|PX-405) --for-spec --no-implementation-order`.
function readCommand(name) {
  return fs.readFileSync(path.join(COMMANDS, name + '.md'), 'utf8');
}

// [::TICKET::] PX-400, PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-400|PX-405) --for-spec --no-implementation-order`.
function gitHeadCommand(name) {
  return execFileSync('git', ['show', 'HEAD:tools/conver/.claude/commands/' + name + '.md'], {
    cwd: REPO,
    encoding: 'utf8',
  });
}

// [::TICKET::] PX-400, PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-400|PX-405) --for-spec --no-implementation-order`.
function stepHeadings(text) {
  return text.split('\n').filter((line) => /^### Step /.test(line));
}

test('C011: start, review and resolve carry the Design Amendment Rule', () => {
  for (const name of ['start-ticket', 'review-ticket', 'resolve-ticket']) {
    const text = readCommand(name);
    assert.ok(text.includes('Design Amendment Rule'), name + ' lacks the rule heading');
    assert.ok(text.includes('design-amendment.js'), name + ' lacks the transaction entry');
    assert.ok(text.includes('verify-amendment.js'), name + ' lacks the verifier');
  }
});

test('C011: existing Step headings are unchanged and no Step is renumbered', () => {
  for (const name of ['start-ticket', 'review-ticket', 'resolve-ticket']) {
    const before = stepHeadings(gitHeadCommand(name));
    const after = stepHeadings(readCommand(name));
    assert.deepEqual(after, before, name + ' changed its Step headings');
  }
});

test('C011: the added rule is telegraphic', () => {
  for (const name of ['start-ticket', 'review-ticket', 'resolve-ticket']) {
    const text = readCommand(name);
    const block = text.slice(text.indexOf('**Design Amendment Rule'));
    const ruleLines = block.split('\n').slice(0, 14);
    assert.ok(ruleLines.every((line) => line.length <= 200), name + ' has an overlong rule line');
  }
});

test('C011: owner and detector commands name the amendment route', () => {
  const commands = [
    'grill-me-for-rfc', 'graphify-rfc', 'boundify-graph', 'split-to-tickets',
    'workspacify-tree', 'workspacify-allocate', 'workspacify-reverse',
    'condense-tickets', 'condense-workspace', 'find-omissions', 'drill-rfc-down',
    'educe-sequences', 'smooth-sequences', 'explain-seed', 'consolidate-stubs',
    'make-ticket', 'plan-ticket',
  ];
  for (const name of commands) {
    assert.ok(readCommand(name).includes('design-amendment'), name + ' lacks the amendment route');
  }
});

test('C007: the installed copies are byte-identical to the conver source', () => {
  const files = [
    '.claude/scripts/tickets/design-amendment.js',
    '.claude/scripts/tickets/verify-amendment.js',
    '.claude/scripts/tickets/append-design-amendment.js',
    '.claude/scripts/tickets/rebuild-design-hashes.js',
    '.claude/scripts/tickets/amendment-gate-manifest.js',
    '.claude/scripts/tickets/lib/design-amendment-state.js',
    '.claude/scripts/tickets/lib/design-hash-report.mjs',
    '.claude/commands/start-ticket.md',
    '.claude/commands/review-ticket.md',
    '.claude/commands/resolve-ticket.md',
  ];
  const copies = [REPO, path.join(REPO, 'crates/siprs')];
  for (const copy of copies) {
    for (const file of files) {
      const source = path.join(CONVER, file);
      const target = path.join(copy, file);
      if (!fs.existsSync(target)) continue;
      assert.ok(fs.readFileSync(source).equals(fs.readFileSync(target)), target + ' differs from the source');
    }
  }
});
