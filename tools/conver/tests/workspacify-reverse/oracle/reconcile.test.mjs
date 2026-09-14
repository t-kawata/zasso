// [::TICKET::] P22-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-2 --for-spec --no-implementation-order`.
/**
 * Reconciliation: the answer key against a stage's output.
 *
 * Four properties decide whether this instrument is worth having.
 *   - It names what differs, never a score (UT-19, C005 invariant).
 *   - A region the analysis never looked at is neither agreement nor
 *     disagreement, and must not be summed into either (UT-14).
 *   - A run the chosen stack could not semantically resolve says so, and says
 *     it beside every disagreement it produced (UT-15).
 *   - Zero disagreements is a contamination signal, not a clean result (UT-13).
 *
 * The refusal paths run against a synthetic oracle tree; the real answer key is
 * never written to by this suite.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  ANALYSIS_MODE_RANK,
  DISAGREEMENT_KINDS,
  STAGE_ORACLE_STAGES,
  analysisModeFor,
  reconcile,
  renderReconciliation,
} from '../../../.claude/scripts/workspacify-reverse/lib/reconcile.mjs';
import { ORACLE_TREE_RELATIVE_PATH, freezeOracle, writeOracleBundle } from '../../../.claude/scripts/workspacify-reverse/lib/oracle-bundle.mjs';
import { ORACLE_FIXTURE_FILES, writeSyntheticTree } from '../helpers/scratch.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const RUN_SCRIPT = fileURLToPath(new URL('../../../.claude/scripts/workspacify-reverse/run.mjs', import.meta.url));
const FROZEN_AT = '2026-09-10T00:00:00Z';
const RESULT_KEYS = ['candidatePath', 'disagreements', 'expected', 'findings', 'oracleSha256', 'stage', 'unobserved'];

/** A throwaway project holding the synthetic oracle tree and its frozen bundle. */
function makeOracleProject() {
  const projectRoot = mkdtempSync(join(tmpdir(), 'p22-2-reconcile-'));
  const oracleRoot = join(projectRoot, ORACLE_TREE_RELATIVE_PATH);
  writeSyntheticTree(oracleRoot, ORACLE_FIXTURE_FILES);
  writeOracleBundle({ projectRoot, bundle: freezeOracle({ oracleRoot, frozenAt: FROZEN_AT }) });
  return { projectRoot, oracleRoot, dispose: () => rmSync(projectRoot, { recursive: true, force: true }) };
}

/** Write a candidate document for a stage and return its path. */
function writeCandidate(projectRoot, name, document) {
  const full = join(projectRoot, name);
  writeFileSync(full, `${JSON.stringify(document, null, 2)}\n`);
  return full;
}

// --- UT-19 / C005 invariant: a list, never a score -------------------------------

test('UT-19: reconcile returns disagreements each tagged with a kind, and carries no score', () => {
  const project = makeOracleProject();
  try {
    const candidatePath = writeCandidate(project.projectRoot, 'r3.json', {
      stage: 'r3',
      corpus: { language: 'rust' },
      entries: ['C001', 'C900', 'C901'],
    });
    const result = reconcile({ stage: 'r3', projectRoot: project.projectRoot, candidatePath });

    assert.ok(result.disagreements.length > 0);
    for (const disagreement of result.disagreements) {
      assert.ok(
        Object.values(DISAGREEMENT_KINDS).includes(disagreement.kind),
        `${disagreement.name} must carry a declared kind, got ${disagreement.kind}`,
      );
      assert.equal(typeof disagreement.name, 'string');
      assert.equal(typeof disagreement.analysisMode, 'string');
    }
    assert.deepEqual(Object.keys(result).sort(), RESULT_KEYS);
    assert.equal(/"(score|ratio|grade|verdict|accuracy|passed|failed)"/.test(JSON.stringify(result)), false);
    assert.equal(/\b(succeeded|failed|passed)\b/i.test(JSON.stringify(result)), false);
  } finally {
    project.dispose();
  }
});

