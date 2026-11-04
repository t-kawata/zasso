// PX-367 @verifies C001
// The integration point is the STEP 8 gate list and Status.json.state: a workspace whose
// K1 denominator is unstated cannot reach DONE, and the same workspace reaches DONE once
// the census the rail supplies is present. Both halves run through the real gate scripts,
// so a gate that is renamed or reordered breaks this test rather than passing quietly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { REQUIRED_GATE_NAMES } from '../../.claude/scripts/grill-me-for-rfc/complete-run.js';
import {
  artifactWithoutCensus,
  cleanArtifact,
  materializeCompletionWorkspace,
  rfcBodiesWithoutDistributionMap,
} from './helpers/completion-workspace.mjs';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const COMPLETE_RUN = join(PROJECT_ROOT, '.claude/scripts/grill-me-for-rfc/complete-run.js');
const ARTIFACT_FILENAME = 'example-sequences.json';

// [::TICKET::] PX-367 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-367 --for-spec --no-implementation-order`.
function runCompletion(rfcDir) {
  return spawnSync(process.execPath, [COMPLETE_RUN, rfcDir], { encoding: 'utf8' });
}

// [::TICKET::] PX-367 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-367 --for-spec --no-implementation-order`.
function readReport(result) {
  return JSON.parse(result.stdout.trim().split('\n').at(-1));
}

test('PX-367 IT: an unstated census blocks DONE until the rail supplies it', () => {
  const workspace = materializeCompletionWorkspace({
    artifact: artifactWithoutCensus(),
    rfcBodies: rfcBodiesWithoutDistributionMap(),
  });
  try {
    const statusBefore = readFileSync(workspace.statusPath, 'utf8');

    const refused = runCompletion(workspace.rfcDir);

    assert.notEqual(refused.status, 0);
    const refusal = readReport(refused);
    assert.equal(refusal.code, 'GATE_FAILED');
    assert.equal(refusal.gate, 'check-obligation-coverage.js');
    assert.equal(readFileSync(workspace.statusPath, 'utf8'), statusBefore);

    // The repair route is the rail: the supplied census is pinned in the artifact, and the
    // package is not grilled again with a hand-written view.
    writeFileSync(join(workspace.root, ARTIFACT_FILENAME), JSON.stringify(cleanArtifact(), null, 2));

    const completed = runCompletion(workspace.rfcDir);

    assert.equal(completed.status, 0, completed.stderr);
    const report = readReport(completed);
    assert.equal(report.ok, true);
    assert.deepEqual(report.gates.map((gate) => gate.name), REQUIRED_GATE_NAMES);
    assert.ok(report.gates.every((gate) => gate.exitCode === 0));
    assert.equal(JSON.parse(readFileSync(workspace.statusPath, 'utf8')).state, 'DONE');
  } finally {
    workspace.remove();
  }
});
