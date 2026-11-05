// PX-309 @verifies C004
// PX-367 @verifies C001
// The render is not a procedure step the model can skip: the command that declares a run
// DONE renders first, then evaluates every required gate, and only then records the
// generation and declares DONE. These tests pin that ordering, the refusal, the additivity
// case and the command wiring that makes the ordering unavoidable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { digestOfFindings } from '../../.claude/scripts/api-consistency/finding-identity.mjs';
import { REQUIRED_GATE_NAMES } from '../../.claude/scripts/grill-me-for-rfc/complete-run.js';
import { defaultViews } from '../smooth-sequences/helpers/workspace-fixture.mjs';
import {
  artifactWithoutCensus,
  materializeCompletionWorkspace,
  materializeViewlessCompletionWorkspace,
  rfcBodiesWithApiMatch,
  rfcBodiesWithApiMismatch,
  rfcBodiesWithoutDistributionMap,
  withheldContributionArtifact,
} from './helpers/completion-workspace.mjs';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const COMPLETE_RUN = join(PROJECT_ROOT, '.claude/scripts/grill-me-for-rfc/complete-run.js');
const GRILL_COMMAND = join(PROJECT_ROOT, '.claude/commands/grill-me-for-rfc.md');

// [::TICKET::] PX-309, PX-367, PX-371 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-309|PX-367|PX-371) --for-spec --no-implementation-order`.
function runCompletion(directory, extraArgs = []) {
  return spawnSync(process.execPath, [COMPLETE_RUN, directory, ...extraArgs], { encoding: 'utf8' });
}

/** The last line is the machine-readable report; the repair record is written to stderr. */
// [::TICKET::] PX-367 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-367 --for-spec --no-implementation-order`.
function readReport(result) {
  return JSON.parse(result.stdout.trim().split('\n').at(-1));
}

// [::TICKET::] PX-309 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-309 --for-spec --no-implementation-order`.
function readStatus(statusPath) {
  return JSON.parse(readFileSync(statusPath, 'utf8'));
}

test('C004 completion renders the ledger, records the generation and then declares DONE', () => {
  const workspace = materializeCompletionWorkspace({ rfcBodies: rfcBodiesWithoutDistributionMap() });
  try {
    const result = runCompletion(workspace.rfcDir);

    assert.equal(result.status, 0, result.stderr);
    const status = readStatus(workspace.statusPath);
    assert.equal(status.state, 'DONE');
    assert.equal(status.distributionGeneration, 1);
    assert.match(status.distributionDigest, /^[0-9a-f]{64}$/);
    assert.equal(status.completedSessions, 1);
    assert.match(readFileSync(workspace.rfcPath, 'utf8'), /<!-- unit: op-ProduceFact -->/);
  } finally {
    workspace.remove();
  }
});

test('C004 completion mirrors the grill generation, so SEQ and GRI agree', () => {
  const workspace = materializeCompletionWorkspace();
  try {
    const status = readStatus(workspace.statusPath);
    writeFileSync(workspace.statusPath, JSON.stringify({ ...status, grillGeneration: 3 }, null, 2));

    const result = runCompletion(workspace.rfcDir);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(readStatus(workspace.statusPath).distributionGeneration, 3);
  } finally {
    workspace.remove();
  }
});

test('C004 a repeated completion inside one grill generation does not advance the counter', () => {
  const workspace = materializeCompletionWorkspace();
  try {
    const status = readStatus(workspace.statusPath);
    writeFileSync(workspace.statusPath, JSON.stringify({ ...status, grillGeneration: 3 }, null, 2));

    runCompletion(workspace.rfcDir);
    runCompletion(workspace.rfcDir);

    assert.equal(readStatus(workspace.statusPath).distributionGeneration, 3);
  } finally {
    workspace.remove();
  }
});

test('C004 a package with no view still reports the grill generation it belongs to', () => {
  const workspace = materializeViewlessCompletionWorkspace();
  try {
    const status = readStatus(workspace.statusPath);
    writeFileSync(workspace.statusPath, JSON.stringify({ ...status, grillGeneration: 4 }, null, 2));

    const result = runCompletion(workspace.rfcDir);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(readStatus(workspace.statusPath).distributionGeneration, 4);
  } finally {
    workspace.remove();
  }
});

test('C004 a package that predates the counter advances from the generation its map already is', () => {
  const workspace = materializeCompletionWorkspace();
  try {
    const result = runCompletion(workspace.rfcDir);

    assert.equal(result.status, 0, result.stderr);
    const status = readStatus(workspace.statusPath);
    assert.equal(status.state, 'DONE');
    assert.equal(status.distributionGeneration, 2);
  } finally {
    workspace.remove();
  }
});

