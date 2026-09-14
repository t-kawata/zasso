// @verifies C001
// @verifies C002
/**
 * Staleness propagation — the evolution loop's only instrument.
 *
 * Two axes run through this file and are deliberately kept apart. `COMPLETE` is
 * a value the forward rotation already reads; staleness is a reverse-rotation
 * concept saying the canonical record needs re-examination. Merging them would
 * allow a reverse-only signal to change forward behaviour, so the independence is
 * asserted by reading the completion state before and after rather than by a
 * comment promising that the two must not be merged.
 *
 * The second discipline is that a comparison the run could not make is never
 * reported as freshness. An input that cannot be hashed, and a claim whose
 * recorded hash is not a hash, are both *reported*: silence there would allow
 * a claim to drift out of date while reading as current, which is exactly the
 * failure (F13) this instrument exists to prevent.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hashTree } from '../helpers/scratch.mjs';
import {
  CLAIM_LEDGER_FILE_NAME,
  FINDING_KINDS,
  STALENESS_INDEX_FILE_NAME,
  emitReexaminationConditions,
  hashInput,
  isHashShaped,
  loadClaimLedger,
  markClaimStale,
  propagateStaleness,
  recordedHashesOf,
} from '../../../.claude/scripts/workspacify-reverse/lib/staleness.mjs';
import {
  compareDigests,
  digestCommandFiles,
} from '../../../.claude/scripts/workspacify-reverse/lib/command-file-digest.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const REVERSE_SCRIPT_DIR = fileURLToPath(new URL('../../../.claude/scripts/workspacify-reverse/', import.meta.url));
const BASELINE_PATH = fileURLToPath(new URL('../../../tests/workspacify-tree/baselines/manifest-hashes.json', import.meta.url));

const GRAPH_FILE = 'subject-GRAPH.json';
const DIRS_TREE_FILE = 'subject-Dirs-Tree.json';

/**
 * A subject tree and the sidecar directory that describes it.
 *
 * They are separate on purpose: the tree is the thing being measured and must
 * come out of a run byte-identical, while the sidecars are the reverse
 * rotation's own writing. Keeping them apart in the fixture is what makes that
 * difference observable.
 */
