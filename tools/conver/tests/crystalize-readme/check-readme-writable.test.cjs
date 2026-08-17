/**
 * check-readme-writable.test.cjs — Tests for check-readme-writable.js (Contract C002)
 *
 * C002-Pre: graph is schema-validated; check receives the derived paths.
 * C002-Post: returns (a) {branch:'README', reasons:[]} when all 4 conditions
 *   hold, or (b) {branch:'RESIDUE', reasons:[...]} otherwise.
 * C002-Inv: identical inputs yield the identical decision (deterministic).
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const SCRIPT = path.resolve(__dirname, '../../.claude/scripts/crystalize-readme/check-readme-writable.js');
const {
  evaluateWritableConditions,
  collectConditions,
  checkReadmeWritable,
  REASON_GRAPH_VERIFICATION,
  REASON_OMISSIONS,
  REASON_EXAMPLES,
  REASON_GRILL,
} = require(SCRIPT);

const {
  buildValidGraph,
  buildEmptyGraph,
  buildBrokenVerificationGraph,
  materializeFixture,
  rmrf,
} = require('./fixtures/helpers.cjs');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'px152-crw-'));

function makeFixture(name, graph, opts) {
  const dir = path.join(tmpRoot, name);
  return materializeFixture(dir, graph, opts);
}

after(() => rmrf(tmpRoot));

describe('evaluateWritableConditions — pure decision (C002)', () => {
  it('returns branch README with empty reasons when all 4 conditions hold (C002-Post)', () => {
    const decision = evaluateWritableConditions({
      graphVerificationOk: true,
      hasUnresolvedOmissions: false,
      hasExamples: true,
      grillApproved: true,
    });
    assert.deepEqual(decision, { branch: 'README', reasons: [] });
  });

  it('returns branch RESIDUE with graphVerificationFailed when verification fails', () => {
    const decision = evaluateWritableConditions({
      graphVerificationOk: false,
      hasUnresolvedOmissions: false,
      hasExamples: true,
      grillApproved: true,
    });
    assert.equal(decision.branch, 'RESIDUE');
    assert.ok(decision.reasons.includes(REASON_GRAPH_VERIFICATION));
  });

  it('returns unresolvedOmissions when an omissions JSON exists', () => {
    const decision = evaluateWritableConditions({
      graphVerificationOk: true,
      hasUnresolvedOmissions: true,
      hasExamples: true,
      grillApproved: true,
    });
    assert.ok(decision.reasons.includes(REASON_OMISSIONS));
  });

  it('returns missingExamples when examples are absent', () => {
    const decision = evaluateWritableConditions({
      graphVerificationOk: true,
      hasUnresolvedOmissions: false,
      hasExamples: false,
      grillApproved: true,
    });
    assert.ok(decision.reasons.includes(REASON_EXAMPLES));
  });

  it('returns grillInconsistent when grill approvals are missing', () => {
    const decision = evaluateWritableConditions({
      graphVerificationOk: true,
      hasUnresolvedOmissions: false,
      hasExamples: true,
      grillApproved: false,
    });
    assert.ok(decision.reasons.includes(REASON_GRILL));
  });

  it('is deterministic — identical inputs yield the identical decision (C002-Inv)', () => {
    const input = {
      graphVerificationOk: false,
      hasUnresolvedOmissions: true,
      hasExamples: false,
      grillApproved: false,
    };
    const first = evaluateWritableConditions(input);
    const second = evaluateWritableConditions(input);
    assert.deepStrictEqual(first, second);
  });

  it('lists every failing reason independently, not just the first', () => {
    const decision = evaluateWritableConditions({
      graphVerificationOk: false,
      hasUnresolvedOmissions: true,
      hasExamples: false,
      grillApproved: false,
    });
    assert.equal(decision.branch, 'RESIDUE');
    assert.deepEqual(
      new Set(decision.reasons),
      new Set([REASON_GRAPH_VERIFICATION, REASON_OMISSIONS, REASON_EXAMPLES, REASON_GRILL])
    );
  });
});

describe('collectConditions — real dependency wiring', () => {
  it('collects all-true conditions for a fully valid fixture', () => {
    const fx = makeFixture('valid', buildValidGraph(path.join(tmpRoot, 'valid', 'RFC-ROOT.md')));
    const conditions = collectConditions(fx.graphPath);
    assert.deepEqual(conditions, {
      graphVerificationOk: true,
      hasUnresolvedOmissions: false,
      hasExamples: true,
      grillApproved: true,
    });
  });

  it('detects unresolved omissions', () => {
    const fx = makeFixture('with-omissions', buildValidGraph(path.join(tmpRoot, 'with-omissions', 'RFC-ROOT.md')), {
      withOmissions: true,
    });
    const conditions = collectConditions(fx.graphPath);
    assert.equal(conditions.hasUnresolvedOmissions, true);
  });

  it('detects missing examples', () => {
    const fx = makeFixture('no-examples', buildValidGraph(path.join(tmpRoot, 'no-examples', 'RFC-ROOT.md')), {
      withExamples: false,
    });
    const conditions = collectConditions(fx.graphPath);
    assert.equal(conditions.hasExamples, false);
  });

  it('detects a missing grill status', () => {
    const fx = makeFixture('no-grill', buildValidGraph(path.join(tmpRoot, 'no-grill', 'RFC-ROOT.md')), {
      omitGrill: true,
    });
    const conditions = collectConditions(fx.graphPath);
    assert.equal(conditions.grillApproved, false);
  });

  it('detects a failed graph verification (isolated node)', () => {
    const fx = makeFixture('broken', buildBrokenVerificationGraph(path.join(tmpRoot, 'broken', 'RFC-ROOT.md')));
    const conditions = collectConditions(fx.graphPath);
    assert.equal(conditions.graphVerificationOk, false);
  });

  it('handles an empty graph without crashing', () => {
    const fx = makeFixture('empty', buildEmptyGraph(path.join(tmpRoot, 'empty', 'RFC-ROOT.md')), {
      withExamples: false,
      omitGrill: true,
    });
    const decision = checkReadmeWritable(fx.graphPath);
    assert.equal(decision.branch, 'RESIDUE');
    assert.ok(decision.reasons.includes(REASON_EXAMPLES));
    assert.ok(decision.reasons.includes(REASON_GRILL));
  });
});

describe('checkReadmeWritable + CLI', () => {
  it('returns branch README for a fully valid fixture', () => {
    const fx = makeFixture('valid2', buildValidGraph(path.join(tmpRoot, 'valid2', 'RFC-ROOT.md')));
    const decision = checkReadmeWritable(fx.graphPath);
    assert.equal(decision.branch, 'README');
    assert.deepEqual(decision.reasons, []);
  });

  it('CLI exits 0 for branch README and prints {branch, reasons}', () => {
    const fx = makeFixture('valid3', buildValidGraph(path.join(tmpRoot, 'valid3', 'RFC-ROOT.md')));
    const result = spawnSync('node', [SCRIPT, `--graph=${fx.graphPath}`], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    const out = JSON.parse(result.stdout);
    assert.equal(out.branch, 'README');
    assert.deepEqual(out.reasons, []);
  });

  it('CLI exits 1 for branch RESIDUE', () => {
    const fx = makeFixture('residue-cli', buildValidGraph(path.join(tmpRoot, 'residue-cli', 'RFC-ROOT.md')), {
      withOmissions: true,
    });
    const result = spawnSync('node', [SCRIPT, `--graph=${fx.graphPath}`], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    const out = JSON.parse(result.stdout);
    assert.equal(out.branch, 'RESIDUE');
    assert.ok(out.reasons.includes(REASON_OMISSIONS));
  });
});
