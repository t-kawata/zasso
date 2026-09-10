// @verifies C003
// @verifies C004
// @verifies C005
// [::TICKET::] PX-203 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-203 --for-spec --no-implementation-order`.
// The detect -> scrub -> verify pipeline end to end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  createScratchProject,
  hashTree,
} from '../helpers/scratch.mjs';

const RUNNER = fileURLToPath(
  new URL('../../../.claude/scripts/workspacify-reverse/run.mjs', import.meta.url),
);

/** Run the CLI and capture its exit code and stdout. */
function runCli(args) {
  const result = spawnSync(process.execPath, [RUNNER, ...args], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

// IT-1 — the full path must converge to zero residue
test('detect, scrub and verify converge to zero residue', () => {
  const scratch = createScratchProject();
  try {
    const detected = runCli(['detect', scratch.root]);
    assert.equal(detected.status, 0);
    assert.match(detected.stdout, /## Forward-rotation traces/);

    const scrubbed = runCli(['scrub', scratch.root, '--apply', '--rename-ticket-keyed-files']);
    assert.equal(scrubbed.status, 0);
    assert.match(scrubbed.stdout, /## Scrub result/);

    const verified = runCli(['verify', scratch.root]);
    assert.equal(verified.status, 0, verified.stdout);
    assert.match(verified.stdout, /PASS/);
  } finally {
    scratch.dispose();
  }
});

// IT-1 (failure path) — an untouched tree must fail verification
test('verification fails on a tree that has not been scrubbed', () => {
  const scratch = createScratchProject();
  try {
    const verified = runCli(['verify', scratch.root]);
    assert.equal(verified.status, 1);
    assert.match(verified.stdout, /FAIL/);
    assert.match(verified.stdout, /:\d+/);
  } finally {
    scratch.dispose();
  }
});

// IT-1 (planning path) — without --apply nothing is written
test('scrub without --apply writes nothing', () => {
  const scratch = createScratchProject();
  try {
    const before = hashTree(scratch.root);
    const planned = runCli(['scrub', scratch.root]);
    assert.equal(planned.status, 0);
    assert.match(planned.stdout, /no changes written/);
    assert.deepEqual(hashTree(scratch.root), before);
  } finally {
    scratch.dispose();
  }
});

// IT-4 — a bystander tree is never touched
test('scrubbing one tree leaves another byte-identical', () => {
  const target = createScratchProject();
  const bystander = createScratchProject();
  try {
    const before = hashTree(bystander.root);
    runCli(['scrub', target.root, '--apply']);
    assert.deepEqual(hashTree(bystander.root), before);
  } finally {
    target.dispose();
    bystander.dispose();
  }
});

// CLI contract
test('an unknown subcommand exits 2 with usage', () => {
  const result = runCli(['bogus', '/tmp']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Usage:/);
});
