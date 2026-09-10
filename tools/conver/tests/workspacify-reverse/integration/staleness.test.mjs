// @verifies C001
// @verifies C002
// [::TICKET::] P22-21 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-21 --for-spec --no-implementation-order`.
/**
 * Staleness propagation, end to end over the experiment input.
 *
 * The comparison is exercised against real bytes from `siprs-for-reverse`, not
 * against a fixture written to agree with the code. The tree itself is 1.1 GB,
 * so it is never copied and never written: the recorded hash is taken from the
 * artefact as it stands, and the change is applied to a copy outside it. That
 * keeps the run cheap while still asking the question the evolution loop asks —
 * does a recorded reference still describe the artefact it names?
 *
 * The completion state is asserted at this level too. `COMPLETE` is read by the
 * forward rotation and staleness is a reverse-rotation concept, so a run that
 * quietly altered one would be breaking the thing this phase may not break.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CLAIM_LEDGER_FILE_NAME,
  REEXAMINATION_FILE_NAME,
  STALENESS_INDEX_FILE_NAME,
  emitReexaminationConditions,
  hashInput,
  propagateStaleness,
} from '../../../.claude/scripts/workspacify-reverse/lib/staleness.mjs';
import {
  compareDigests,
  digestCommandFiles,
} from '../../../.claude/scripts/workspacify-reverse/lib/command-file-digest.mjs';

const REVERSE_ROOT = fileURLToPath(new URL('../../../siprs-for-reverse', import.meta.url));
const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const REVERSE_SCRIPT_DIR = join(PROJECT_ROOT, '.claude/scripts/workspacify-reverse');
const BASELINE_PATH = join(PROJECT_ROOT, 'tests/workspacify-tree/baselines/manifest-hashes.json');
const STALENESS_SCRIPT = join(REVERSE_SCRIPT_DIR, 'lib/staleness.mjs');

/** A real artefact of the subject tree: small, stable, and named by the manifest. */
const REAL_ARTEFACT = join(REVERSE_ROOT, 'Cargo.toml');

const reverseTreeAvailable = existsSync(REVERSE_ROOT);

