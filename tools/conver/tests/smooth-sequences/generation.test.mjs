// [::TICKET::] PX-285 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-285 --for-spec --no-implementation-order`.
// [::TICKET::] PX-281 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-281 --for-spec --no-implementation-order`.
/**
 * The generation history of a smooth-sequences run.
 *
 * The detector is a repeated gate: each pass must be comparable with the pass before it.
 * These tests pin the three outcomes — a new generation, a verification that writes
 * nothing, and a refusal that writes nothing — plus the archive and the legacy read.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { runCommand } from '../../.claude/scripts/smooth-sequences/run.mjs';
import { buildCheckSetRecord } from '../../.claude/scripts/smooth-sequences/lib/check-set.mjs';
import { buildReport, readPreviousReport, renderReportMarkdown } from '../../.claude/scripts/smooth-sequences/lib/report.mjs';
import { readStatus, writeGeneration } from '../../.claude/scripts/smooth-sequences/lib/generation.mjs';
import { collectDesignFiles, prepareDerivationRoot, snapshotDesignFiles } from '../../.claude/scripts/regeneration/lib/staging.mjs';
import { materializeSmoothWorkspace } from './helpers/workspace-fixture.mjs';

const QUIET = Object.freeze({ stdout: () => {}, stderr: () => {} });
const RUN_DIRECTORY = 'smooth-sequences';
const STATUS_INDENT = 2;

/** A report value the detector would produce for `findings`. */
// [::TICKET::] PX-281, PX-341 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-281|PX-341) --for-spec --no-implementation-order`.
function reportFor(root, findings = []) {
  return buildReport({ workspace: { root }, findings, withheld: [], checks: { run: 7, failed: findings.length } });
}

/** One finding the archive test carries. */
// [::TICKET::] PX-281, PX-341 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-281|PX-341) --for-spec --no-implementation-order`.
function finding(subject = 'subject') {
  return {
    checkId: 'S1.example',
    class: 'omission',
    subject,
    where: 'spec.md#1',
    producer: 'node "$(git rev-parse --show-toplevel)/.claude/scripts/smooth-sequences/run.mjs"',
    why: 'why',
    fix: 'fix',
  };
}

