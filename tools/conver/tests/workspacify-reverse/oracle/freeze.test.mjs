// [::TICKET::] P22-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-2 --for-spec --no-implementation-order`.
/**
 * The frozen answer key.
 *
 * An answer key is a project taken through the forward rotation to RESIDUE 0, so
 * it holds what reverse rotation is trying to reconstruct. Modifying one
 * destroys every measurement ever taken against it, so this suite asserts
 * non-modification far more strictly than it asserts any count.
 *
 * **Every tree here is synthetic.** The experiment's own key,
 * `siprs-with-4layers`, has been deleted along with the subject it was paired
 * with, and the tests that measured it went with it. What is left is the
 * mechanism: the extraction, the drift refusal and the CLI round trip, all
 * exercised over trees this suite writes into a temporary directory.
 *
 * Writing is separated from reading: `freezeOracle` is pure, and only the CLI
 * and `writeOracleBundle` put anything on disk. No test writes into the
 * repository.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  freezeOracle,
  loadOracleBundle,
  writeOracleBundle,
} from '../../../.claude/scripts/workspacify-reverse/lib/oracle-bundle.mjs';
import { reconcile } from '../../../.claude/scripts/workspacify-reverse/lib/reconcile.mjs';
import { ORACLE_FIXTURE_FILES, createSyntheticOraclePair, writeSyntheticTree } from '../helpers/scratch.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const RUN_SCRIPT = fileURLToPath(new URL('../../../.claude/scripts/workspacify-reverse/run.mjs', import.meta.url));
const FROZEN_AT = '2026-09-10T00:00:00Z';

/**
 * Where a synthetic answer key sits inside a throwaway project root.
 *
 * The directory name carries no meaning of its own: `oracle freeze` is told the
 * root with `--oracle-root` and the bundle records it from there. It keeps a
 * temporary project looking like a project rather than like a bundle written
 * loose in a directory.
 */
const SYNTHETIC_ORACLE_DIRECTORY = 'synthetic-answer-key';

const ARTEFACT_NAMES = ['designHeaders', 'dirsTree', 'graph', 'omissions', 'rfcRoot', 'ticketMarkers', 'tickets', 'verifies'];

test('C004 postcondition: freezing a tree outside version control records that fact rather than guessing', () => {
  const { oracleRoot, dispose } = createSyntheticOraclePair();
  try {
    const bundle = freezeOracle({ oracleRoot, frozenAt: FROZEN_AT });
    assert.equal(bundle.source.control.isRepository, false);
    assert.equal(bundle.source.control.dirty, null);
    assert.ok(bundle.source.control.reason.length > 0);
  } finally {
    dispose();
  }
});

test('UT-8 / C004 invariant: a changed oracle is refused rather than compared against', () => {
  const { projectRoot, oracleRoot, dispose } = makeSyntheticOracleProject();
  try {
    writeOracleBundle({ projectRoot, bundle: freezeOracle({ oracleRoot, frozenAt: FROZEN_AT }) });
    writeFileSync(join(oracleRoot, 'omissions', 'OMISSIONS-1.json'), '{"changed":true}\n');

    const loaded = loadOracleBundle({ projectRoot });
    assert.ok(loaded.drifted.length > 0, 'drift is reported, not swallowed');

    const candidatePath = join(projectRoot, 'r5-candidate.json');
    writeFileSync(candidatePath, `${JSON.stringify({ stage: 'r5', entries: [] })}\n`);
    assert.throws(
      () => reconcile({ stage: 'r5', projectRoot, candidatePath }),
      (error) => {
        assert.match(error.message, /oracle/i);
        assert.match(error.message, /drift|changed/i);
        return true;
      },
    );
  } finally {
    dispose();
  }
});

test('UT-8 companion: loadOracleBundle recomputes every artefact and reports drift by name', () => {
  const { projectRoot, oracleRoot, dispose } = makeSyntheticOracleProject();
  try {
    writeOracleBundle({ projectRoot, bundle: freezeOracle({ oracleRoot, frozenAt: FROZEN_AT }) });

    const clean = loadOracleBundle({ projectRoot });
    assert.deepEqual(clean.drifted, []);
    assert.deepEqual(clean.recomputed.map((entry) => entry.name).sort(), ARTEFACT_NAMES);

    writeFileSync(join(oracleRoot, 'src', 'audio', 'mod.rs'), 'pub fn a() -> u8 { 99 }\n');
    const drifted = loadOracleBundle({ projectRoot });
    assert.ok(drifted.drifted.length > 0);
    assert.ok(drifted.drifted.some((entry) => entry.name === 'designHeaders' || entry.name === 'ticketMarkers'));
  } finally {
    dispose();
  }
});