// [::TICKET::] P22-21 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-21 --for-spec --no-implementation-order`.
function scratch() {
  const root = mkdtempSync(join(tmpdir(), 'wsp-staleness-'));
  const subjectRoot = join(root, 'subject');
  const sidecarRoot = join(root, 'sidecars');
  mkdirSync(subjectRoot);
  mkdirSync(sidecarRoot);
  return {
    subjectRoot,
    sidecarRoot,
    graphPath: join(subjectRoot, GRAPH_FILE),
    dirsTreePath: join(subjectRoot, DIRS_TREE_FILE),
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

/** Write a claim ledger where the propagation will read it. */
// [::TICKET::] P22-21 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-21 --for-spec --no-implementation-order`.
function writeLedger(sidecarRoot, ledger) {
  writeFileSync(join(sidecarRoot, CLAIM_LEDGER_FILE_NAME), `${JSON.stringify(ledger, null, 2)}\n`);
}

/** A claim carrying recorded reference hashes, in the shape ABOUT-REVERSE 6.12.2 fixes. */
// [::TICKET::] P22-21 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-21 --for-spec --no-implementation-order`.
function claimWithRefHashes({ claimId, refHashes, rfcHeadingRefs = [] }) {
  return {
    claim_id: claimId,
    forward_refs: { rfc_heading_refs: rfcHeadingRefs, ref_hashes: refHashes },
  };
}

/**
 * The standard fixture: one claim recorded against the graph as it stands, one
 * claim with no recorded hashes at all, and a COMPLETE run.
 *
 * The graph is written first so its hash can be recorded from the real bytes —
 * a hardcoded digest would make the test agree with itself rather than with the
 * file.
 */
// [::TICKET::] P22-21 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-21 --for-spec --no-implementation-order`.
function arrangeRecordedClaim() {
  const fixture = scratch();
  writeFileSync(fixture.graphPath, 'original graph\n');

  const recorded = hashInput(fixture.graphPath);
  const ledger = {
    root: fixture.subjectRoot,
    completion_state: 'COMPLETE',
    claims: [
      claimWithRefHashes({ claimId: 'clm-1', refHashes: { graph: recorded }, rfcHeadingRefs: ['rfc-7.3.2'] }),
      claimWithRefHashes({ claimId: 'clm-2', refHashes: {} }),
    ],
  };
  writeLedger(fixture.sidecarRoot, ledger);

  return { ...fixture, ledger, recorded };
}

// ---------------------------------------------------------------------------
// C001 — precondition: ref_hashes have been recorded
// ---------------------------------------------------------------------------

test('C001 precondition — the ledger records a hash per forward reference', () => {
  const fixture = arrangeRecordedClaim();
  try {
    const ledger = loadClaimLedger(fixture.sidecarRoot);

    assert.equal(ledger.claims.length, 2);
    assert.equal(ledger.completion_state, 'COMPLETE');
    assert.equal(ledger.claims[0].forward_refs.ref_hashes.graph, fixture.recorded);
    assert.match(fixture.recorded, /^sha256:[0-9a-f]{64}$/);
    assert.deepEqual(ledger.claims[1].forward_refs.ref_hashes, {});
  } finally {
    fixture.dispose();
  }
});

test('C001 precondition — a ledger that is not there is named rather than treated as empty', () => {
  const fixture = scratch();
  try {
    assert.throws(() => loadClaimLedger(fixture.sidecarRoot), /CLAIM-LEDGER\.json/);
    assert.throws(() => propagateStaleness(fixture.sidecarRoot, []), /CLAIM-LEDGER\.json/);
  } finally {
    fixture.dispose();
  }
});

test('a malformed ledger is refused rather than read as an empty one', () => {
  const fixture = scratch();
  const ledgerPath = join(fixture.sidecarRoot, CLAIM_LEDGER_FILE_NAME);
  try {
    // An absent `claims` key is a malformed ledger, not an empty one. Reading it
    // as empty would report "nothing is stale" about a ledger that was never
    // read — the same false statement a missing ledger would have made.
    writeFileSync(ledgerPath, JSON.stringify({ completion_state: 'COMPLETE' }));
    assert.throws(() => loadClaimLedger(fixture.sidecarRoot), /claims/);

    writeFileSync(ledgerPath, JSON.stringify({ completion_state: 'COMPLETE', claims: 'nope' }));
    assert.throws(() => loadClaimLedger(fixture.sidecarRoot), /claims/);

    // Unparseable JSON names the file, so the operator knows which one to look at.
    writeFileSync(ledgerPath, 'not json');
    assert.throws(() => loadClaimLedger(fixture.sidecarRoot), /CLAIM-LEDGER\.json/);
  } finally {
    fixture.dispose();
  }
});

test('an empty claim list is a legitimate ledger and completes', () => {
  const fixture = scratch();
  try {
    writeLedger(fixture.sidecarRoot, { root: fixture.subjectRoot, completion_state: 'COMPLETE', claims: [] });

    const result = propagateStaleness(fixture.sidecarRoot, [{ ref: 'graph', path: fixture.graphPath }]);

    assert.equal(result.claimCount, 0);
    assert.equal(result.freshClaimCount, 0);
  } finally {
    fixture.dispose();
  }
});

// ---------------------------------------------------------------------------
// C001 — postcondition: a change in an input marks the dependent claims stale
// ---------------------------------------------------------------------------

test('C001 postcondition — a change in a recorded input marks the dependent claims stale', () => {
  const fixture = arrangeRecordedClaim();
  try {
    writeFileSync(fixture.graphPath, 'regenerated graph\n');

    const result = propagateStaleness(fixture.sidecarRoot, [{ ref: 'graph', path: fixture.graphPath }]);

    assert.deepEqual(result.staleClaimIds, ['clm-1']);
    assert.equal(result.staleClaims[0].stale, true);
    assert.equal(result.staleClaims[0].changedInput, 'graph');
    assert.equal(result.staleClaims[0].differingHashes.graph.recorded, fixture.recorded);
    assert.equal(result.staleClaims[0].differingHashes.graph.current, hashInput(fixture.graphPath));
  } finally {
    fixture.dispose();
  }
});

test('C001 postcondition — an unchanged input leaves every recorded claim fresh', () => {
  const fixture = arrangeRecordedClaim();
  try {
    const result = propagateStaleness(fixture.sidecarRoot, [{ ref: 'graph', path: fixture.graphPath }]);

    assert.deepEqual(result.staleClaims, []);
    assert.deepEqual(result.staleClaimIds, []);
  } finally {
    fixture.dispose();
  }
});

// ---------------------------------------------------------------------------
// C001 — invariant: a stale claim never cancels COMPLETE
// ---------------------------------------------------------------------------

test('C001 invariant — staleness never cancels COMPLETE', () => {
  const fixture = arrangeRecordedClaim();
  try {
    const before = loadClaimLedger(fixture.sidecarRoot);
    writeFileSync(fixture.graphPath, 'regenerated graph\n');

    const result = propagateStaleness(fixture.sidecarRoot, [{ ref: 'graph', path: fixture.graphPath }]);
    const after = loadClaimLedger(fixture.sidecarRoot);

    assert.equal(before.completion_state, 'COMPLETE');
    assert.equal(after.completion_state, before.completion_state);
    assert.equal(result.completionState, 'COMPLETE');
    for (const marker of result.staleClaims) {
      assert.equal(marker.completionState, 'COMPLETE');
    }
  } finally {
    fixture.dispose();
  }
});

// ---------------------------------------------------------------------------
// C002 — precondition: staleness has been propagated
// ---------------------------------------------------------------------------

test('C002 precondition — emitting refuses anything that is not a propagation result', () => {
  assert.throws(() => emitReexaminationConditions({}), /propagateStaleness/);
  assert.throws(() => emitReexaminationConditions(undefined), /propagateStaleness/);
  assert.throws(() => emitReexaminationConditions(null), /propagateStaleness/);
});

// ---------------------------------------------------------------------------
// C002 — postcondition: the conditions are recorded and become drill input
// ---------------------------------------------------------------------------

test('C002 postcondition — each stale claim records its re-examination condition', () => {
  const fixture = arrangeRecordedClaim();
  try {
    writeFileSync(fixture.graphPath, 'regenerated graph\n');

    const marker = propagateStaleness(fixture.sidecarRoot, [{ ref: 'graph', path: fixture.graphPath }]).staleClaims[0];

    assert.match(marker.reexaminationCondition, /clm-1/);
    assert.match(marker.reexaminationCondition, /graph/);
    assert.deepEqual(marker.rfcHeadingRefs, ['rfc-7.3.2']);
  } finally {
    fixture.dispose();
  }
});

test('C002 postcondition — the conditions are emitted as material the drill flow accepts', () => {
  const fixture = arrangeRecordedClaim();
  try {
    writeFileSync(fixture.graphPath, 'regenerated graph\n');
    const result = propagateStaleness(fixture.sidecarRoot, [{ ref: 'graph', path: fixture.graphPath }]);

    const material = emitReexaminationConditions(result);

    assert.match(material, /drill-rfc-down/);
    assert.match(material, /Re-examination condition/);
    assert.match(material, /clm-1/);
    assert.match(material, /rfc-7\.3\.2/);
    assert.match(material, /graph/);
  } finally {
    fixture.dispose();
  }
});

test('C002 postcondition — the emitted index is the artefact tickets point at by name', () => {
  const fixture = arrangeRecordedClaim();
  try {
    writeFileSync(fixture.graphPath, 'regenerated graph\n');
    const result = propagateStaleness(fixture.sidecarRoot, [{ ref: 'graph', path: fixture.graphPath }]);

    assert.equal(result.sidecar, STALENESS_INDEX_FILE_NAME);
    assert.equal(JSON.parse(JSON.stringify(result)).staleClaimIds[0], 'clm-1');
  } finally {
    fixture.dispose();
  }
});

// ---------------------------------------------------------------------------
// C002 — invariant: the forward drill behaviour is not changed
// ---------------------------------------------------------------------------

test('C002 invariant — the frozen command-file digest reports no loss', () => {
  const frozen = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));

  const findings = compareDigests(frozen.commandFileDigests, digestCommandFiles(PROJECT_ROOT));

  assert.deepEqual(findings, []);
});