/** The bytes of one file, or null when it does not exist. */
// [::TICKET::] PX-281, PX-341 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-281|PX-341) --for-spec --no-implementation-order`.
function bytesOf(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

// @verifies C001
test('the first report opens generation 1 under the run directory', () => {
  const workspace = materializeSmoothWorkspace();
  try {
    const report = reportFor(workspace.root);
    const written = writeGeneration({
      root: workspace.root,
      report,
      inputDigest: 'input-1',
      exitCode: 0,
      now: '2026-10-20T00:00:00.000Z',
    });
    assert.equal(written.mode, 'new generation');
    assert.equal(written.generation, 1);

    const runDirectory = join(workspace.root, RUN_DIRECTORY);
    assert.ok(existsSync(join(runDirectory, 'SMOOTH-SEQUENCES.json')));
    assert.ok(existsSync(join(runDirectory, 'SMOOTH-SEQUENCES.md')));

    const status = JSON.parse(readFileSync(join(runDirectory, 'status.json'), 'utf8'));
    assert.equal(status.schemaVersion, 2);
    assert.equal(status.generation, 1);
    assert.equal(status.mode, 'new generation');
    assert.equal(status.measuredAt, '2026-10-20T00:00:00.000Z');
    assert.equal(status.inputDigest, 'input-1');
    assert.match(status.reportDigest, /^[0-9a-f]{64}$/);
    assert.deepEqual(status.verdict, { exitCode: 0, findings: 0, blocked: 0, withheld: 0, readings: 0 });
    assert.equal(existsSync(join(workspace.root, 'SMOOTH-SEQUENCES.json')), false);
  } finally {
    workspace.remove();
  }
});

// @verifies C002
test('an unchanged input digest and measurement is a verification that writes nothing', () => {
  const workspace = materializeSmoothWorkspace();
  try {
    const report = reportFor(workspace.root);
    writeGeneration({ root: workspace.root, report, inputDigest: 'same', exitCode: 0, now: 't1' });
    const runDirectory = join(workspace.root, RUN_DIRECTORY);
    const statusBefore = readFileSync(join(runDirectory, 'status.json'), 'utf8');
    const entriesBefore = readdirSync(runDirectory).sort();

    const second = writeGeneration({ root: workspace.root, report, inputDigest: 'same', exitCode: 0, now: 't2' });
    assert.equal(second.mode, 'verification');
    assert.equal(second.generation, 1);
    assert.equal(readFileSync(join(runDirectory, 'status.json'), 'utf8'), statusBefore);
    assert.deepEqual(readdirSync(runDirectory).sort(), entriesBefore);
    assert.equal(existsSync(join(runDirectory, 'archive')), false);
  } finally {
    workspace.remove();
  }
});

// @verifies C003
test('a changed input archives the current pair and writes the next generation', () => {
  const workspace = materializeSmoothWorkspace();
  try {
    writeGeneration({ root: workspace.root, report: reportFor(workspace.root), inputDigest: 'input-a', exitCode: 0, now: 't1' });
    const runDirectory = join(workspace.root, RUN_DIRECTORY);
    const archivedJson = bytesOf(join(runDirectory, 'SMOOTH-SEQUENCES.json'));
    const archivedMarkdown = bytesOf(join(runDirectory, 'SMOOTH-SEQUENCES.md'));

    const written = writeGeneration({
      root: workspace.root,
      report: reportFor(workspace.root, [finding()]),
      inputDigest: 'input-b',
      exitCode: 1,
      now: 't2',
    });
    assert.equal(written.mode, 'new generation');
    assert.equal(written.generation, 2);
    assert.equal(bytesOf(join(runDirectory, 'archive', '1', 'SMOOTH-SEQUENCES.json')), archivedJson);
    assert.equal(bytesOf(join(runDirectory, 'archive', '1', 'SMOOTH-SEQUENCES.md')), archivedMarkdown);

    const status = JSON.parse(readFileSync(join(runDirectory, 'status.json'), 'utf8'));
    assert.equal(status.generation, 2);
    assert.deepEqual(status.verdict, { exitCode: 1, findings: 1, blocked: 0, withheld: 0, readings: 0 });
  } finally {
    workspace.remove();
  }
});

// @verifies C001
test('an unreadable status or report is refused, never treated as no history', () => {
  const workspace = materializeSmoothWorkspace();
  const runDirectory = join(workspace.root, RUN_DIRECTORY);
  try {
    mkdirSync(runDirectory);
    writeFileSync(join(runDirectory, 'status.json'), '{not json');
    writeFileSync(join(runDirectory, 'SMOOTH-SEQUENCES.json'), '{not json');
    assert.throws(() => readStatus(workspace.root), /not valid JSON/);
    assert.throws(() => readPreviousReport(workspace.root), /not valid JSON/);

    unlinkSync(join(runDirectory, 'status.json'));
    unlinkSync(join(runDirectory, 'SMOOTH-SEQUENCES.json'));
    const written = writeGeneration({ root: workspace.root, report: reportFor(workspace.root), inputDigest: 'input-1', exitCode: 0, now: 't1' });
    assert.equal(written.generation, 1);
    assert.equal(readStatus(workspace.root).generation, 1);
  } finally {
    workspace.remove();
  }
});

// @verifies C006
test('the run directory is excluded from the design-file sets', () => {
  const workspace = materializeSmoothWorkspace();
  try {
    writeGeneration({ root: workspace.root, report: reportFor(workspace.root), inputDigest: 'input-1', exitCode: 0, now: 't1' });
    const reportPaths = collectDesignFiles(workspace.root);
    assert.equal(reportPaths.some((path) => path.startsWith(`${RUN_DIRECTORY}/`)), false, reportPaths.join(', '));
    const snapshotPaths = Object.keys(snapshotDesignFiles(workspace.root));
    assert.equal(snapshotPaths.some((path) => path.startsWith(`${RUN_DIRECTORY}/`)), false, snapshotPaths.join(', '));
  } finally {
    workspace.remove();
  }
});

// @verifies C005
test('readPreviousReport prefers the generation report over the legacy root report', () => {
  const workspace = materializeSmoothWorkspace();
  const runDirectory = join(workspace.root, RUN_DIRECTORY);
  try {
    mkdirSync(runDirectory);
    writeFileSync(join(runDirectory, 'SMOOTH-SEQUENCES.json'), JSON.stringify({ findings: [finding('generation-subject')] }, null, STATUS_INDENT));
    writeFileSync(join(workspace.root, 'SMOOTH-SEQUENCES.json'), JSON.stringify({ findings: [finding('legacy-subject')] }, null, STATUS_INDENT));
    assert.equal(readPreviousReport(workspace.root).findings[0].subject, 'generation-subject');

    rmSync(runDirectory, { recursive: true, force: true });
    assert.equal(readPreviousReport(workspace.root).findings[0].subject, 'legacy-subject');
  } finally {
    workspace.remove();
  }
});

// @verifies C005
test('a legacy root pair stays byte-identical when generation 1 is written', () => {
  const workspace = materializeSmoothWorkspace();
  const legacyPath = join(workspace.root, 'SMOOTH-SEQUENCES.json');
  try {
    const legacyBytes = `${JSON.stringify({ findings: [finding('legacy-subject')] }, null, STATUS_INDENT)}\n`;
    writeFileSync(legacyPath, legacyBytes);
    const written = writeGeneration({ root: workspace.root, report: reportFor(workspace.root), inputDigest: 'input-1', exitCode: 0, now: 't1' });

    assert.equal(written.generation, 1);
    assert.equal(readFileSync(legacyPath, 'utf8'), legacyBytes);
    assert.ok(existsSync(join(workspace.root, RUN_DIRECTORY, 'SMOOTH-SEQUENCES.json')));
  } finally {
    workspace.remove();
  }
});

// @verifies C006
test('a derivation root does not inherit the report history', () => {
  const workspace = materializeSmoothWorkspace();
  const stagingRoot = join(`${workspace.root}.regeneration`, 'tx-report-history');
  try {
    runCommand([workspace.root], QUIET);
    const liveGeneration = readStatus(workspace.root).generation;
    writeFileSync(join(workspace.root, 'spec.md'), '# fixture specification\n');
    try {
      prepareDerivationRoot({
        root: workspace.root,
        transactionId: 'tx-report-history',
        candidates: {
          specPath: join(workspace.root, 'spec.md'),
          treeDecisionsPath: join(workspace.root, 'absent-tree-decisions.json'),
          allocateDecisionsPath: join(workspace.root, 'absent-allocate-decisions.json'),
        },
      });
      assert.equal(existsSync(join(stagingRoot, RUN_DIRECTORY)), false);
      assert.equal(collectDesignFiles(stagingRoot).some((path) => path.startsWith(`${RUN_DIRECTORY}/`)), false);
      assert.equal(readStatus(workspace.root).generation, liveGeneration);
    } finally {
      rmSync(`${workspace.root}.regeneration`, { recursive: true, force: true });
    }
  } finally {
    workspace.remove();
  }
});

// @verifies C004
test('a refused run at exit 2 creates no run directory', () => {
  const workspace = materializeSmoothWorkspace();
  try {
    unlinkSync(workspace.artifactPath);
    const result = runCommand([workspace.root], QUIET);
    assert.equal(result.exitCode, 2);
    assert.equal(result.report, null);
    assert.equal(existsSync(join(workspace.root, RUN_DIRECTORY)), false);
    assert.equal(existsSync(join(workspace.root, 'SMOOTH-SEQUENCES.json')), false);
  } finally {
    workspace.remove();
  }
});

// PX-386 @verifies C002
// The calibration verdict is part of the run's evidence, so status.json carries the
// same notMeasured partition the report does.

test('PX-386 C002: status.json carries the calibration verdict and notMeasured', () => {
// [::TICKET::] PX-386 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-386 --for-spec --no-implementation-order`.
  const workspace = materializeSmoothWorkspace();
  try {
    const report = {
      ...reportFor(workspace.root),
      calibration: { verdict: { ok: true, notMeasured: ['S7.sequence-step-order'] } },
    };
    writeGeneration({
      root: workspace.root,
      report,
      inputDigest: 'input-calibration',
      exitCode: 0,
      now: '2026-10-20T00:00:00.000Z',
    });

    const status = JSON.parse(readFileSync(join(workspace.root, RUN_DIRECTORY, 'status.json'), 'utf8'));
    assert.deepEqual(status.calibration, { ok: true, notMeasured: ['S7.sequence-step-order'] });
  } finally {
    workspace.remove();
  }
});

// PX-389 @verifies C002
// A status written before the S8 and API gates reads as current unless the record names
// the check set that produced it. The digest is written beside the verdict, not inside it.

// [::TICKET::] PX-389 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-389 --for-spec --no-implementation-order`.
test('PX-389 C002: the report and status carry the check-set digest', () => {
  const workspace = materializeSmoothWorkspace();
  try {
    const checkSet = buildCheckSetRecord(undefined);
    const report = buildReport({
      workspace: { root: workspace.root },
      findings: [],
      withheld: [],
      checks: { run: 52, blocked: 0, failed: 0, families: 7 },
      checkSet,
    });

    assert.match(renderReportMarkdown(report), new RegExp(`check set: ${checkSet.digest.slice(0, 12)}`));

    writeGeneration({
      root: workspace.root,
      report,
      inputDigest: 'input-check-set',
      exitCode: 0,
      now: '2026-10-20T00:00:00.000Z',
      checkSet,
    });

    const status = JSON.parse(readFileSync(join(workspace.root, RUN_DIRECTORY, 'status.json'), 'utf8'));
    assert.equal(status.checkSetDigest, checkSet.digest);
    assert.equal(status.previousCheckSetDigest, null);
    assert.equal(status.checkSetStale, false);
  } finally {
    workspace.remove();
  }
});

// [::TICKET::] PX-389 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-389 --for-spec --no-implementation-order`.
test('PX-389 C002: a status without a digest is marked as a previous check set', () => {
  const workspace = materializeSmoothWorkspace();
  try {
    const checkSet = buildCheckSetRecord('a'.repeat(64));
    const report = buildReport({
      workspace: { root: workspace.root },
      findings: [],
      withheld: [],
      checks: { run: 52, blocked: 0, failed: 0, families: 7 },
      checkSet,
    });

    assert.match(renderReportMarkdown(report), new RegExp(`check set: ${checkSet.digest.slice(0, 12)}`));

    writeGeneration({
      root: workspace.root,
      report,
      inputDigest: 'input-previous-check-set',
      exitCode: 0,
      now: '2026-10-20T00:00:00.000Z',
      checkSet,
    });

    const status = JSON.parse(readFileSync(join(workspace.root, RUN_DIRECTORY, 'status.json'), 'utf8'));
    assert.equal(status.previousCheckSetDigest, 'a'.repeat(64));
    assert.equal(status.checkSetStale, true);
  } finally {
    workspace.remove();
  }
});
