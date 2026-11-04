// PX-359 @verifies C001
// [::TICKET::] PX-359 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-359 --for-spec --no-implementation-order`.
/**
 * The grill's identity gate, exercised as the command runs it.
 *
 * A verification that writes before it agrees would leave a refused run looking
 * successful, so every failing case also asserts that the material list did not move.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildWorkspace, specSha, specBytes, SPEC_PATH } from './helpers/workspace.mjs';

const VERIFY = fileURLToPath(new URL('../../.claude/scripts/grill-me-for-rfc/verify-source-identity.js', import.meta.url));

// [::TICKET::] PX-359, PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-359|PX-360|PX-361) --for-spec --no-implementation-order`.
// [::TICKET::] PX-365 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-365 --for-spec --no-implementation-order`.
function runVerify(workspace, extraArgs = []) {
  return spawnSync(process.execPath, [VERIFY, workspace.packageDirectory, `--workspace=${workspace.root}`, ...extraArgs], {
    encoding: 'utf8',
  });
}

// [::TICKET::] PX-359, PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-359|PX-360|PX-361) --for-spec --no-implementation-order`.
function statusOf(workspace) {
  return JSON.parse(readFileSync(join(workspace.packageDirectory, 'Status.json'), 'utf8'));
}

test('C001 precondition: agreeing seed, INFO and sequences records pass and record the specification', () => {
  const workspace = buildWorkspace();
  const result = runVerify(workspace);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, true);
  assert.equal(output.specSha256, specSha());
  assert.equal(output.lines, 6);
  assert.equal(statusOf(workspace).materialPaths.some((path) => path.endsWith(SPEC_PATH)), true);
});

test('C001 error invariant: an INFO hash mismatch is an advisory and --no-record leaves Status.json byte-identical', () => {
  const workspace = buildWorkspace({ infoSha: '0'.repeat(64) });
  const before = statusOf(workspace);
  const result = runVerify(workspace, ['--no-record']);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, true);
  assert.equal(output.advisories.some((finding) => finding.code === 'STALE_SECONDARY_RECORD' && finding.detail === 'INFO_HASH_MISMATCH'), true);
  assert.deepEqual(statusOf(workspace), before);
  assert.equal(output.materialRecorded, false);
});

test('C001 error invariant: bytes that no recorded hash reproduces stop the run', () => {
  const workspace = buildWorkspace();
  writeFileSync(join(workspace.root, SPEC_PATH), `${specBytes().toString('utf8')}changed\n`, 'utf8');
  const before = statusOf(workspace);
  const result = runVerify(workspace);

  assert.equal(result.status, 1);
  const output = JSON.parse(result.stdout);
  assert.equal(output.findings.some((finding) => finding.code === 'SPEC_HASH_MISMATCH'), true);
  assert.deepEqual(statusOf(workspace), before);
});

test('C001 error invariant: a seed that records no identity is refused by name', () => {
  const workspace = buildWorkspace();
  writeFileSync(join(workspace.packageDirectory, 'RFC-SEED.md'), '# RFC Seed\n\nNo block.\n', 'utf8');
  const result = runVerify(workspace);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /RFC-SEED\.md|SEED_IDENTITY_MISSING/);
});

test('C001 boundary: a sequences hash mismatch is an advisory when the seed proves the specification', () => {
  const workspace = buildWorkspace({ sequencesSha: '1'.repeat(64) });
  const result = runVerify(workspace, ['--no-record']);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, true);
  assert.equal(output.advisories.some((finding) => finding.code === 'STALE_SECONDARY_RECORD' && finding.detail === 'SEQUENCES_HASH_MISMATCH'), true);
});
