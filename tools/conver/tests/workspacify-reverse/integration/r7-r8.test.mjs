// @verifies C001
// @verifies C002
// @verifies C003
// [::TICKET::] P22-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-8 --for-spec --no-implementation-order`.
/**
 * R7 and R8 measured through the pipeline that runs them.
 *
 * The unit suites prove each module alone. These prove the wiring: that the two
 * stages are reached by the command line's `--through`, that the Markdown the
 * run publishes re-parses to the sidecar published beside it, and that the
 * claims the spec carries rest on evidence that is actually on disk at the
 * stated location. The forward-rotation gate is asserted here too, because
 * every later ticket runs it after its own step.
 *
 * The real-tree case is what can fail for a reason a synthetic fixture cannot
 * reproduce: a real crate's layout, four thousand claims, and an answer key the
 * comparison is finally run against. It is the last stage at which the whole
 * analysis meets that answer key, so the disagreement list it produces is the
 * one a human reads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ANALYSIS_STAGES, analyzeProject } from '../../../.claude/scripts/workspacify-reverse/lib/scope.mjs';
import { parseOriginSpec } from '../../../.claude/scripts/workspacify-reverse/lib/origin-spec.mjs';
import { CAPABILITY_DIMENSIONS } from '../../../.claude/scripts/workspacify-reverse/lib/capability-profile.mjs';
import { checkBaselines } from '../../../.claude/scripts/workspacify-reverse/lib/regression-gate.mjs';
import { KNOWN_DELTA_RELATIVE_PATH } from '../../../.claude/scripts/workspacify-reverse/lib/oracle-bundle.mjs';
import { NO_KNOWN_DELTA, reconcile } from '../../../.claude/scripts/workspacify-reverse/lib/reconcile.mjs';
import { createSyntheticTree } from '../helpers/scratch.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const REVERSE_ROOT = join(PROJECT_ROOT, 'siprs-for-reverse');
const targetAvailable = existsSync(REVERSE_ROOT);
const bundleAvailable = existsSync(join(PROJECT_ROOT, 'tests/workspacify-reverse/oracle/ORACLE-BUNDLE.json'));

/**
 * Where the integration runs stop.
 *
 * R8 is the last stage this ticket owns, and the stage list is asserted below
 * to still end there: a stage added later must be run by default, so a constant
 * that silently became a prefix would hide it.
 */
const THROUGH_R8 = 'r8';

