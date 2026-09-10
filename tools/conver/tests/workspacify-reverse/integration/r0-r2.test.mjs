// @verifies C001
// @verifies C002
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
/**
 * R0-R2.5 measured against the real experiment input.
 *
 * The subject is `siprs-for-reverse`: the project the reverse rotation is
 * actually run against. These tests are the ones that can fail for a reason
 * the synthetic fixtures cannot reproduce — a real crate's layout, a real
 * vendored dependency tree, and the fact that the target sits inside another
 * repository's work tree.
 *
 * The forward-rotation gate is asserted here too, because every later ticket
 * runs it after its own step and this is where a regression first becomes
 * visible.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { analyzeProject, classifyArtefacts, resolveScope } from '../../../.claude/scripts/workspacify-reverse/lib/scope.mjs';
import { checkBaselines } from '../../../.claude/scripts/workspacify-reverse/lib/regression-gate.mjs';
import { hashTree } from '../helpers/scratch.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const REVERSE_ROOT = join(PROJECT_ROOT, 'siprs-for-reverse');
const targetAvailable = existsSync(REVERSE_ROOT);

/**
 * Where these integration runs stop.
 *
 * `analyzeProject` defaults to the last declared stage, as the command line
 * always has. These tests measure the R0 to R2.5 boundary over the real
 * experiment input, so they name where they stop rather than inheriting a
 * default that moves whenever a stage is added.
 */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
const THROUGH_R2_5 = 'r2.5';

/** A throwaway directory to publish into, so no test writes into the project. */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function scratchOutput() {
  const root = mkdtempSync(join(os.tmpdir(), 'wsp-r0r2-it-'));
  return { root, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

test('IT-1 a full run over the experiment input produces a scope file and a structure report', { skip: !targetAvailable }, () => {
  const out = scratchOutput();
  const outcome = analyzeProject({ root: REVERSE_ROOT, out: out.root , through: THROUGH_R2_5 });

  assert.ok(existsSync(join(out.root, 'ANALYSIS-SCOPE.json')));
  assert.ok(existsSync(join(out.root, 'SCOPE-BOUNDARY.json')));
  assert.ok(existsSync(join(out.root, 'STRUCTURE.json')));
  assert.ok(existsSync(join(out.root, 'EXECUTION-SURFACE.json')));

  assert.ok(outcome.structure.coverage.files_parsed > 0, 'the crate must actually parse');
  assert.ok(outcome.structure.packages.length > 0);
  assert.ok(outcome.dependencies.edges.length > 0, 'a real crate has real module edges');
  assert.ok(outcome.surface.mechanisms.length > 0, 'the crate carries dynamic mechanisms');
  out.dispose();
});

test('IT-1 the artefact set matches the measured tree in both directions', { skip: !targetAvailable }, () => {
  const boundary = classifyArtefacts({ root: REVERSE_ROOT, scope: resolveScope(REVERSE_ROOT) });
  const recorded = new Set(boundary.artefacts.map((artefact) => artefact.path));

  // Direction one: nothing that exists in the tree is missing from the record.
  const missing = hashTree(REVERSE_ROOT);
  for (const path of Object.keys(missing)) {
    assert.ok(recorded.has(path), `${path} exists in the tree but is missing from the artefact record`);
  }
  // Direction two: nothing is recorded that does not exist.
  for (const path of recorded) {
    assert.ok(existsSync(join(REVERSE_ROOT, path)), `${path} is recorded but does not exist in the tree`);
  }
});

test('IT-1 the measured tree is the one the ticket names', { skip: !targetAvailable }, () => {
  const boundary = classifyArtefacts({ root: REVERSE_ROOT, scope: resolveScope(REVERSE_ROOT) });
  const rustSources = boundary.artefacts.filter(
    (artefact) => artefact.path.endsWith('.rs') && artefact.coverage === 'in_scope',
  );
  assert.equal(rustSources.length, 150, 'the ticket fixes the input at 150 .rs files outside target/');

  const vendored = boundary.artefacts.filter((artefact) => artefact.path.startsWith('vendor/'));
  assert.ok(vendored.length > 0, 'vendor/ is present and must be excluded, not ignored');
  for (const artefact of vendored) assert.equal(artefact.coverage, 'out_of_scope');

  const tests = boundary.artefacts.filter(
    (artefact) => artefact.path.startsWith('tests/') && artefact.path.endsWith('.rs'),
  );
  assert.equal(tests.length, 16, 'ten renamed verify_spec_<hash>.rs files and six originals');
  for (const artefact of tests) assert.equal(artefact.kind, 'test');
});

test('IT-1 the crate root is not mistaken for its own repository', { skip: !targetAvailable }, () => {
  const scope = resolveScope(REVERSE_ROOT);
  assert.equal(scope.target_commit.is_own_repository, false);
  assert.match(scope.target_commit.reason, /work tree|not.{0,20}its own/i);
  assert.ok(scope.target_commit.path_within_work_tree.endsWith('siprs-for-reverse'));
});

test('IT-3 the target tree hash is unchanged by the run', { skip: !targetAvailable }, () => {
  const out = scratchOutput();
  const before = hashTree(REVERSE_ROOT);
  analyzeProject({ root: REVERSE_ROOT, out: out.root , through: THROUGH_R2_5 });
  assert.deepEqual(hashTree(REVERSE_ROOT), before, 'the analysis must leave the target byte-identical');
  out.dispose();
});

test('IT-3 the run records the target digest it took, before and after', { skip: !targetAvailable }, () => {
  const out = scratchOutput();
  analyzeProject({ root: REVERSE_ROOT, out: out.root , through: THROUGH_R2_5 });
  const scope = JSON.parse(readFileSync(join(out.root, 'ANALYSIS-SCOPE.json'), 'utf8'));
  assert.ok(scope.target_digest.sha256.length === 64);
  assert.equal(scope.target_digest.unmodified, true);
  out.dispose();
});

test('IT-2 the forward rotation still reproduces every frozen value', () => {
  const result = checkBaselines({ projectRoot: PROJECT_ROOT });
  assert.equal(result.verdict, 'proved', 'no backward step may change forward-rotation behaviour');
});
