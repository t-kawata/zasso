// [::TICKET::] PX-341 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-341 --for-spec --no-implementation-order`.
// PX-341 @verifies C002
//
// The annotation is the widest file-writing surface in the toolchain: every source file a
// ticket touches receives one. The command it embeds is what a later reader runs to
// recover the design context, so it must work from the file's directory and from anywhere
// else in the repository.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { buildAnnotation, buildMultiAnnotation } = require(
  join(PROJECT_ROOT, '.claude/scripts/tickets/annotate-ticket-context-by-git-diff.js'),
);

const ANCHOR = /\$\(git rev-parse --show-toplevel\)\/\.claude\/scripts\/tickets\/show-ticket-context\.js/;

test('C002 invariant: a single annotation carries the git-root anchored command', () => {
  const annotation = buildAnnotation('PX-341', '//');
  assert.match(annotation, ANCHOR);
  assert.doesNotMatch(annotation, /`node \.claude\/scripts/);
  assert.match(annotation, /--ticket-key=PX-341 --for-spec --no-implementation-order/);
});

test('C002 invariant: a merged annotation carries the same anchor', () => {
  const annotation = buildMultiAnnotation(['PX-341', 'PX-342']);
  assert.match(annotation, ANCHOR);
  assert.doesNotMatch(annotation, /`node \.claude\/scripts/);
});

test('C002 invariant: the annotation command runs from a nested directory', () => {
  const repo = mkdtempSync(join(tmpdir(), 'px341-annotation-'));
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: repo });
    const script = join(repo, '.claude', 'scripts', 'tickets', 'show-ticket-context.js');
    mkdirSync(dirname(script), { recursive: true });
    writeFileSync(script, 'process.exit(0);\n', 'utf8');
    const nested = join(repo, 'crates', 'app', 'src');
    mkdirSync(nested, { recursive: true });

    const annotation = buildAnnotation('PX-341', '//');
    const command = annotation.match(/`([^`]+)`/)[1];
    const run = spawnSync('/bin/sh', ['-c', command], { cwd: nested, encoding: 'utf8' });
    assert.strictEqual(run.status, 0, run.stderr);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
