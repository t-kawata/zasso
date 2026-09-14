// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
/**
 * The terminal state, measured against §2.3's inventory rather than against
 * whatever a run produced.
 *
 * The failure this guards is an observation that reports success because a
 * program exited 0. An exit code is evidence that a program finished; it is not
 * evidence that a structure is complete. So these tests assert the inventory
 * element by element, and they assert that a comparison reports its zeroes
 * rather than reporting a clean run — §2.4's rule that a difference of zero can
 * be a signal of abnormality rather than of health.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  LADDER_POSITIONS,
  TERMINAL_ARTEFACTS,
  compareTerminalStates,
  measureTerminalState,
  renderTerminalStateReport,
  summariseStages,
} from '../../../.claude/scripts/workspacify-reverse/lib/terminal-state.mjs';
import { createSyntheticTree } from '../helpers/scratch.mjs';

/** Every file a complete terminal tree holds, as a path-to-content map. */
// [::TICKET::] P24-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-8 --for-spec --no-implementation-order`.
function terminalFiles(packages) {
  const files = {};
  for (const name of [...TERMINAL_ARTEFACTS.root, ...TERMINAL_ARTEFACTS.fifthLayer]) {
    files[name] = '{}\n';
  }
  for (const pkg of packages) {
    files[`${pkg}/Tickets.json`] = '{}\n';
    for (const template of TERMINAL_ARTEFACTS.packageNamed) {
      files[`${pkg}/${template.replace('{package}', pkg)}`] = '{}\n';
    }
    for (const name of TERMINAL_ARTEFACTS.packageFifthLayer) files[`${pkg}/${name}`] = '# seed\n';
  }
  return files;
}

/** A complete terminal tree over the named packages. */
// [::TICKET::] P24-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-8 --for-spec --no-implementation-order`.
function terminalTree(packages) {
  return createSyntheticTree(terminalFiles(packages), { prefix: 'wsp-p24-8-' });
}

/** A measured state, as the comparison receives it. */
// [::TICKET::] P24-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-8 --for-spec --no-implementation-order`.
function stateFor(representative, packages, gates = {}) {
  const tree = terminalTree(packages);
  const state = { representative, ...measureTerminalState({ root: tree.root }) };
  state.gates = gates;
  return state;
}

/** The rendered report for one comparison, so two renderings can be compared. */
// [::TICKET::] P24-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-8 --for-spec --no-implementation-order`.
function rendered(comparison) {
  return renderTerminalStateReport({ states: [], comparison, ladder: { position: 'L0' } });
}

// ---------------------------------------------------------------------------
// C001 — the inventory
// ---------------------------------------------------------------------------

test('C001 postcondition — a complete tree satisfies every element of the declared inventory', () => {
  const tree = terminalTree(['auth', 'transport']);
  const measured = measureTerminalState({ root: tree.root });

  assert.deepEqual(measured.missing, []);
  assert.equal(measured.complete, true);
  assert.deepEqual(measured.packages, ['auth', 'transport']);
  assert.equal(TERMINAL_ARTEFACTS.root.includes('RFC-ROOT.md'), true);
  assert.equal(TERMINAL_ARTEFACTS.fifthLayer.includes('ARCHITECTURE-DELTA.json'), true);
  assert.equal(TERMINAL_ARTEFACTS.packageFifthLayer.includes('RFC-SEED.md'), true);
  assert.equal(TERMINAL_ARTEFACTS.packageNamed.includes('RFC-{package}-Dirs-Tree.json'), true);
  tree.dispose();
});

test('C001 invariant — the inventory is asserted against the declared list: a missing element is named with its scope', () => {
  const tree = terminalTree(['auth']);
  rmSync(join(tree.root, 'auth', 'RFC-SEED.md'));
  rmSync(join(tree.root, 'ARCHITECTURE-DELTA.json'));
  const measured = measureTerminalState({ root: tree.root });

  assert.equal(measured.complete, false, 'an exit code is not evidence that a structure is complete');
  assert.deepEqual(measured.missing, [
    { scope: 'root', artefact: 'ARCHITECTURE-DELTA.json' },
    { scope: 'auth', artefact: 'RFC-SEED.md' },
  ]);
  tree.dispose();
});