test('C004 a refused render writes nothing and leaves the run unfinished', () => {
  const views = defaultViews();
  views['pkg-0001'] = {
    ...views['pkg-0001'],
    ownedSequenceUnits: [
      ...views['pkg-0001'].ownedSequenceUnits,
      {
        unitId: 'seq-A-2',
        sequenceId: 'A-2',
        outcome: 'direct',
        ownerPackageIds: ['pkg-0001'],
        steps: [{ stepId: 's1', operationId: 'ProduceFact', contract: { pre: [], post: [] }, line: 12, quote: 'produce' }],
      },
    ],
  };
  const workspace = materializeCompletionWorkspace({ views, rfcBodies: rfcBodiesWithoutDistributionMap() });
  try {
    const rfcBefore = readFileSync(workspace.rfcPath, 'utf8');

    const result = runCompletion(workspace.rfcDir);

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /"ok":false/);
    assert.equal(readFileSync(workspace.rfcPath, 'utf8'), rfcBefore);
    const status = readStatus(workspace.statusPath);
    assert.equal(status.state, 'GRILLING');
    assert.equal(status.distributionGeneration, undefined);
  } finally {
    workspace.remove();
  }
});

test('C004 a package without a view still finishes and records no generation', () => {
  const workspace = materializeViewlessCompletionWorkspace();
  try {
    const rfcBefore = readFileSync(workspace.rfcPath, 'utf8');

    const result = runCompletion(workspace.rfcDir);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(workspace.rfcPath, 'utf8'), rfcBefore);
    const status = readStatus(workspace.statusPath);
    assert.equal(status.state, 'DONE');
    assert.equal(status.distributionGeneration, undefined);
  } finally {
    workspace.remove();
  }
});

test('C004 every completion opens one generation and a repeated completion adds no session', () => {
  const workspace = materializeCompletionWorkspace({ rfcBodies: rfcBodiesWithoutDistributionMap() });
  try {
    runCompletion(workspace.rfcDir);
    const afterFirst = readStatus(workspace.statusPath);
    runCompletion(workspace.rfcDir);
    const afterSecond = readStatus(workspace.statusPath);

    assert.equal(afterSecond.distributionGeneration, afterFirst.distributionGeneration + 1);
    assert.equal(afterSecond.completedSessions, 1);
  } finally {
    workspace.remove();
  }
});

test('C004 a package without an RFC is not finished', () => {
  const workspace = materializeCompletionWorkspace();
  try {
    rmSync(workspace.rfcPath);

    const result = runCompletion(workspace.rfcDir);

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /MISSING_RFC/);
    assert.equal(readStatus(workspace.statusPath).state, 'GRILLING');
  } finally {
    workspace.remove();
  }
});

test('C004 a package without a Status.json is refused before anything is written', () => {
  const workspace = materializeCompletionWorkspace();
  try {
    const rfcBefore = readFileSync(workspace.rfcPath, 'utf8');
    rmSync(workspace.statusPath);

    const result = runCompletion(workspace.rfcDir);

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /MISSING_STATUS/);
    assert.equal(readFileSync(workspace.rfcPath, 'utf8'), rfcBefore);
  } finally {
    workspace.remove();
  }
});

// ---------------------------------------------------------------------------
// PX-367 — DONE is evidence, not an intention
// ---------------------------------------------------------------------------

test('C001 invariant: every required gate exits zero, then and only then state becomes DONE', () => {
  const workspace = materializeCompletionWorkspace({ rfcBodies: rfcBodiesWithoutDistributionMap() });
  try {
    const result = runCompletion(workspace.rfcDir);

    assert.equal(result.status, 0, result.stderr);
    const report = readReport(result);
    assert.equal(report.ok, true);
    assert.equal(report.state, 'DONE');
    assert.deepEqual(report.gates.map((gate) => gate.name), REQUIRED_GATE_NAMES);
    assert.ok(report.gates.every((gate) => gate.exitCode === 0));
    assert.deepEqual(report.withheld, []);
    assert.equal(readStatus(workspace.statusPath).state, 'DONE');
  } finally {
    workspace.remove();
  }
});