test('UT-19 companion: two entries naming the same thing differently is a divergence, not agreement', () => {
  const project = makeOracleProject();
  try {
    // The oracle records N0001 as "Purpose". A candidate that grounds N0001 on
    // something else has not agreed with the answer key and has not omitted it:
    // it found the node and attached the wrong meaning to it.
    const candidatePath = writeCandidate(project.projectRoot, 'grounding.json', {
      stage: 'grounding',
      corpus: { language: 'rust' },
      entries: [
        { name: 'N0001', value: 'Something else entirely' },
        { name: 'N0002', value: 'Scope' },
      ],
    });
    const result = reconcile({ stage: 'grounding', projectRoot: project.projectRoot, candidatePath });

    const divergent = result.disagreements.filter((entry) => entry.kind === DISAGREEMENT_KINDS.divergent);
    assert.equal(divergent.length, 1, 'exactly the mismatched entry must diverge');
    assert.equal(divergent[0].name, 'N0001');
    assert.ok(
      Object.keys(ANALYSIS_MODE_RANK).includes(divergent[0].analysisMode),
      'a divergence carries the mode that produced it',
    );
    assert.match(divergent[0].evidence, /Purpose/, 'the evidence must quote what the answer key holds');
    assert.match(renderReconciliation(result), /N0001/);

    // N0002 agrees on both name and value, so nothing is reported for it.
    assert.equal(result.disagreements.some((entry) => entry.name === 'N0002'), false);
  } finally {
    project.dispose();
  }
});

test('a candidate whose entries are not a list is refused rather than read as characters', () => {
  const project = makeOracleProject();
  try {
    // `"entries": "C001"` is a plausible authoring mistake. Spreading it into
    // ['C','0','0','1'] would report four disagreements that name nothing.
    const candidatePath = writeCandidate(project.projectRoot, 'string-entries.json', {
      stage: 'r3',
      corpus: { language: 'rust' },
      entries: 'C001',
    });
    assert.throws(
      () => reconcile({ stage: 'r3', projectRoot: project.projectRoot, candidatePath }),
      (error) => {
        assert.match(error.message, /entries/);
        assert.match(error.message, /list|array/i);
        return true;
      },
    );
  } finally {
    project.dispose();
  }
});

test('an unobserved value that is not a list is refused rather than reaching the renderer', () => {
  const project = makeOracleProject();
  try {
    const candidatePath = writeCandidate(project.projectRoot, 'bad-unobserved.json', {
      stage: 'r2',
      corpus: { language: 'rust' },
      entries: [],
      unobserved: 'none',
    });
    assert.throws(
      () => reconcile({ stage: 'r2', projectRoot: project.projectRoot, candidatePath }),
      (error) => {
        assert.match(error.message, /unobserved/);
        assert.match(error.message, /list|array/i);
        return true;
      },
    );
  } finally {
    project.dispose();
  }
});

test('C005 postcondition: the disagreement list names the specific entries that differ', () => {
  const project = makeOracleProject();
  try {
    const candidatePath = writeCandidate(project.projectRoot, 'r3.json', {
      stage: 'r3',
      corpus: { language: 'rust' },
      entries: ['C001', 'C900'],
    });
    const result = reconcile({ stage: 'r3', projectRoot: project.projectRoot, candidatePath });

    const byName = Object.fromEntries(result.disagreements.map((entry) => [entry.name, entry.kind]));
    assert.equal(byName['C002'], DISAGREEMENT_KINDS.missingFromAnalysis);
    assert.equal(byName['C900'], DISAGREEMENT_KINDS.extraInAnalysis);
    assert.equal(byName['C001'], undefined, 'an entry that matches is not a disagreement');

    const report = renderReconciliation(result);
    assert.match(report, /C002/);
    assert.match(report, /C900/);
  } finally {
    project.dispose();
  }
});

test('C005 precondition: an unknown stage is refused and the declared stages are named', () => {
  const project = makeOracleProject();
  try {
    const candidatePath = writeCandidate(project.projectRoot, 'r99.json', { stage: 'r99', entries: [] });
    assert.throws(
      () => reconcile({ stage: 'r99', projectRoot: project.projectRoot, candidatePath }),
      (error) => {
        assert.match(error.message, /r99/);
        for (const stage of STAGE_ORACLE_STAGES.map((row) => row.stage)) {
          assert.match(error.message, new RegExp(stage));
        }
        return true;
      },
    );
  } finally {
    project.dispose();
  }
});