test('IT-3: the oracle subcommand freezes and compares through the CLI', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'p22-2-cli-'));
  try {
    writeSyntheticTree(join(projectRoot, SYNTHETIC_ORACLE_DIRECTORY), ORACLE_FIXTURE_FILES);

    const freeze = spawnSync(
      process.execPath,
      [RUN_SCRIPT, 'oracle', 'freeze', '--project-root', projectRoot, '--oracle-root', join(projectRoot, SYNTHETIC_ORACLE_DIRECTORY)],
      { cwd: PROJECT_ROOT, encoding: 'utf8' },
    );
    assert.equal(freeze.status, 0, freeze.stderr || freeze.stdout);
    assert.match(freeze.stdout, /ORACLE-BUNDLE\.json/);

    const candidatePath = join(projectRoot, 'r3-candidate.json');
    writeFileSync(candidatePath, `${JSON.stringify({ stage: 'r3', corpus: { language: 'rust' }, entries: ['C900'] }, null, 2)}\n`);
    const compare = spawnSync(
      process.execPath,
      // The key is read where the bundle records it, so the comparison names the
      // project and nothing else.
      [RUN_SCRIPT, 'oracle', 'compare', '--stage', 'r3', '--candidate', candidatePath, '--project-root', projectRoot],
      { cwd: PROJECT_ROOT, encoding: 'utf8' },
    );
    assert.equal(compare.status, 0, compare.stderr || compare.stdout);
    assert.match(compare.stdout, /C001/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('C004 invariant companion: an annotation edited in place is drift, not a silent change', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'p22-2-verifies-'));
  try {
    const oracleRoot = join(projectRoot, SYNTHETIC_ORACLE_DIRECTORY);
    // A file carrying @verifies and nothing else, so the annotation is the only
    // thing that can change. Editing it in place keeps every file and line
    // number, so a signature over position alone cannot see it.
    writeSyntheticTree(oracleRoot, {
      ...ORACLE_FIXTURE_FILES,
      'tests/verify_spec_annotation_only.rs': '// @verifies C001\npub fn a() -> u8 { 1 }\n',
    });
    writeOracleBundle({ projectRoot, bundle: freezeOracle({ oracleRoot, frozenAt: FROZEN_AT }) });
    assert.deepEqual(loadOracleBundle({ projectRoot }).drifted, []);

    writeFileSync(join(oracleRoot, 'tests/verify_spec_annotation_only.rs'), '// @verifies C999\npub fn a() -> u8 { 1 }\n');

    const drifted = loadOracleBundle({ projectRoot }).drifted.map((entry) => entry.name);
    assert.ok(drifted.includes('verifies'), `the verifies artefact must drift, got: ${drifted.join(', ') || '(none)'}`);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('the bare oracle invocation reports usage rather than crashing', () => {
  // No action and no --project-root. The handler answers this with the usage
  // text; the parser must reach it instead of dereferencing an absent argument.
  const run = spawnSync(process.execPath, [RUN_SCRIPT, 'oracle'], { cwd: PROJECT_ROOT, encoding: 'utf8' });

  assert.doesNotMatch(run.stderr, /TypeError/, 'an argument list with no action must not crash the parser');
  assert.equal(run.status, 2, run.stderr || run.stdout);
  assert.match(run.stderr, /Usage:/);
});

/**
 * A throwaway project holding the synthetic oracle tree at the path the CLI
 * resolves it from, so the read path is exercised exactly as production sees it.
 */
function makeSyntheticOracleProject() {
  const projectRoot = mkdtempSync(join(tmpdir(), 'p22-2-oracle-'));
  const oracleRoot = join(projectRoot, SYNTHETIC_ORACLE_DIRECTORY);
  writeSyntheticTree(oracleRoot, ORACLE_FIXTURE_FILES);
  return { projectRoot, oracleRoot, dispose: () => rmSync(projectRoot, { recursive: true, force: true }) };
}