// [::TICKET::] P22-21 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-21 --for-spec --no-implementation-order`.
function scratch() {
  const root = mkdtempSync(join(tmpdir(), 'wsp-staleness-int-'));
  const sidecarRoot = join(root, 'sidecars');
  const outDir = join(root, 'out');
  mkdirSync(sidecarRoot);
  mkdirSync(outDir);
  return { root, sidecarRoot, outDir, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

/** A ledger recording one real artefact's hash, and a COMPLETE run. */
// [::TICKET::] P22-21 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-21 --for-spec --no-implementation-order`.
function arrangeOverRealTree() {
  const fixture = scratch();
  const recorded = hashInput(REAL_ARTEFACT);
  writeFileSync(
    join(fixture.sidecarRoot, CLAIM_LEDGER_FILE_NAME),
    `${JSON.stringify(
      {
        root: REVERSE_ROOT,
        completion_state: 'COMPLETE',
        claims: [
          {
            claim_id: 'clm-build-manifest',
            forward_refs: { rfc_heading_refs: ['rfc-3.1'], ref_hashes: { manifest: recorded } },
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  return { ...fixture, recorded };
}

test('the real artefact unchanged leaves the claim fresh', { skip: !reverseTreeAvailable }, () => {
  const fixture = arrangeOverRealTree();
  try {
    const result = propagateStaleness(fixture.sidecarRoot, [{ ref: 'manifest', path: REAL_ARTEFACT }]);

    assert.deepEqual(result.staleClaimIds, []);
    assert.deepEqual(result.unresolvedClaims, []);
    assert.equal(result.freshClaimCount, 1);
  } finally {
    fixture.dispose();
  }
});

test('IT-1 — changing a recorded input marks the dependent claims stale', { skip: !reverseTreeAvailable }, () => {
  const fixture = arrangeOverRealTree();
  try {
    // The change is applied to a copy outside the measured tree.
    const changedCopy = join(fixture.outDir, 'Cargo.toml');
    writeFileSync(changedCopy, `${readFileSync(REAL_ARTEFACT, 'utf8')}\n# a dependency moved on\n`);

    const result = propagateStaleness(fixture.sidecarRoot, [{ ref: 'manifest', path: changedCopy }]);

    assert.deepEqual(result.staleClaimIds, ['clm-build-manifest']);
    assert.equal(result.staleClaims[0].differingHashes.manifest.recorded, fixture.recorded);
    assert.equal(result.staleClaims[0].differingHashes.manifest.current, hashInput(changedCopy));
    assert.deepEqual(result.staleClaims[0].rfcHeadingRefs, ['rfc-3.1']);
  } finally {
    fixture.dispose();
  }
});

test('IT-2 — the completion state of the affected claims is unchanged', { skip: !reverseTreeAvailable }, () => {
  const fixture = arrangeOverRealTree();
  try {
    const changedCopy = join(fixture.outDir, 'Cargo.toml');
    writeFileSync(changedCopy, `${readFileSync(REAL_ARTEFACT, 'utf8')}\n# a dependency moved on\n`);

    propagateStaleness(fixture.sidecarRoot, [{ ref: 'manifest', path: changedCopy }]);

    const ledger = JSON.parse(readFileSync(join(fixture.sidecarRoot, CLAIM_LEDGER_FILE_NAME), 'utf8'));
    assert.equal(ledger.completion_state, 'COMPLETE');
  } finally {
    fixture.dispose();
  }
});

test('the measured tree is left byte-identical', { skip: !reverseTreeAvailable }, () => {
  const fixture = arrangeOverRealTree();
  try {
    const before = hashInput(REAL_ARTEFACT);
    const changedCopy = join(fixture.outDir, 'Cargo.toml');
    writeFileSync(changedCopy, `${readFileSync(REAL_ARTEFACT, 'utf8')}\n# a dependency moved on\n`);

    propagateStaleness(fixture.sidecarRoot, [{ ref: 'manifest', path: changedCopy }]);
    emitReexaminationConditions(propagateStaleness(fixture.sidecarRoot, [{ ref: 'manifest', path: changedCopy }]));

    assert.equal(hashInput(REAL_ARTEFACT), before);
  } finally {
    fixture.dispose();
  }
});

test('the command writes the index and the material the drill flow accepts', { skip: !reverseTreeAvailable }, () => {
  const fixture = arrangeOverRealTree();
  try {
    const changedCopy = join(fixture.outDir, 'Cargo.toml');
    writeFileSync(changedCopy, `${readFileSync(REAL_ARTEFACT, 'utf8')}\n# a dependency moved on\n`);

    const run = spawnSync(
      process.execPath,
      [STALENESS_SCRIPT, `--claim-ledger=${fixture.sidecarRoot}`, `--changed=manifest=${changedCopy}`, `--out=${fixture.outDir}`],
      { cwd: PROJECT_ROOT, encoding: 'utf8' },
    );

    assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
    assert.ok(existsSync(join(fixture.outDir, STALENESS_INDEX_FILE_NAME)));
    const material = readFileSync(join(fixture.outDir, REEXAMINATION_FILE_NAME), 'utf8');
    assert.match(material, /drill-rfc-down/);
    assert.match(material, /clm-build-manifest/);
    assert.match(material, /Re-examination condition/);
  } finally {
    fixture.dispose();
  }
});

test('a usage error is reported in words rather than as a stack trace', () => {
  const run = spawnSync(
    process.execPath,
    [STALENESS_SCRIPT, '--claim-ledger=/tmp', '--changed=graph=/tmp/x', '--bogus'],
    { cwd: PROJECT_ROOT, encoding: 'utf8' },
  );

  assert.equal(run.status, 2, 'a usage error is not a crash');
  assert.match(run.stderr, /--bogus/);
  assert.doesNotMatch(run.stderr, /^\s+at .*\(/m, 'no stack frames should reach the operator');
});

test('a changed input with no artefact is reported in words too', () => {
  const run = spawnSync(
    process.execPath,
    [STALENESS_SCRIPT, '--claim-ledger=/tmp', '--changed=graph'],
    { cwd: PROJECT_ROOT, encoding: 'utf8' },
  );

  assert.equal(run.status, 2);
  assert.match(run.stderr, /graph/);
  assert.doesNotMatch(run.stderr, /^\s+at .*\(/m);
});

test('IT-3 — the command digest matches the frozen baseline', () => {
  const frozen = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));

  const findings = compareDigests(frozen.commandFileDigests, digestCommandFiles(PROJECT_ROOT));

  assert.deepEqual(findings, []);
  assert.ok(Object.keys(frozen.commandFileDigests).includes('drill-rfc-down'));
});

test('IT-4 — the forward regression gate exits 0', () => {
  // The gate measures the project the operator stands in, so the cwd is the root.
  const gate = spawnSync(process.execPath, [join(REVERSE_SCRIPT_DIR, 'run.mjs'), 'regression', 'check'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
  });

  assert.equal(gate.status, 0, `${gate.stdout}${gate.stderr}`);
  assert.match(gate.stdout, /proved/);
});