test('C002 invariant — the forward regression gate still proves', () => {
  // The gate measures the project the operator is standing in, so it is run
  // from the project root rather than from the script's own directory.
  const gate = spawnSync(process.execPath, [join(REVERSE_SCRIPT_DIR, 'run.mjs'), 'regression', 'check'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
  });

  assert.equal(gate.status, 0, `${gate.stdout}${gate.stderr}`);
  assert.match(gate.stdout, /proved/);
});

// ---------------------------------------------------------------------------
// UT-1 / UT-9 — propagation of a single stale claim
// ---------------------------------------------------------------------------

test('a single stale claim propagates and is counted once', () => {
  const fixture = arrangeRecordedClaim();
  try {
    writeFileSync(fixture.graphPath, 'regenerated graph\n');

    const result = propagateStaleness(fixture.sidecarRoot, [{ ref: 'graph', path: fixture.graphPath }]);

    assert.equal(result.staleClaims.length, 1);
    assert.equal(result.staleClaims[0].claimId, 'clm-1');
    assert.equal(result.freshClaimCount, 1);
  } finally {
    fixture.dispose();
  }
});

test('several changed inputs are all recorded against the claim that depends on them', () => {
  const fixture = arrangeRecordedClaim();
  try {
    writeFileSync(fixture.dirsTreePath, 'original tree\n');
    writeLedger(fixture.sidecarRoot, {
      ...fixture.ledger,
      claims: [
        claimWithRefHashes({
          claimId: 'clm-1',
          refHashes: { graph: fixture.recorded, dirs_tree: hashInput(fixture.dirsTreePath) },
        }),
      ],
    });
    writeFileSync(fixture.graphPath, 'regenerated graph\n');
    writeFileSync(fixture.dirsTreePath, 'regenerated tree\n');

    const result = propagateStaleness(fixture.sidecarRoot, [
      { ref: 'graph', path: fixture.graphPath },
      { ref: 'dirs_tree', path: fixture.dirsTreePath },
    ]);

    assert.deepEqual(Object.keys(result.staleClaims[0].differingHashes).sort(), ['dirs_tree', 'graph']);
  } finally {
    fixture.dispose();
  }
});