test('the stage-to-oracle mapping is a declared table, so a stage is added by adding a row', () => {
  assert.deepEqual(
    STAGE_ORACLE_STAGES.map((row) => row.stage).sort(),
    ['grounding', 'headers', 'mapping', 'partition', 'r1', 'r2', 'r3', 'r5', 'r6', 'r8'],
  );
  for (const row of STAGE_ORACLE_STAGES) {
    assert.equal(typeof row.artefact, 'string');
    assert.equal(typeof row.unit, 'string');
    assert.equal(typeof row.question, 'string');
  }
  assert.equal(STAGE_ORACLE_STAGES.find((row) => row.stage === 'r3').artefact, 'verifies');
  assert.equal(STAGE_ORACLE_STAGES.find((row) => row.stage === 'r6').artefact, 'ticketMarkers');
});

// --- UT-13: zero disagreements is a finding, not agreement ------------------------

test('UT-13: zero disagreements is reported as a finding requiring scrutiny', () => {
  const project = makeOracleProject();
  try {
    const candidatePath = writeCandidate(project.projectRoot, 'r3.json', {
      stage: 'r3',
      corpus: { language: 'rust' },
      entries: ['C001', 'C002'],
    });
    const result = reconcile({ stage: 'r3', projectRoot: project.projectRoot, candidatePath });

    assert.deepEqual(result.disagreements, []);
    assert.ok(result.findings.some((finding) => finding.id === 'zero-disagreement'));
    const report = renderReconciliation(result);
    assert.match(report, /scrutin|contaminat/i);
    assert.equal(/"(score|ratio|grade|verdict)"/.test(JSON.stringify(result)), false);
  } finally {
    project.dispose();
  }
});

// --- UT-14: unobserved is a first-class entry ------------------------------------

test('UT-14: a region the analysis never looked at is reported with its kind, phase and reason', () => {
  const project = makeOracleProject();
  try {
    const candidatePath = writeCandidate(project.projectRoot, 'r2.json', {
      stage: 'r2',
      corpus: { language: 'rust' },
      entries: [],
      unobserved: [
        {
          region: 'src/audio/media_path_wiring.rs',
          stoppedAtPhase: 'R2',
          reason: 'the parser could not resolve the macro-generated module boundary',
        },
      ],
    });
    const result = reconcile({ stage: 'r2', projectRoot: project.projectRoot, candidatePath });

    assert.equal(result.unobserved.length, 1);
    const entry = result.unobserved[0];
    assert.deepEqual(Object.keys(entry).sort(), ['kind', 'reason', 'region', 'stoppedAtPhase']);
    assert.equal(entry.kind, DISAGREEMENT_KINDS.unobserved);
    assert.equal(entry.region, 'src/audio/media_path_wiring.rs');
    assert.equal(entry.stoppedAtPhase, 'R2');
    assert.ok(entry.reason.length > 0);

    assert.equal(
      result.disagreements.some((disagreement) => disagreement.name === entry.region),
      false,
      'an unobserved region is neither agreement nor disagreement',
    );

    const report = renderReconciliation(result);
    assert.match(report, /media_path_wiring\.rs/);
    assert.match(report, /R2/);
    assert.equal(report.includes('no disagreement found'), false);
    assert.equal(/unobserved[^\n]*0\b/i.test(report), false);
  } finally {
    project.dispose();
  }
});

