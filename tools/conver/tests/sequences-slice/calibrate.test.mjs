// PX-255 @verifies C001
// PX-255 @verifies C003
// PX-255 @verifies C004
// PX-255 @verifies C005
// The CLI is the one command that reproduces the measurement. These are the end-to-end
// assertions: a synthetic workspace root on disk, the calibration run over it, and the
// buckets read back from its output. PX-257 calibration-checks against these same counts,
// so a drift between the two tickets fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  RECORDED_OPERATION_BUCKETS,
  RECORDED_SEQUENCE_BUCKETS,
  buildSyntheticTriple,
  liveShapedObjects,
  removeSyntheticTriple,
} from './fixtures/synthetic-workspace.mjs';

const CALIBRATE = fileURLToPath(new URL('../../.claude/scripts/sequences-slice/calibrate.mjs', import.meta.url));
const ARTIFACT_FILENAME = 'SyntheticSpec-sequences.json';

// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
function runCalibrate(root, extraArguments = []) {
  return spawnSync(process.execPath, [CALIBRATE, join(root, ARTIFACT_FILENAME), ...extraArguments], { encoding: 'utf8' });
}

// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
function runOnFreshRoot(options = {}) {
  const root = buildSyntheticTriple(options);
  try {
    return { root, result: runCalibrate(root, ['--json']) };
  } finally {
    removeSyntheticTriple(root);
  }
}

// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C003 the calibration over a synthetic workspace root reproduces the measured buckets', () => {
  const { result } = runOnFreshRoot();
  assert.equal(result.status, 0);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.operations, RECORDED_OPERATION_BUCKETS);
  assert.equal(report.operations.total, 257);
  assert.equal(report.sequences.onePackage, RECORDED_SEQUENCE_BUCKETS.onePackage);
  assert.equal(report.sequences.severalPackages, 38);
  assert.equal(report.sequences.noKnownPackage, 5);
  assert.equal(report.sequences.total, 116);
});

// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C004 the calibration reports the line-range totality and says the key is not an identity', () => {
  const { result } = runOnFreshRoot();
  const report = JSON.parse(result.stdout);
  assert.equal(report.lineRange.claimedLineCount, 15969);
  assert.equal(report.lineRange.multiClaimedLineCount, 14307);
  assert.equal(report.lineRange.unclaimedLineCount, 2);
  assert.equal(report.lineRange.packagesWithNoSegments.length, 10);
  assert.match(report.lineRange.statement, /not used as an identity/);
});

// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C005 the calibration leaves no unmatched class name undisposed', () => {
  const { result } = runOnFreshRoot();
  const report = JSON.parse(result.stdout);
  assert.equal(report.classNames.unmatched.length, 10);
  assert.deepEqual(report.classNames.dispositions.unaccounted, []);
  assert.equal(report.classNames.dispositions.declaredResiduals.length, 10);
  const manifestNames = new Set(liveShapedObjects().map((object) => object.canonical_name));
  assert.ok(report.classNames.unmatched.every((name) => !manifestNames.has(name)));
  assert.ok(report.classNames.unmatched.every((name) => report.classNames.dispositions.declaredResiduals.includes(name)));
});

// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C001 the calibration reports a baseline and one digest per input', () => {
  const { result } = runOnFreshRoot();
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.baseline, {
    emptyResultClasses: 47,
    exactlyOnePackage: 187,
    severalPackages: 20,
    noKnownPackage: 3,
    sequencesOnePackage: 73,
    sequencesSeveralPackages: 38,
    sequencesNoKnownPackage: 5,
    packagesReached: 13,
    unmatchedClassNames: 10,
    declaredResidualClassNames: 10,
  });
  assert.equal(report.baselineMatches, true);
  assert.match(report.snapshotDigest.artifact, /^[0-9a-f]{64}$/);
  assert.match(report.snapshotDigest.treeManifest, /^[0-9a-f]{64}$/);
  assert.match(report.snapshotDigest.allocateManifest, /^[0-9a-f]{64}$/);
});

// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C001 the calibration is deterministic and writes nothing', () => {
  const root = buildSyntheticTriple();
  try {
    const before = readdirSync(root).sort();
    const first = runCalibrate(root, ['--json']);
    const second = runCalibrate(root, ['--json']);
    assert.equal(first.status, 0);
    assert.equal(first.stdout, second.stdout);
    assert.deepEqual(readdirSync(root).sort(), before);
  } finally {
    removeSyntheticTriple(root);
  }
});

// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C001 an absent tree manifest stops the run with exit 2, the path named, and no partial report', () => {
  const { result } = runOnFreshRoot({ omitTreeManifest: true });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /WORKSPACIFY-TREE-MANIFEST\.json/);
  assert.equal(result.stdout, '');
});

// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C001 an absent allocate manifest stops the run with exit 2 and the path named', () => {
  const { result } = runOnFreshRoot({ omitAllocateManifest: true });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /WORKSPACIFY-ALLOCATE-MANIFEST\.json/);
  assert.equal(result.stdout, '');
});

// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C001 a path that does not exist stops the run with exit 2 and the path named', () => {
  const result = spawnSync(process.execPath, [CALIBRATE, '/nonexistent/artifact.json', '--json'], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /\/nonexistent\/artifact\.json/);
  assert.equal(result.stdout, '');
});

// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C001 an artifact that does not parse stops the run with exit 2 and the path named', () => {
  // The precondition names this case beside the absent path, so a rejection raised by
  // the reader is an input error and not a crash: the operator gets the same refusal
  // shape, and no partial report is printed to stdout.
  const root = buildSyntheticTriple();
  try {
    writeFileSync(join(root, ARTIFACT_FILENAME), '{ not json');
    const result = runCalibrate(root, ['--json']);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /SyntheticSpec-sequences\.json/);
    assert.equal(result.stdout, '');
  } finally {
    removeSyntheticTriple(root);
  }
});

// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C001 an artifact whose operations is not an array stops the run with exit 2 and the path named', () => {
  const root = buildSyntheticTriple();
  try {
    const artifact = JSON.parse(readFileSync(join(root, ARTIFACT_FILENAME), 'utf8'));
    writeFileSync(join(root, ARTIFACT_FILENAME), JSON.stringify({ ...artifact, operations: 'not a list' }));
    const result = runCalibrate(root, ['--json']);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /SyntheticSpec-sequences\.json/);
    assert.equal(result.stdout, '');
  } finally {
    removeSyntheticTriple(root);
  }
});

// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C004 the default output is prose that states the measurement, not only a machine record', () => {
  const root = buildSyntheticTriple();
  let result;
  try {
    result = runCalibrate(root);
  } finally {
    removeSyntheticTriple(root);
  }
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trimStart().startsWith('{'), false);
  assert.match(result.stdout, /15969/);
  assert.match(result.stdout, /14307/);
  assert.match(result.stdout, /not used as an identity/);
});