// ---------------------------------------------------------------------------
// UT-4 / UT-5 — reporting, not assuming
// ---------------------------------------------------------------------------

test('a stale claim names the input that changed and the hash that differs', () => {
  const fixture = arrangeRecordedClaim();
  try {
    writeFileSync(fixture.graphPath, 'regenerated graph\n');

    const marker = propagateStaleness(fixture.sidecarRoot, [{ ref: 'graph', path: fixture.graphPath }]).staleClaims[0];

    assert.equal(marker.changedInput, 'graph');
    assert.equal(marker.changedInputPath, fixture.graphPath);
    assert.notEqual(marker.differingHashes.graph.recorded, marker.differingHashes.graph.current);
  } finally {
    fixture.dispose();
  }
});

test('an input whose hash cannot be computed is reported rather than assumed unchanged', () => {
  const fixture = arrangeRecordedClaim();
  try {
    const absent = join(fixture.subjectRoot, 'absent-GRAPH.json');

    const result = propagateStaleness(fixture.sidecarRoot, [{ ref: 'graph', path: absent }]);

    assert.deepEqual(result.staleClaimIds, []);
    assert.deepEqual(result.findings.map((finding) => finding.kind), [FINDING_KINDS.UNHASHABLE_INPUT]);
    assert.match(result.findings[0].detail, /absent-GRAPH\.json/);
    assert.equal(result.freshClaimCount, 1, 'clm-2 has no recorded hashes and stays fresh');
    assert.deepEqual(result.unresolvedClaims.map((claim) => claim.claimId), ['clm-1']);
  } finally {
    fixture.dispose();
  }
});

