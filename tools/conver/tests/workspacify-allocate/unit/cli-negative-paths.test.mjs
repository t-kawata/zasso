// [::TICKET::] PX-191 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-191 --for-spec --no-implementation-order`.
// PX-191 @verifies C001 C002 C003
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { materializeSeedFixture, makeDecisions } from '../helpers/build-valid-manifest.mjs';

const RUN = fileURLToPath(new URL('../../../.claude/scripts/workspacify-allocate/run.mjs', import.meta.url));

function runCli(args, options = {}) {
  return spawnSync(process.execPath, [RUN, ...args], { encoding: 'utf8', ...options });
}

test('C001 unknown subcommand and missing arguments exit non-zero with a guide', () => {
  assert.notEqual(runCli(['bogus']).status, 0);
  assert.ok(runCli(['bogus']).stderr.includes('guide'));
  assert.notEqual(runCli(['validate']).status, 0);
  assert.notEqual(runCli(['finalize']).status, 0);
  assert.notEqual(runCli(['gate', 'some.json']).status, 0);
});

test('C001 validate rejects a missing manifest file with a non-zero exit', () => {
  const result = runCli(['validate', join('/tmp', 'does-not-exist-alloc.json')]);
  assert.notEqual(result.status, 0);
  assert.ok(result.stderr.includes('guide'));
});

test('C001 validate rejects an unreadable / non-JSON manifest', () => {
  const dir = materializeSeedFixture().dir;
  try {
    const emptyPath = join(dir, 'empty.json');
    writeFileSync(emptyPath, '');
    assert.notEqual(runCli(['validate', emptyPath]).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C001 packet rejects an unknown --package target', () => {
  const { dir, manifestPath } = materializeSeedFixture();
  try {
    const result = runCli(['packet', manifestPath, '--package=ghost']);
    assert.notEqual(result.status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C003 gate BLOCKs when semantic_review is not APPROVED', () => {
  const { dir, manifestPath, manifest } = materializeSeedFixture();
  try {
    const decisionsPath = join(dir, 'decisions-review.json');
    writeFileSync(decisionsPath, JSON.stringify(makeDecisions(manifest, { approved: false })));
    const result = runCli(['gate', manifestPath, `--decisions=${decisionsPath}`]);
    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes('semantic_review'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C002 finalize BLOCKs on an existing non-empty planned directory and preserves it', () => {
  const { dir, manifestPath, manifest } = materializeSeedFixture();
  try {
    // Pre-create a non-empty planned leaf directory.
    mkdirSync(join(dir, 'crates', 'protocol', 'alpha'), { recursive: true });
    writeFileSync(join(dir, 'crates', 'protocol', 'alpha', 'sentinel.txt'), 'keep');
    const decisionsPath = join(dir, 'decisions.json');
    writeFileSync(decisionsPath, JSON.stringify(makeDecisions(manifest)));
    const result = runCli(['finalize', manifestPath, `--decisions=${decisionsPath}`]);
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(join(dir, 'crates', 'protocol', 'alpha', 'sentinel.txt'), 'utf8'), 'keep');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C002 finalize schema-invalid decisions exits non-zero', () => {
  const { dir, manifestPath } = materializeSeedFixture();
  try {
    const decisionsPath = join(dir, 'bad-decisions.json');
    writeFileSync(decisionsPath, JSON.stringify({ seeds: [] })); // missing semantic_review
    const result = runCli(['finalize', manifestPath, `--decisions=${decisionsPath}`]);
    assert.notEqual(result.status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