test('C001 boundary — a tree that never began the chain names every element rather than reporting an empty success', () => {
  const tree = createSyntheticTree({ 'README.md': '# nothing\n' }, { prefix: 'wsp-p24-8-bare-' });
  const measured = measureTerminalState({ root: tree.root });

  assert.equal(measured.complete, false);
  assert.deepEqual(measured.packages, []);
  assert.equal(measured.missing.length, TERMINAL_ARTEFACTS.root.length + TERMINAL_ARTEFACTS.fifthLayer.length);
  assert.equal(measured.prior, null, 'no prior partition was found');
  tree.dispose();
});

test('C001 postcondition — a tree that reached the fourth layer but not the fifth reports exactly the fifth layer missing', () => {
  const files = terminalFiles(['auth']);
  for (const name of TERMINAL_ARTEFACTS.fifthLayer) delete files[name];
  delete files['auth/RFC-SEED.md'];
  const tree = createSyntheticTree(files, { prefix: 'wsp-p24-8-fourth-' });
  const measured = measureTerminalState({ root: tree.root });

  assert.equal(measured.complete, false);
  assert.equal(measured.missing.every((entry) => TERMINAL_ARTEFACTS.fifthLayer.includes(entry.artefact) || entry.artefact === 'RFC-SEED.md'), true);
  tree.dispose();
});

// ---------------------------------------------------------------------------
// C002 — the comparison
// ---------------------------------------------------------------------------

test('C002 postcondition — the comparison reports the package paths, the artefact names and the gate outcomes per representative', () => {
  const comparison = compareTerminalStates([
    stateFor('siprs-for-reverse', ['auth', 'transport'], { G2: 'pass' }),
    stateFor('spec-only-project', ['auth'], { G2: 'fail' }),
  ]);

  assert.deepEqual(comparison.representatives, ['siprs-for-reverse', 'spec-only-project']);
  assert.deepEqual(comparison.packagePaths['siprs-for-reverse'], ['auth', 'transport']);
  assert.deepEqual(comparison.packagePaths['spec-only-project'], ['auth']);
  assert.equal(Array.isArray(comparison.artefactNames['spec-only-project']['auth']), true);
  assert.equal(comparison.gates['spec-only-project'].G2, 'fail');
  assert.equal(comparison.differences.some((entry) => entry.dimension === 'packagePaths'), true);
  assert.equal(comparison.differences.some((entry) => entry.dimension === 'gates' && entry.artefact === 'G2'), true);
  for (const difference of comparison.differences) {
    assert.equal(typeof difference.representative, 'string');
    assert.equal(typeof difference.artefact, 'string');
  }
});

test('C002 invariant — two identical structures are reported as agreeing, not as a clean run', () => {
  const identical = compareTerminalStates([stateFor('a', ['auth']), stateFor('b', ['auth'])]);

  assert.deepEqual(identical.differences, [], 'there is no difference');
  assert.equal(identical.reported.length > 0, true, 'a difference of zero is reported as a signal');
  for (const dimension of ['packagePaths', 'artefactNames']) {
    assert.ok(identical.reported.some((entry) => entry.dimension === dimension && entry.value === 0), `${dimension} is reported at zero`);
  }
  assert.match(rendered(identical), /agree/i);
  assert.match(rendered(identical), /signal rather than as health/i);
});

test('C002 invariant — an identical pair and a differing pair produce different reports', () => {
  const identical = compareTerminalStates([stateFor('a', ['auth']), stateFor('b', ['auth'])]);
  const differing = compareTerminalStates([stateFor('a', ['auth']), stateFor('b', ['auth', 'transport'])]);

  assert.notDeepEqual(rendered(identical), rendered(differing));
  assert.equal(differing.differences.length > 0, true);
  assert.match(rendered(differing), /recorded, not resolved/i);
  assert.match(rendered(differing), /not a contradiction/i);
});

// ---------------------------------------------------------------------------
// C004 — the vocabulary, and the ladder as a position
// ---------------------------------------------------------------------------