// ---------------------------------------------------------------------------
// UT-6 — a claim referencing a hash that does not exist
// ---------------------------------------------------------------------------

test('a claim referencing a hash that does not exist is reported rather than treated as fresh', () => {
  const fixture = arrangeRecordedClaim();
  try {
    writeLedger(fixture.sidecarRoot, {
      ...fixture.ledger,
      claims: [claimWithRefHashes({ claimId: 'clm-3', refHashes: { graph: null } })],
    });

    const result = propagateStaleness(fixture.sidecarRoot, [{ ref: 'graph', path: fixture.graphPath }]);

    assert.deepEqual(result.staleClaimIds, []);
    assert.equal(result.freshClaimCount, 0, 'a comparison that could not be made is not freshness');
    assert.deepEqual(result.unresolvedClaims.map((claim) => claim.claimId), ['clm-3']);
    assert.deepEqual(result.findings.map((finding) => finding.kind), [FINDING_KINDS.UNRESOLVED_RECORDED_HASH]);
  } finally {
    fixture.dispose();
  }
});

test('every examined claim lands in exactly one of stale, unresolved or fresh', () => {
  const fixture = arrangeRecordedClaim();
  try {
    writeFileSync(fixture.graphPath, 'regenerated graph\n');

    const result = propagateStaleness(fixture.sidecarRoot, [{ ref: 'graph', path: fixture.graphPath }]);

    assert.equal(
      result.staleClaims.length + result.unresolvedClaims.length + result.freshClaimCount,
      fixture.ledger.claims.length,
    );
  } finally {
    fixture.dispose();
  }
});

// ---------------------------------------------------------------------------
// UT-7 / UT-8 — the quiet run, and the claim outside the sidecar
// ---------------------------------------------------------------------------

test('a run with no stale claims states that there were none', () => {
  const fixture = arrangeRecordedClaim();
  try {
    const result = propagateStaleness(fixture.sidecarRoot, [{ ref: 'graph', path: fixture.graphPath }]);

    assert.deepEqual(result.staleClaims, []);
    assert.deepEqual(result.unresolvedClaims, []);

    const material = emitReexaminationConditions(result);
    assert.match(material, /No claim is stale/);
    assert.match(material, /drill-rfc-down/);
  } finally {
    fixture.dispose();
  }
});

test('a claim with no recorded ref_hashes is treated as not stale rather than as stale', () => {
  const fixture = arrangeRecordedClaim();
  try {
    writeFileSync(fixture.graphPath, 'regenerated graph\n');

    const result = propagateStaleness(fixture.sidecarRoot, [{ ref: 'graph', path: fixture.graphPath }]);

    assert.ok(!result.staleClaimIds.includes('clm-2'));
    assert.ok(!result.unresolvedClaims.some((claim) => claim.claimId === 'clm-2'));
  } finally {
    fixture.dispose();
  }
});

test('a ledger with no claims at all completes and reports that there were none', () => {
  const fixture = scratch();
  try {
    writeLedger(fixture.sidecarRoot, { root: fixture.subjectRoot, completion_state: 'COMPLETE', claims: [] });

    const result = propagateStaleness(fixture.sidecarRoot, [{ ref: 'graph', path: fixture.graphPath }]);

    assert.deepEqual(result.staleClaims, []);
    assert.equal(result.freshClaimCount, 0);
    assert.match(emitReexaminationConditions(result), /No claim is stale/);
  } finally {
    fixture.dispose();
  }
});