test('UT-14 companion: an unobserved region is never rendered as an empty result', () => {
  const project = makeOracleProject();
  try {
    const candidatePath = writeCandidate(project.projectRoot, 'r2.json', {
      stage: 'r2',
      corpus: { language: 'rust' },
      entries: ['src', 'src/audio'],
      unobserved: [{ region: 'src/audio', stoppedAtPhase: 'R1', reason: 'unreadable' }],
    });
    const result = reconcile({ stage: 'r2', projectRoot: project.projectRoot, candidatePath });
    const report = renderReconciliation(result);
    assert.match(report, /## Unobserved/);
    assert.match(report, /unreadable/);
  } finally {
    project.dispose();
  }
});

// --- UT-15: the analysis mode ladder ---------------------------------------------

test('UT-15: a corpus the stack cannot semantically resolve emits a lower analysis_mode', () => {
  const rustCorpus = { language: 'rust' };
  const pythonCorpus = { language: 'python' };
  const rustStack = { languages: ['rust'] };

  const resolved = analysisModeFor({ corpus: rustCorpus, stack: rustStack });
  const degraded = analysisModeFor({ corpus: pythonCorpus, stack: rustStack });
  assert.equal(resolved, 'build_semantic');
  assert.equal(degraded, 'source_static');
  assert.ok(ANALYSIS_MODE_RANK[degraded] < ANALYSIS_MODE_RANK[resolved]);
});

test('UT-15 companion: the reconciliation carries that mode beside every disagreement it produced', () => {
  const project = makeOracleProject();
  try {
    const candidatePath = writeCandidate(project.projectRoot, 'r3.json', {
      stage: 'r3',
      corpus: { language: 'python' },
      entries: ['C900'],
    });
    const result = reconcile({
      stage: 'r3',
      projectRoot: project.projectRoot,
      candidatePath,
      stack: { languages: ['rust'] },
    });
    assert.ok(result.disagreements.length > 0);
    for (const disagreement of result.disagreements) {
      assert.equal(disagreement.analysisMode, 'source_static');
    }
  } finally {
    project.dispose();
  }
});

// --- Known differences are labelled, never emitted as findings -------------------

test('a known rename is labelled expected rather than emitted as a disagreement', () => {
  const project = makeOracleProject();
  try {
    const knownDelta = {
      measuredNotAssumed: true,
      expectedDifferences: [
        { name: 'verify_spec_4b35a676', oracleName: 'verify_spec_p0_1', kind: 'renamed-test-file', evidence: 'Cargo.toml line alignment' },
        { name: 'verify_spec_26d77120', oracleName: 'verify_spec_p7_3', kind: 'renamed-test-file', evidence: 'comment-stripped identity' },
        { name: 'purpose_scope_remains_audio_only', oracleName: null, kind: 'removed-test-function', evidence: 'read RFC-ROOT.md' },
      ],
    };
    const candidatePath = writeCandidate(project.projectRoot, 'r6.json', {
      stage: 'r6',
      corpus: { language: 'rust' },
      entries: ['verify_feature', 'verify_spec_4b35a676', 'verify_spec_26d77120', 'purpose_scope_remains_audio_only'],
    });
    const result = reconcile({ stage: 'r6', projectRoot: project.projectRoot, candidatePath, knownDelta });

    assert.deepEqual(result.disagreements, [], 'a known difference is never presented to a human as a finding');
    assert.equal(result.expected.length, 3);
    for (const entry of result.expected) assert.ok(entry.evidence.length > 0);
    assert.match(renderReconciliation(result), /expected/i);
  } finally {
    project.dispose();
  }
});

// --- IT-5: the comparison through the CLI ----------------------------------------

test('IT-5: oracle compare names the contracts that differ rather than reporting a number', () => {
  const project = makeOracleProject();
  try {
    const candidatePath = writeCandidate(project.projectRoot, 'r3.json', {
      stage: 'r3',
      corpus: { language: 'rust' },
      entries: ['C002', 'C900'],
    });
    const run = spawnSync(
      process.execPath,
      [RUN_SCRIPT, 'oracle', 'compare', '--stage', 'r3', '--candidate', candidatePath, '--project-root', project.projectRoot],
      { cwd: PROJECT_ROOT, encoding: 'utf8' },
    );
    assert.equal(run.status, 0, run.stderr || run.stdout);
    assert.match(run.stdout, /C001/, 'the contract the analysis missed must be named');
    assert.match(run.stdout, /C900/, 'the contract the analysis invented must be named');
    assert.equal(/\d+(\.\d+)?\s*%/.test(run.stdout), false, 'a percentage would be the grade this design rejects');
    assert.equal(/\b(accuracy|score|precision|recall)\b/i.test(run.stdout), false);
  } finally {
    project.dispose();
  }
});