test('C004 postcondition — the outcome names the ladder position and states that the judgement is a human’s', () => {
  const report = renderTerminalStateReport({
    states: [],
    comparison: compareTerminalStates([]),
    ladder: { position: 'L2', residue: 'RESIDUE', omissionZero: { omissions: 0 } },
  });

  assert.match(report, /L2/);
  assert.match(report, /Only L3/i, 'the report states that only L3 may be called success');
  assert.match(report, /a human’s/i, 'the judgement is stated as a human’s');
  assert.match(report, /material/i, 'omission 0 is reported as material');
  assert.match(report, /not the success condition/i);
  assert.deepEqual([...LADDER_POSITIONS], ['L0', 'L1', 'L2', 'L2.5', 'L3']);
});

test('C004 invariant — no line claims success, and the only line naming it denies it', () => {
  const text = renderTerminalStateReport({
    states: [], comparison: compareTerminalStates([]), ladder: { position: 'L0' },
  });

  const claiming = text.split('\n').filter((line) => /\b(success|verdict|score|passed)\b/i.test(line));
  assert.equal(claiming.length, 1, 'only the caveat names the vocabulary, and it denies it');
  assert.match(claiming[0], /Only L3 may be called success/);
});

test('C004 invariant — a full-depth walk of the published record finds no verdict key', () => {
  const comparison = compareTerminalStates([stateFor('a', ['auth'])]);
  const published = JSON.parse(JSON.stringify({
    states: [{ representative: 'a', packages: ['auth'], missing: [] }], comparison, ladder: { position: 'L2' },
  }));

  const forbidden = ['success', 'verdict', 'score', 'passed'];
  const offenders = [];
// [::TICKET::] P24-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-8 --for-spec --no-implementation-order`.
  (function walk(value, path) {
    if (Array.isArray(value)) { value.forEach((entry, index) => walk(entry, path + '[' + index + ']')); return; }
    if (value === null || typeof value !== 'object') return;
    for (const key of Object.keys(value)) {
      if (forbidden.includes(key)) offenders.push(path + '.' + key);
      walk(value[key], path + '.' + key);
    }
  }(published, 'TERMINAL-STATE.json'));
  assert.deepEqual(offenders, []);
});

// ---------------------------------------------------------------------------
// The stage records
// ---------------------------------------------------------------------------

test('C001 error — a stage that refused is reported by name with its input rather than worked around', () => {
  const summary = summariseStages([
    { stage: 'r0', status: 'reached' },
    { stage: 'r5.5', status: 'refused', input: { reason: 'no TCE normaliser is declared for unknown' } },
  ]);

  assert.deepEqual(summary.reached, ['r0']);
  assert.equal(summary.refused.length, 1);
  assert.equal(summary.refused[0].stage, 'r5.5');
  assert.equal(summary.complete, false, 'a refused stage means the chain did not run to completion');
  const report = renderTerminalStateReport({ states: [], comparison: null, ladder: { position: 'L0' }, stages: summary });
  assert.match(report, /r5\.5/);
  assert.match(report, /refused/);
});

test('C001 boundary — a run whose stages were never recorded is not reported as complete', () => {
  assert.equal(summariseStages([]).complete, false, 'an empty record is not a complete chain');
  assert.equal(summariseStages([{ stage: 'r0', status: 'reached' }]).complete, true);
});

test('C001 — the report says a representative that never began carries a prior of none rather than a prior of zero packages', () => {
  const tree = createSyntheticTree({ 'README.md': '# nothing\n' }, { prefix: 'wsp-p24-8-prior-' });
  const measured = measureTerminalState({ root: tree.root, manifest: null });

  assert.equal(measured.prior, null);
  assert.equal(measured.manifestPresent, false);
  mkdirSync(join(tree.root, 'docs'), { recursive: true });
  writeFileSync(join(tree.root, 'docs', 'Tickets.json'), '{}\n', 'utf8');
  assert.equal(measureTerminalState({ root: tree.root }).manifestPresent, false, 'a nested Tickets.json is not the manifest');
  tree.dispose();
});
