// [::TICKET::] PX-341 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-341 --for-spec --no-implementation-order`.
// PX-341 @verifies C003
//
// The "no omission" gate for the anchor rule. A hand-written inventory of the writers
// that embed a .claude path cannot be shown complete by reading, so the inventory is
// decided by a scan over the tree that exists, and this scan is what fails when a new
// bare reference appears. The scan itself lives in tests/lib so its findings can be
// produced and reviewed without registering test cases.
//
// A scan that inspected nothing looks exactly like a clean tree, so a zero inspected
// count is reported as a defect. And a scan that reported everything would be as useless
// as one that reported nothing, so a planted bare line must be reported while the anchored
// form must pass.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FILE_ALLOWLIST,
  scanCommandDocument,
  scanCommandLine,
  scanSourceLine,
  scanTree,
} from '../lib/claude-root-anchoring.mjs';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF = fileURLToPath(import.meta.url);

test('C003 invariant: every active .claude script reference is anchored at the git root', () => {
  const report = scanTree({ projectRoot: PROJECT_ROOT, selfPath: SELF });
  assert.ok(report.inspected > 0, 'a zero inspected count is a defect of the scan, not a clean tree');
  assert.deepEqual(report.findings, [], `unanchored .claude references:\n${report.findings.join('\n')}`);
});

test('C003 invariant: the scan reports a planted bare line and accepts the anchored form', () => {
  assert.deepEqual(
    scanSourceLine("const command = 'node .claude/scripts/tickets/update-ticket.js';", { file: 'planted.js' }),
    ['bare-command'],
  );
  assert.deepEqual(
    scanSourceLine("const command = 'node \"$(git rev-parse --show-toplevel)/.claude/scripts/tickets/update-ticket.js\"';", {
      file: 'planted.js',
    }),
    [],
  );
  assert.deepEqual(
    scanSourceLine("const script = path.join(process.cwd(), '.claude', 'scripts', 'x.js');", { file: 'planted.js' }),
    ['cwd-claude'],
  );
  assert.deepEqual(scanCommandLine('node .claude/scripts/tickets/update-ticket.js'), ['unanchored-command']);
  assert.deepEqual(
    scanCommandLine('(cd "$(git rev-parse --show-toplevel)" && node .claude/scripts/tickets/update-ticket.js)'),
    [],
  );
});

test('C003 invariant: each command document resolves the git root once, before the first use', () => {
  const repeated = [
    '\u0060\u0060\u0060bash',
    'node "$(git rev-parse --show-toplevel)/.claude/scripts/a.js"',
    'node "$(git rev-parse --show-toplevel)/.claude/scripts/b.js"',
    '\u0060\u0060\u0060',
  ].join('\n');
  assert.deepEqual(scanCommandDocument(repeated), ['repeated-git-root(2)']);

  const optimized = [
    '## Path Anchor',
    '\u0060\u0060\u0060bash',
    "printf '%s/.claude\\n' \"\$(git rev-parse --show-toplevel)\"",
    '\u0060\u0060\u0060',
    '\u0060\u0060\u0060bash',
    'node "$CLAUDE_DIR/scripts/a.js"',
    'node "$CLAUDE_DIR/scripts/b.js"',
    '\u0060\u0060\u0060',
  ].join('\n');
  assert.deepEqual(scanCommandDocument(optimized), []);

  const missing = [
    '\u0060\u0060\u0060bash',
    'node "$CLAUDE_DIR/scripts/a.js"',
    '\u0060\u0060\u0060',
  ].join('\n');
  assert.deepEqual(scanCommandDocument(missing), ['missing-preflight']);

  const afterUse = [
    '\u0060\u0060\u0060bash',
    'node "$CLAUDE_DIR/scripts/a.js"',
    '\u0060\u0060\u0060',
    '\u0060\u0060\u0060bash',
    'git rev-parse --show-toplevel',
    '\u0060\u0060\u0060',
  ].join('\n');
  assert.deepEqual(scanCommandDocument(afterUse), ['preflight-after-use']);

  const inlineBare = 'Run `node .claude/scripts/explain-seed/run.mjs info "$ARGUMENTS"`';
  assert.deepEqual(scanCommandDocument(inlineBare), ['bare-claude-command']);

  const directBare = ['```bash', '.claude/scripts/tickets/scan-crimes.sh', '```'].join('\n');
  assert.deepEqual(scanCommandDocument(directBare), ['bare-claude-command']);

  const inlineAnchored = [
    '```bash',
    "printf '%s/.claude\\n' \"\$(git rev-parse --show-toplevel)\"",
    '```',
    'Run `node "$CLAUDE_DIR/scripts/explain-seed/run.mjs" info "$ARGUMENTS"`',
  ].join('\n');
  assert.deepEqual(scanCommandDocument(inlineAnchored), []);
});

test('C003 invariant: every allowlist entry states why it is exempt', () => {
  for (const entry of FILE_ALLOWLIST) {
    assert.ok(entry.reason.length > 20, `allowlist entry ${entry.prefix} needs a reason`);
  }
});
