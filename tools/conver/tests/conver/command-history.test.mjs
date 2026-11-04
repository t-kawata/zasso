// PX-366 @verifies C007
// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-366 --for-spec --no-implementation-order`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/** Commands whose history is hidden inside their mandatory main script. */
const HIDDEN = Object.freeze({
  'workspacify-reverse': ['.claude/scripts/workspacify-reverse/run.mjs'],
  'workspacify-tree': ['.claude/scripts/workspacify-tree/run.mjs'],
  'workspacify-allocate': ['.claude/scripts/workspacify-allocate/run.mjs'],
  'educe-sequences': ['.claude/scripts/educe-sequences/rail/run.mjs'],
  'explain-seed': ['.claude/scripts/explain-seed/run.mjs'],
  'smooth-sequences': ['.claude/scripts/smooth-sequences/run.mjs'],
  'grill-me-for-rfc': [
    '.claude/scripts/grill-me-for-rfc/update-status.js',
    '.claude/scripts/grill-me-for-rfc/complete-run.js',
  ],
  'graphify-rfc': ['.claude/scripts/rfc-graph/update-step-status.js'],
  'boundify-graph': ['.claude/scripts/rfc-graph/update-boundify-step-status.js'],
  'split-to-tickets': ['.claude/scripts/rfc-graph/update-split-step-status.js'],
  'make-ticket': [
    '.claude/scripts/tickets/insert-field-template.js',
    '.claude/scripts/tickets/update-ticket.js',
  ],
  'plan-ticket': [
    '.claude/scripts/tickets/check-ticket-status.js',
    '.claude/scripts/tickets/update-ticket.js',
  ],
  'start-ticket': [
    '.claude/scripts/tickets/check-ticket-status.js',
    '.claude/scripts/tickets/update-ticket.js',
  ],
  'review-ticket': [
    '.claude/scripts/tickets/check-ticket-status.js',
    '.claude/scripts/tickets/update-ticket.js',
  ],
  'consolidate-stubs': ['.claude/scripts/tickets/batch-update-stub.js'],
  'find-omissions': [
    '.claude/scripts/tickets/validate-graph-arg.js',
    '.claude/scripts/tickets/require-consolidated-manifest.js',
    '.claude/scripts/tickets/clean-consolidation-artifacts.js',
  ],
  'crystalize-readme': [
    '.claude/scripts/crystalize-readme/derive-output-paths.js',
    '.claude/scripts/crystalize-readme/loop-drive-readme.js',
  ],
  'drill-rfc-down': [
    '.claude/scripts/drill-rfc-down/preflight.cjs',
    '.claude/scripts/drill-rfc-down/verify-step.js',
  ],
});

/**
 * The one command whose run cannot be bracketed by a script it already executes:
 * no script unique to it runs on both entry and exit.
 */
const EXPLICIT = Object.freeze({ 'resolve-ticket': 'resolve' });

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-366 --for-spec --no-implementation-order`.
function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

test('C007: a hidden command carries no history instruction and a mandatory script records the run', () => {
  for (const [command, scripts] of Object.entries(HIDDEN)) {
    const commandText = read(`.claude/commands/${command}.md`);

    assert.doesNotMatch(commandText, /run-history\.js/, `${command} must not carry a history instruction`);
    for (const script of scripts) {
      assert.match(read(script), /recordRunHistory|withRunHistory/, `${script} must record the run`);
    }
  }
});

test('C007: the one explicit command has one start and at least one finish', () => {
  for (const [command, stage] of Object.entries(EXPLICIT)) {
    const text = read(`.claude/commands/${command}.md`);

    assert.equal((text.match(/run-history\.js" start/g) || []).length, 1);
    assert.ok((text.match(/run-history\.js" finish/g) || []).length >= 1);
    assert.match(text, new RegExp(`--command=${command}`));
    assert.match(text, new RegExp(`--stage=${stage}`));
    assert.match(text, /--status=BLOCKED_PREREQUISITE/);
  }
});

test('C007: every five-layer command is classified exactly once', () => {
  const commands = [...Object.keys(HIDDEN), ...Object.keys(EXPLICIT)].sort();

  assert.deepEqual(commands, [
    'boundify-graph', 'consolidate-stubs', 'crystalize-readme', 'drill-rfc-down',
    'educe-sequences', 'explain-seed', 'find-omissions', 'graphify-rfc',
    'grill-me-for-rfc', 'make-ticket', 'plan-ticket', 'resolve-ticket',
    'review-ticket', 'smooth-sequences', 'split-to-tickets', 'start-ticket',
    'workspacify-allocate', 'workspacify-reverse', 'workspacify-tree',
  ]);
});