test('C001 postcondition: a failing K1 gate refuses DONE and leaves Status.json byte-identical', () => {
  const workspace = materializeCompletionWorkspace({
    artifact: artifactWithoutCensus(),
    rfcBodies: rfcBodiesWithoutDistributionMap(),
  });
  try {
    const statusBefore = readFileSync(workspace.statusPath, 'utf8');

    const result = runCompletion(workspace.rfcDir);

    assert.notEqual(result.status, 0);
    const report = readReport(result);
    assert.equal(report.ok, false);
    assert.equal(report.code, 'GATE_FAILED');
    assert.equal(report.gate, 'check-obligation-coverage.js');
    assert.equal(report.exitCode, 1);
    assert.equal(report.state, 'GRILLING');
    assert.equal(readFileSync(workspace.statusPath, 'utf8'), statusBefore);
    assert.match(result.stderr, /Action: .*educe-sequences\/rail\/phase\.mjs/);
    assert.match(result.stderr, /declaration\.json/);
    assert.match(result.stderr, /phase\.mjs" through/);
    assert.doesNotMatch(result.stderr, /begin <spec-path> to supply/);
  } finally {
    workspace.remove();
  }
});

test('C001 postcondition: a package outside a workspace is refused by name, never finished', () => {
  const directory = mkdtempSync(join(tmpdir(), 'px367-no-workspace-'));
  try {
    const rfcPath = join(directory, 'RFC.md');
    writeFileSync(rfcPath, '# RFC\n\nNo evidence lives above this directory.\n');
    writeFileSync(join(directory, 'Status.json'), JSON.stringify({
      state: 'GRILLING',
      researchPath: directory,
      rfcPath,
      rfcDir: directory,
      reviewLoopCount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }, null, 2));
    writeFileSync(join(directory, 'DesignTree.json'), JSON.stringify({ version: 1, nodes: [] }, null, 2));
    writeFileSync(join(directory, 'CheckList.md'), '# RFC 要件チェックリスト\n');

    const result = runCompletion(directory);

    assert.notEqual(result.status, 0);
    const report = readReport(result);
    const defect = report.gates.find((gate) => gate.name === 'defect-ledger');
    assert.equal(defect.exitCode, 1);
    assert.match(defect.detail, /NO_WORKSPACE_ROOT/);
    assert.equal(readStatus(join(directory, 'Status.json')).state, 'GRILLING');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('C006 invariant: a withheld contribution check is reported as withheld, never as proved', () => {
  const workspace = materializeCompletionWorkspace({
    artifact: withheldContributionArtifact(),
    rfcBodies: rfcBodiesWithoutDistributionMap(),
  });
  try {
    const result = runCompletion(workspace.rfcDir);

    assert.equal(result.status, 0, result.stderr);
    const report = readReport(result);
    assert.deepEqual(report.withheld, ['check-contribution-completeness.js']);
    assert.doesNotMatch(result.stdout, /every owned active operation declares/);
  } finally {
    workspace.remove();
  }
});

test('C007 invariant: several root artifacts are refused by name, never reduced to one', () => {
  const workspace = materializeCompletionWorkspace({ extraArtifactName: 'other-sequences.json' });
  try {
    const result = runCompletion(workspace.rfcDir);

    assert.notEqual(result.status, 0);
    const report = readReport(result);
    assert.equal(report.code, 'GATE_FAILED');
    assert.equal(report.gate, 'check-obligation-coverage.js');
    assert.equal(readStatus(workspace.statusPath).state, 'GRILLING');
  } finally {
    workspace.remove();
  }
});

test('C004 STEP 8 finishes through complete-run and never invokes the write-mode render by hand', () => {
  const [stepEight] = readFileSync(GRILL_COMMAND, 'utf8').split('### STEP 8a: Re-entry after DONE');
  assert.match(stepEight, /complete-run\.js"?\s+"\$RFC_DIR"/);
  const handwrittenWrite = stepEight.split('\n').filter((line) => /^node .*render-distribution\.mjs\s*$/.test(line.trim()));
  assert.deepEqual(handwrittenWrite, []);
});

// PX-371 @verifies C003
// A cross-package re-grill edits more than one package's Rust surface. The API gate is
// the only reader of that surface, so the cross-package completion mode runs it and
// refuses DONE on a blocking finding; a single-package completion is unchanged.

test('C003 postcondition: --cross-package refuses DONE on an API mismatch', () => {
  const workspace = materializeCompletionWorkspace({ rfcBodies: rfcBodiesWithApiMismatch() });
  try {
    const result = runCompletion(workspace.rfcDir, ['--cross-package']);

    assert.notEqual(result.status, 0);
    const report = readReport(result);
    const gate = report.gates.find((entry) => entry.name === 'api-consistency');
    assert.ok(gate, JSON.stringify(report.gates));
    assert.equal(gate.exitCode, 1);
    assert.equal(readStatus(workspace.statusPath).state, 'GRILLING');
  } finally {
    workspace.remove();
  }
});

test('C003 postcondition: --cross-package passes a clean cross-package surface', () => {
  const workspace = materializeCompletionWorkspace({ rfcBodies: rfcBodiesWithApiMatch() });
  try {
    const result = runCompletion(workspace.rfcDir, ['--cross-package']);

    assert.equal(result.status, 0, result.stderr);
    const report = readReport(result);
    const gate = report.gates.find((entry) => entry.name === 'api-consistency');
    assert.ok(gate, JSON.stringify(report.gates));
    assert.equal(gate.exitCode, 0);
    assert.equal(readStatus(workspace.statusPath).state, 'DONE');
  } finally {
    workspace.remove();
  }
});

test('C003 invariant: a run without --cross-package does not report the API gate', () => {
  const workspace = materializeCompletionWorkspace({ rfcBodies: rfcBodiesWithApiMismatch() });
  try {
    const result = runCompletion(workspace.rfcDir);

    assert.equal(result.status, 0, result.stderr);
    const report = readReport(result);
    assert.equal(report.gates.some((entry) => entry.name === 'api-consistency'), false);
  } finally {
    workspace.remove();
  }
});

// PX-372 @verifies C004
// A cross-package completion carries evidence: the baseline it authorized and the
// findings the edits claim to repair. DONE requires the named findings gone and no
// new blocking finding in scope; an unreadable evidence file refuses before any write.

// [::TICKET::] PX-372 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-372 --for-spec --no-implementation-order`.
function writeCrossPackageEvidence(rfcDir, { findings = [], repairs = [], editedPackages = [] } = {}) {
  const evidencePath = join(rfcDir, 'CROSS-PACKAGE-EVIDENCE.json');
  writeFileSync(evidencePath, JSON.stringify({
    format: 2,
    generatedAt: '2026-01-01T00:00:00.000Z',
    baseline: { digest: digestOfFindings(findings), findings },
    editedPackages: editedPackages.length > 0
      ? editedPackages
      : [{ id: 'pkg-0001', package: 'crates/provider', gates: [], repairs }],
  }, null, 2));
  return evidencePath;
}

test('C004 normal: cross-package completion accepts a baseline with no new finding', () => {
  const workspace = materializeCompletionWorkspace({ rfcBodies: rfcBodiesWithApiMatch() });
  try {
    const evidencePath = writeCrossPackageEvidence(workspace.rfcDir, { findings: [] });

    const result = runCompletion(workspace.rfcDir, [
      '--cross-package',
      '--edited-package=pkg-0001',
      `--cross-package-evidence=${evidencePath}`,
    ]);

    assert.equal(result.status, 0, result.stderr);
    const report = readReport(result);
    assert.equal(report.gates.find((entry) => entry.name === 'api-consistency').exitCode, 0);
    assert.equal(readStatus(workspace.statusPath).state, 'DONE');
  } finally {
    workspace.remove();
  }
});

test('C004 error: a new blocking finding outside the baseline refuses DONE', () => {
  const workspace = materializeCompletionWorkspace({ rfcBodies: rfcBodiesWithApiMismatch() });
  try {
    const evidencePath = writeCrossPackageEvidence(workspace.rfcDir, { findings: [] });

    const result = runCompletion(workspace.rfcDir, [
      '--cross-package',
      '--edited-package=pkg-0002',
      `--cross-package-evidence=${evidencePath}`,
    ]);

    assert.notEqual(result.status, 0);
    const report = readReport(result);
    assert.equal(report.gates.find((entry) => entry.name === 'api-consistency').exitCode, 1);
    assert.equal(readStatus(workspace.statusPath).state, 'GRILLING');
  } finally {
    workspace.remove();
  }
});

test('C004 error: malformed cross-package evidence refuses before any write', () => {
  const workspace = materializeCompletionWorkspace({ rfcBodies: rfcBodiesWithApiMatch() });
  try {
    const statusBefore = readFileSync(workspace.statusPath, 'utf8');
    const evidencePath = join(workspace.rfcDir, 'CROSS-PACKAGE-EVIDENCE.json');
    writeFileSync(evidencePath, '{}');

    const result = runCompletion(workspace.rfcDir, [
      '--cross-package',
      '--edited-package=pkg-0001',
      `--cross-package-evidence=${evidencePath}`,
    ]);

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /CROSS_PACKAGE_EVIDENCE_INVALID/);
    assert.equal(readFileSync(workspace.statusPath, 'utf8'), statusBefore);
  } finally {
    workspace.remove();
  }
});

test('C004 error: evidence naming a repair outside its baseline refuses before any write', () => {
  const workspace = materializeCompletionWorkspace({ rfcBodies: rfcBodiesWithApiMatch() });
  try {
    const statusBefore = readFileSync(workspace.statusPath, 'utf8');
    const evidencePath = writeCrossPackageEvidence(workspace.rfcDir, {
      findings: [],
      repairs: ['0000000000000000'],
    });

    const result = runCompletion(workspace.rfcDir, [
      '--cross-package',
      '--edited-package=pkg-0001',
      `--cross-package-evidence=${evidencePath}`,
    ]);

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /CROSS_PACKAGE_EVIDENCE_INVALID/);
    assert.equal(readFileSync(workspace.statusPath, 'utf8'), statusBefore);
  } finally {
    workspace.remove();
  }
});