// ---------------------------------------------------------------------------
// UT-12 — read-only with respect to the target tree
// ---------------------------------------------------------------------------

test('propagation is read-only with respect to the target tree', () => {
  const fixture = arrangeRecordedClaim();
  try {
    writeFileSync(fixture.dirsTreePath, 'a sibling artefact\n');
    const before = hashTree(fixture.subjectRoot);

    propagateStaleness(fixture.sidecarRoot, [{ ref: 'graph', path: fixture.graphPath }]);
    emitReexaminationConditions(propagateStaleness(fixture.sidecarRoot, [{ ref: 'graph', path: fixture.graphPath }]));

    assert.deepEqual(hashTree(fixture.subjectRoot), before);
  } finally {
    fixture.dispose();
  }
});

// ---------------------------------------------------------------------------
// The marker and the recorded-hash reader, tested where they are defined
// ---------------------------------------------------------------------------

test('markClaimStale copies the completion state rather than deriving one', () => {
  const marker = markClaimStale(
    { claim_id: 'clm-9', forward_refs: { rfc_heading_refs: ['rfc-1.1'] } },
    { differing: { graph: { recorded: 'sha256:aa', current: 'sha256:bb', path: '/tmp/g' } }, completionState: 'BLOCKED' },
  );

  assert.equal(marker.claimId, 'clm-9');
  assert.equal(marker.completionState, 'BLOCKED', 'whatever the run recorded is reproduced, not recomputed');
  assert.equal(marker.changedInput, 'graph');
  assert.equal(marker.changedInputPath, '/tmp/g');
  assert.deepEqual(marker.rfcHeadingRefs, ['rfc-1.1']);
  assert.ok(Object.isFrozen(marker));
});

test('the primary changed input is the first by name when several differ', () => {
  const marker = markClaimStale(
    { claim_id: 'clm-9' },
    {
      differing: {
        dirs_tree: { recorded: 'sha256:aa', current: 'sha256:bb', path: '/tmp/d' },
        graph: { recorded: 'sha256:cc', current: 'sha256:dd', path: '/tmp/g' },
      },
      completionState: 'COMPLETE',
    },
  );

  assert.equal(marker.changedInput, 'dirs_tree');
});

test('a claim records its hashes and nothing else when the ledger carries no forward_refs', () => {
  assert.deepEqual(recordedHashesOf({ claim_id: 'clm-1' }), {});
  assert.deepEqual(recordedHashesOf({ claim_id: 'clm-1', forward_refs: {} }), {});
  assert.deepEqual(recordedHashesOf({ claim_id: 'clm-1', forward_refs: { ref_hashes: null } }), {});
  assert.deepEqual(recordedHashesOf({ claim_id: 'clm-1', forward_refs: { ref_hashes: { graph: 'sha256:aa' } } }), {
    graph: 'sha256:aa',
  });
});

test('only a well-formed sha256 value is comparable', () => {
  assert.equal(isHashShaped(`sha256:${'a'.repeat(64)}`), true);
  assert.equal(isHashShaped('sha256:short'), false);
  assert.equal(isHashShaped(''), false);
  assert.equal(isHashShaped(null), false);
  assert.equal(isHashShaped(undefined), false);
  assert.equal(isHashShaped({}), false);
});

// ---------------------------------------------------------------------------
// Caller defects — named, not swallowed
// ---------------------------------------------------------------------------

test('a duplicate reference in the changed set is refused rather than silently resolved', () => {
  const fixture = arrangeRecordedClaim();
  try {
    assert.throws(
      () => propagateStaleness(fixture.sidecarRoot, [
        { ref: 'graph', path: fixture.graphPath },
        { ref: 'graph', path: fixture.graphPath },
      ]),
      /graph/,
    );
  } finally {
    fixture.dispose();
  }
});
