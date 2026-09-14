// [::TICKET::] P22-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-2 --for-spec --no-implementation-order`.
/**
 * Isolation: ground truth reachable from a reverse-rotation target.
 *
 * A result the executor could have read out of the tree is not a result. This
 * suite pins the three properties that make the check usable:
 *   - it names every contaminated file, not a count (UT-6);
 *   - it never writes to the tree it inspects (UT-17);
 *   - a dependency's own README is reported separately from the project's
 *     answer key, because flagging it would make the check useless on any
 *     vendored project (measured: 5 vendored READMEs in the real subject).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  FORWARD_ROTATION_PATTERNS,
  GROUND_TRUTH_PATTERNS,
  renderIsolationReport,
  verifyIsolation,
} from '../../../.claude/scripts/workspacify-reverse/lib/isolation-check.mjs';
import { createSyntheticTree, hashTree } from '../helpers/scratch.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SUBJECT_ROOT = fileURLToPath(new URL('../../../siprs-for-reverse', import.meta.url));
const RUN_SCRIPT = fileURLToPath(new URL('../../../.claude/scripts/workspacify-reverse/run.mjs', import.meta.url));
const subjectAvailable = existsSync(SUBJECT_ROOT);

// --- UT-2: a clean root is clean ----------------------------------------------

test('UT-2: verifyIsolation returns clean for the real subject tree', { skip: !subjectAvailable }, () => {
  const result = verifyIsolation(SUBJECT_ROOT);
  assert.equal(result.clean, true, renderIsolationReport(result, SUBJECT_ROOT));
  assert.deepEqual(result.violations, []);
  assert.ok(result.filesScanned > 0);
});

test('C003 postcondition: every contamination pattern is declared with a kind a human can read', () => {
  assert.deepEqual(
    GROUND_TRUTH_PATTERNS.map((pattern) => pattern.kind).sort(),
    ['graph', 'readme', 'rfc-markdown', 'tickets'],
    'the contamination names are a declared constant, not an inline literal',
  );
  for (const pattern of GROUND_TRUTH_PATTERNS) {
    assert.equal(typeof pattern.description, 'string');
    assert.equal(typeof pattern.matches, 'function');
  }
  assert.equal(GROUND_TRUTH_PATTERNS.find((p) => p.kind === 'graph').matches('RFC-ROOT-Dirs-Tree.json.delta.json'), false);
  assert.equal(GROUND_TRUTH_PATTERNS.find((p) => p.kind === 'graph').matches('RFC-ROOT-GRAPH.json'), true);
});

// --- UT-6 / C003: planted ground truth is named -------------------------------

test('UT-6: ground truth planted inside the target root is reported by filename', () => {
  const tree = createSyntheticTree({
    'src/lib.rs': 'pub fn a() {}\n',
    'RFC-ROOT.md': '# planted\n',
    'nested/Tickets.json': '{}\n',
  });
  try {
    const result = verifyIsolation(tree.root);
    assert.equal(result.clean, false);
    assert.deepEqual(result.violations.map((violation) => violation.file), ['RFC-ROOT.md', 'nested/Tickets.json']);
    assert.ok(result.violations.every((violation) => typeof violation.kind === 'string'));
    assert.match(renderIsolationReport(result, tree.root), /RFC-ROOT\.md/);
  } finally {
    tree.dispose();
  }
});

test('UT-6 companion: every contamination name is detected, including a mid-tree graph file', () => {
  const tree = createSyntheticTree({
    'src/lib.rs': 'pub fn a() {}\n',
    'specs/Tickets.json': '{}\n',
    'docs/RFC-SEED.md': '# seed\n',
    'out/module-GRAPH.json': '{}\n',
    'README.md': '# readme\n',
  });
  try {
    const result = verifyIsolation(tree.root);
    assert.deepEqual(result.violations.map((violation) => violation.kind).sort(), [
      'graph',
      'readme',
      'rfc-markdown',
      'tickets',
    ]);
    assert.deepEqual(result.violations.map((violation) => violation.file).sort(), [
      'README.md',
      'docs/RFC-SEED.md',
      'out/module-GRAPH.json',
      'specs/Tickets.json',
    ]);
  } finally {
    tree.dispose();
  }
});

test('a dependency directory\'s own README is reported separately and is not a violation', () => {
  const tree = createSyntheticTree({
    'src/lib.rs': 'pub fn a() {}\n',
    'vendor/pjsip/README.md': '# vendored dependency\n',
    'vendor/pjsip/docs/RFC-1234.md': '# an IETF standard, not our design RFC\n',
  });
  try {
    const result = verifyIsolation(tree.root);
    assert.equal(result.clean, true, 'a vendored dependency is not the answer key');
    assert.deepEqual(result.violations, []);
    assert.deepEqual(result.dependencyMatches.map((match) => match.file), [
      'vendor/pjsip/README.md',
      'vendor/pjsip/docs/RFC-1234.md',
    ]);
  } finally {
    tree.dispose();
  }
});

// --- C003 precondition / UT-17: refusals and read-only ------------------------

test('C003 precondition: a target root that does not exist is refused by name', () => {
  const absent = `${PROJECT_ROOT}absent-root-does-not-exist`;
  assert.throws(
    () => verifyIsolation(absent),
    (error) => {
      assert.match(error.message, /absent-root-does-not-exist/);
      return true;
    },
  );
});

test('UT-17 / C003 invariant: the isolation check performs no write to the target root', () => {
  const tree = createSyntheticTree({
    'src/lib.rs': 'pub fn a() {}\n',
    'RFC-ROOT.md': '# planted\n',
    'nested/Tickets.json': '{}\n',
  });
  try {
    const before = hashTree(tree.root);
    const result = verifyIsolation(tree.root);
    assert.ok(result.violations.length > 0, 'the planted files must be seen, so the check really walked');
    assert.deepEqual(hashTree(tree.root), before);
  } finally {
    tree.dispose();
  }
});

test('UT-17 companion: the real subject tree is byte-identical after an isolation check', { skip: !subjectAvailable }, () => {
  const before = hashTree(SUBJECT_ROOT);
  verifyIsolation(SUBJECT_ROOT);
  assert.deepEqual(hashTree(SUBJECT_ROOT), before);
});

test('a holdout\'s own readme is its documentation; a forward-rotation artefact still fails it', () => {
  const tree = createSyntheticTree({
    'README.md': '# upstream docs\n',
    'src/lib.rs': 'pub fn a() {}\n',
  });
  try {
    // The four-shape vocabulary is for a target root a forward rotation
    // stripped, where the readme was derived from the RFC.
    const asTarget = verifyIsolation(tree.root);
    assert.equal(asTarget.clean, false);
    assert.deepEqual(asTarget.violations.map((entry) => entry.file), ['README.md']);

    // A holdout has not been forward rotated. Exempting only the readme must
    // not weaken the check: the artefacts a rotation leaves are all still
    // reported, and a rotated tree could not carry one without the others.
    const asHoldout = verifyIsolation(tree.root, { patterns: FORWARD_ROTATION_PATTERNS });
    assert.equal(asHoldout.clean, true, renderIsolationReport(asHoldout, tree.root));
    assert.deepEqual(asHoldout.violations, []);

    writeFileSync(`${tree.root}/Tickets.json`, '{}\n');
    const leaked = verifyIsolation(tree.root, { patterns: FORWARD_ROTATION_PATTERNS });
    assert.equal(leaked.clean, false, 'the ticket ledger is a forward-rotation artefact in any vocabulary');
    assert.deepEqual(leaked.violations.map((entry) => entry.file), ['Tickets.json']);
  } finally {
    tree.dispose();
  }
});

test('the narrower vocabulary drops only the readme', () => {
  const dropped = GROUND_TRUTH_PATTERNS.filter((pattern) => !FORWARD_ROTATION_PATTERNS.includes(pattern));
  assert.deepEqual(dropped.map((pattern) => pattern.kind), ['readme']);
  for (const pattern of FORWARD_ROTATION_PATTERNS) {
    assert.equal(typeof pattern.kind, 'string');
    assert.equal(typeof pattern.matches, 'function');
  }
});

// --- IT-1 / IT-2: the check through the CLI -----------------------------------

test('IT-1/IT-2: isolation exits 0 over a clean root and exits 1 naming planted ground truth', () => {
  const tree = createSyntheticTree({ 'src/lib.rs': 'pub fn a() {}\n' });
  try {
    const clean = spawnSync(process.execPath, [RUN_SCRIPT, 'holdout', 'isolation', tree.root], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });
    assert.equal(clean.status, 0, clean.stderr || clean.stdout);

    writeFileSync(`${tree.root}/Tickets.json`, '{}\n');
    const dirty = spawnSync(process.execPath, [RUN_SCRIPT, 'holdout', 'isolation', tree.root], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });
    assert.equal(dirty.status, 1, 'planted ground truth must exit non-zero');
    assert.match(dirty.stdout, /Tickets\.json/, 'the planted file must be named');
  } finally {
    tree.dispose();
  }
});

test('IT-1 companion: the target root is read from the positional, not from the value of --project-root', () => {
  const tree = createSyntheticTree({ 'src/lib.rs': 'pub fn a() {}\n' });
  try {
    writeFileSync(`${tree.root}/Tickets.json`, '{}\n');

    // Both forms are given, and they are different directories. The target is
    // the bare argument; `--project-root` names where the ledger lives and must
    // never be mistaken for what is being inspected.
    const run = spawnSync(
      process.execPath,
      [RUN_SCRIPT, 'holdout', 'isolation', '--project-root', PROJECT_ROOT, tree.root],
      { cwd: PROJECT_ROOT, encoding: 'utf8' },
    );

    assert.equal(run.status, 1, run.stderr || run.stdout);
    assert.match(run.stdout, /Tickets\.json/, 'the inspected tree must be the positional argument');
    assert.equal(run.stdout.includes(PROJECT_ROOT), false, 'the ledger root must not be inspected as the target');
  } finally {
    tree.dispose();
  }
});

test('an option written before the root is not mistaken for the root', () => {
  // `verify --json <tree>` puts a switch in the second token. Reading it as the
  // root would verify a directory that does not exist and report PASS, which is
  // the answer a broken invocation must never give.
  const tree = createSyntheticTree({ 'src/lib.rs': '// @verifies C001\npub fn a() {}\n' });
  try {
    writeFileSync(`${tree.root}/RFC-ROOT.md`, '# leaked\n');

    const run = spawnSync(process.execPath, [RUN_SCRIPT, 'verify', '--json', tree.root], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });
    assert.equal(run.status, 1, `the tree must be inspected, not a flag name: ${run.stdout}`);
    assert.equal(run.stdout.includes('PASS'), false, 'an uninspected tree must not be reported clean');
  } finally {
    tree.dispose();
  }
});

test('a switch after the isolation root does not consume it', () => {
  const tree = createSyntheticTree({ 'src/lib.rs': 'pub fn a() {}\n' });
  try {
    writeFileSync(`${tree.root}/Tickets.json`, '{}\n');

    const run = spawnSync(
      process.execPath,
      [RUN_SCRIPT, 'holdout', 'isolation', '--json', tree.root],
      { cwd: PROJECT_ROOT, encoding: 'utf8' },
    );
    assert.equal(run.status, 1, run.stderr || run.stdout);
    assert.match(run.stdout, /Tickets\.json/, 'the root must survive a switch that takes no value');
  } finally {
    tree.dispose();
  }
});

test('a subcommand that needs a root refuses to run without one', () => {
  // `detect` and `scrub` take a root. Before the holdout and oracle subcommands
  // were added the entry point required it for every subcommand, so an operator
  // who forgot it got the usage text and a non-zero exit. A report over
  // `undefined` reads as a clean tree, which is the one answer it must not give.
  for (const subcommand of ['detect', 'scrub']) {
    const run = spawnSync(process.execPath, [RUN_SCRIPT, subcommand], { cwd: PROJECT_ROOT, encoding: 'utf8' });
    assert.equal(run.status, 2, `${subcommand} without a root must exit 2, not report on nothing`);
    assert.match(run.stderr, /Usage:/);
    assert.doesNotMatch(run.stdout, /Target root not found/, `${subcommand} must not emit a report for an absent root`);
  }
});