/** A throwaway directory to publish into, so no test writes into the project. */
// [::TICKET::] P22-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-8 --for-spec --no-implementation-order`.
function scratchOutput() {
  const root = mkdtempSync(join(os.tmpdir(), 'wsp-r8-it-'));
  return { root, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

/**
 * A population carrying all three claim families.
 *
 * One boundary crossing, one asserted condition and one error return, so the
 * spec has to carry claims of more than one shape rather than a single one.
 */
const CLAIM_BEARING_TREE = Object.freeze({
  'src/api/login.rs': [
    'use crate::model::User;',
    '',
    'pub fn login(user: &User) -> Result<(), Error> {',
    '    assert!(!user.name.is_empty());',
    '    if user.name.len() > 64 {',
    '        return Err(Error::TooLong);',
    '    }',
    '    Ok(())',
    '}',
    '',
  ].join('\n'),
  'src/model.rs': [
    'pub struct User { pub name: String }',
    '',
  ].join('\n'),
});

test('IT-1: the stage list ends at R8, so a run without --through reaches it', () => {
  assert.equal(ANALYSIS_STAGES[ANALYSIS_STAGES.length - 1], THROUGH_R8);
  assert.equal(ANALYSIS_STAGES.includes('r7'), true, 'R7 must be a declared stage');
  assert.equal(ANALYSIS_STAGES.includes('r6.5'), true, 'the stages before it are unchanged');
});

test('IT-1: a full run publishes an origin spec whose Markdown re-parses to its sidecar', () => {
  const tree = createSyntheticTree(CLAIM_BEARING_TREE);
  const out = scratchOutput();
  try {
    analyzeProject({ root: tree.root, out: out.root, through: THROUGH_R8 });

    assert.equal(existsSync(join(out.root, 'ORIGIN-LONG-SPEC.json')), true);
    assert.equal(existsSync(join(out.root, 'ORIGIN-LONG-SPEC.md')), true);
    assert.equal(existsSync(join(out.root, 'CAPABILITY-PROFILE.json')), true);
    assert.equal(existsSync(join(out.root, 'ORIGIN-SPEC-CANDIDATE.json')), true);

    const sidecar = JSON.parse(readFileSync(join(out.root, 'ORIGIN-LONG-SPEC.json'), 'utf8'));
    const markdown = readFileSync(join(out.root, 'ORIGIN-LONG-SPEC.md'), 'utf8');

    assert.equal(sidecar.kind, 'origin-long-spec');
    assert.match(markdown, /^# /m, 'the published Markdown carries ATX headings');
    assert.deepEqual(parseOriginSpec(markdown), sidecar, 'the Markdown re-parses to the sidecar beside it');
  } finally {
    tree.dispose();
    out.dispose();
  }
});

test('IT-2: every observed claim in the output has evidence that exists at the stated location', () => {
  const tree = createSyntheticTree(CLAIM_BEARING_TREE);
  const out = scratchOutput();
  try {
    analyzeProject({ root: tree.root, out: out.root, through: THROUGH_R8 });
    const sidecar = JSON.parse(readFileSync(join(out.root, 'ORIGIN-LONG-SPEC.json'), 'utf8'));

    const observed = sidecar.claims.filter((claim) => claim.claim_type === 'observed');
    assert.ok(observed.length > 0, 'this population produces at least one observed claim');
    for (const claim of observed) {
      assert.ok(claim.evidence.length > 0);
      for (const item of claim.evidence) {
        const located = join(tree.root, item.source_span.file);
        assert.equal(existsSync(located), true, `${item.source_span.file} must exist`);
        assert.ok(
          readFileSync(located, 'utf8').split('\n').length >= item.source_span.line,
          `${item.source_span.file}:${item.source_span.line} must be a line the file actually has`,
        );
      }
    }
  } finally {
    tree.dispose();
    out.dispose();
  }
});

test('IT-3: every unresolved claim in the output carries a question', () => {
  const tree = createSyntheticTree(CLAIM_BEARING_TREE);
  const out = scratchOutput();
  try {
    analyzeProject({ root: tree.root, out: out.root, through: THROUGH_R8 });
    const sidecar = JSON.parse(readFileSync(join(out.root, 'ORIGIN-LONG-SPEC.json'), 'utf8'));

    for (const claim of sidecar.claims.filter((entry) => entry.claim_type === 'unresolved')) {
      assert.equal(typeof claim.grill_question, 'string');
      assert.ok(claim.grill_question.length > 0, 'an unresolved claim hands the grill a question');
    }
  } finally {
    tree.dispose();
    out.dispose();
  }
});

test('IT-1: the run publishes the profile in five dimensions with no eligibility verdict', () => {
  const tree = createSyntheticTree(CLAIM_BEARING_TREE);
  const out = scratchOutput();
  try {
    analyzeProject({ root: tree.root, out: out.root, through: THROUGH_R8 });
    const profile = JSON.parse(readFileSync(join(out.root, 'CAPABILITY-PROFILE.json'), 'utf8'));

    assert.deepEqual(Object.keys(profile.dimensions).sort(), [...CAPABILITY_DIMENSIONS].sort());
    assert.equal(JSON.stringify(profile).includes('eligible'), false);
    for (const name of CAPABILITY_DIMENSIONS) {
      assert.ok(profile.dimensions[name].can_prove.length > 0);
      assert.ok(profile.dimensions[name].cannot_prove.length > 0);
    }
  } finally {
    tree.dispose();
    out.dispose();
  }
});

test('IT-1: over the real experiment input, the origin spec re-parses to its sidecar', { skip: !targetAvailable }, () => {
  const out = scratchOutput();
  try {
    const outcome = analyzeProject({ root: REVERSE_ROOT, out: out.root, through: THROUGH_R8 });

    const sidecar = JSON.parse(readFileSync(join(out.root, 'ORIGIN-LONG-SPEC.json'), 'utf8'));
    const markdown = readFileSync(join(out.root, 'ORIGIN-LONG-SPEC.md'), 'utf8');

    assert.equal(sidecar.claims.length, outcome.ledger.claims.length);
    assert.ok(sidecar.claims.length > 1000, `expected the real population, found ${sidecar.claims.length}`);
    assert.deepEqual(parseOriginSpec(markdown), sidecar);
    assert.equal(
      sidecar.claims.filter((claim) => claim.claim_type === 'unresolved')
        .every((claim) => claim.grill_question.length > 0),
      true,
    );
  } finally {
    out.dispose();
  }
});

test('IT-5: the r8 comparison against the answer key names the differing headings', { skip: !bundleAvailable || !targetAvailable }, () => {
  const out = scratchOutput();
  try {
    analyzeProject({ root: REVERSE_ROOT, out: out.root, through: THROUGH_R8 });
    const knownDeltaPath = join(PROJECT_ROOT, KNOWN_DELTA_RELATIVE_PATH);
    const knownDelta = existsSync(knownDeltaPath) ? JSON.parse(readFileSync(knownDeltaPath, 'utf8')) : NO_KNOWN_DELTA;

    const result = reconcile({
      stage: 'r8',
      projectRoot: PROJECT_ROOT,
      candidatePath: join(out.root, 'ORIGIN-SPEC-CANDIDATE.json'),
      knownDelta,
    });

    assert.equal(result.stage, 'r8');
    assert.equal(Array.isArray(result.disagreements), true);
    assert.equal('score' in result, false, 'a comparison lists differences; it never scores');
    assert.equal('verdict' in result, false);
    for (const disagreement of result.disagreements) {
      assert.ok(disagreement.kind.length > 0);
      assert.ok(disagreement.name.length > 0, 'a disagreement names the heading it is about');
    }
  } finally {
    out.dispose();
  }
});

test('IT-4: the forward rotation still reproduces every frozen value', () => {
  const result = checkBaselines({ projectRoot: PROJECT_ROOT });
  assert.equal(result.verdict, 'proved', 'no backward step may change forward-rotation behaviour');
});
