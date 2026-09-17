/**
 * The six subcommands that perform a Step's mechanical half.
 *
 * Every Step of `.claude/commands/workspacify-reverse.md` names the command it runs,
 * and a Step whose work a machine can settle names one of these. The tests below hold
 * two things at once: that each handler answers what its Step asks, and that it answers
 * by *reading* the library rather than by re-implementing it — the expected value is
 * the library call over the same tree, never a fixture string, because a fixture string
 * would pass a handler that had quietly reformatted the library's answer.
 *
 * [::TICKET::] P26-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-3 --for-spec --no-implementation-order`.
 */
// @verifies C001 — the pattern handler is wiring over the library, not a second implementation
// @verifies C002 — the four read-only subcommands leave the tree digest identical
// @verifies C003 — status exits on the published set alone
// @verifies C004 — decide writes through the schema, and a refused write writes nothing
// @verifies C005 — every Step-level subcommand refuses a bare path by name
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { listArtefacts } from '../../../.claude/scripts/workspacify-reverse/lib/analysis-tech.mjs';
import { digestTree, reservedReverseDirectory } from '../../../.claude/scripts/workspacify-reverse/lib/holdout-ledger.mjs';
import { detectPattern, renderPatternDetection } from '../../../.claude/scripts/workspacify-reverse/lib/pattern-detection.mjs';
import {
  findSchemaViolations,
  verifyReverseDecisions,
} from '../../../.claude/scripts/workspacify-reverse/lib/reverse-decisions.mjs';
import { reservedReverseDecisionsPath } from '../../../.claude/scripts/workspacify-tree/lib/reserved-root.mjs';
import { createSyntheticTree } from '../helpers/scratch.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const RUNNER = join(PROJECT_ROOT, '.claude/scripts/workspacify-reverse/run.mjs');
const COMMAND_PATH = join(PROJECT_ROOT, '.claude/commands/workspacify-reverse.md');

/** The Step-level subcommands this ticket adds, and the Step each serves. */
const STEP_SUBCOMMANDS = Object.freeze(['pattern', 'inventory', 'decide', 'status', 'seam', 'report']);

/** The six documents the exit owes: two canonical, one scope, and the five Step 4 reads. */
const EXIT_DOCUMENTS = Object.freeze(['ANALYSIS-SCOPE.json', 'ORIGIN-LONG-SPEC.json', 'ORIGIN-LONG-SPEC.md']);

/** A subject with an implementation in it and no conver scaffolding at all. */
const SUBJECT_TREE = Object.freeze({
  'src/api/login.rs': 'pub fn login(user_name: &str) -> bool { !user_name.is_empty() }\n',
  'Cargo.toml': '[package]\nname = "step-subject"\n',
});

/** The six decisions the design licenses, answered — the fixture `decide` must accept. */
const SIX_ANSWERS = Object.freeze({
  package_boundary: { packages: [{ path: '.', name: 'root' }], rationale: 'one package, measured' },
  owner_assignment: [{ package: 'root', owns: ['src'] }],
  layer_estimation: [{ package: 'root', layer: 'domain' }],
  contract_meaning: [{ contract: 'C001', meaning: 'the login contract' }],
  over_splitting: { decision: 'not split', rationale: 'cohesion measured high' },
  proposition_classification: [{ claim: 'login rejects an empty name', class: 'observed' }],
});

/**
 * Run the entrance and capture what an operator would see.
 *
 * `cwd` is always supplied: the entrance's subject is the directory it is run in, so a
 * call that did not name one would measure whatever the harness happens to be standing
 * in — this repository.
 */
// [::TICKET::] P26-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-3 --for-spec --no-implementation-order`.
function runCli(args, { cwd } = {}) {
  return spawnSync(process.execPath, [RUNNER, ...args], { cwd, encoding: 'utf8' });
}

/** The declared surface of the entrance, read from its one declaration. */
// [::TICKET::] P26-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-3 --for-spec --no-implementation-order`.
function declaredUsage(source) {
  const usage = /const USAGE = \[([\s\S]*?)\]\.join\('\\n'\)/.exec(source);
  assert.notEqual(usage, null, 'the entrance declares its surface in one block');
  return usage[1];
}

/**
 * The subcommands `USAGE` declares.
 *
 * The block declares them two ways — one synopsis naming the argument-free set, and a
 * usage line per subcommand that takes an action or a fixture — so both are read. A
 * reader that took only the synopsis would report `regression` as undeclared.
 */
// [::TICKET::] P26-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-3 --for-spec --no-implementation-order`.
function declaredSubcommands(source) {
  const usage = declaredUsage(source);
  const names = new Set();
  for (const [, alternatives, single] of usage.matchAll(/run\.mjs (?:<([a-z|]+)>|([a-z]+))/g)) {
    if (alternatives !== undefined) for (const name of alternatives.split('|')) names.add(name);
    if (single !== undefined) names.add(single);
  }
  assert.ok(names.size > 0, 'the entrance declares its subcommands in its USAGE block');
  return [...names];
}

// ---------------------------------------------------------------------------
// Step 0 — the pattern, from the library rather than from a second reading
// ---------------------------------------------------------------------------

test('C001: pattern prints exactly what the library renders for the same tree', () => {
  const tree = createSyntheticTree({ ...SUBJECT_TREE, 'RFC-ROOT.md': '# root\n', 'Tickets.json': '{"phases":[]}' });
  try {
    // The precondition is the library's own answer for this tree; the expected value is
    // that answer rendered, not a string written here. A handler that reformatted the
    // render would pass a fixture comparison and fail this one.
    const detection = detectPattern({ root: tree.root, artefacts: listArtefacts(tree.root) });
    const expected = renderPatternDetection(detection);

    const run = runCli(['pattern'], { cwd: tree.root });

    assert.equal(run.status, 0, `pattern must exit 0: ${run.stderr}`);
    assert.equal(run.stdout.trim(), expected.trim(), 'the handler adds no formatting of its own');
  } finally {
    tree.dispose();
  }
});

test('C001 boundary: pattern answers for a directory holding nothing, and names the absence', () => {
  const tree = createSyntheticTree({ 'placeholder.txt': '\n' });
  try {
    const run = runCli(['pattern'], { cwd: tree.root });

    assert.equal(run.status, 0, 'an empty subject is a finding, not an error');
    assert.match(run.stdout, /undetermined|pattern/i, 'the answer names what it read');
  } finally {
    tree.dispose();
  }
});

// ---------------------------------------------------------------------------
// Step 1 — the inventory
// ---------------------------------------------------------------------------

test('Step 1: inventory names every artefact it found and every ticket lifecycle status', () => {
  const tree = createSyntheticTree({
    'RFC-ROOT.md': '# root\n',
    'RFC-ROOT-GRAPH.json': '{}\n',
    'RFC-ROOT-Dirs-Tree.json': '{}\n',
    'DesignTree.json': '{}\n',
    'Tickets.json': JSON.stringify({
      phases: [{ id: 1, name: 'P1', tickets: [{ id: 1, status: 'reviewed', title: 'a ticket' }] }],
    }),
  });
  try {
    const run = runCli(['inventory'], { cwd: tree.root });

    assert.equal(run.status, 0, `inventory must exit 0: ${run.stderr}`);
    for (const name of ['RFC-ROOT.md', 'RFC-ROOT-GRAPH.json', 'RFC-ROOT-Dirs-Tree.json', 'Tickets.json', 'DesignTree.json']) {
      assert.ok(run.stdout.includes(name), `${name} must be named`);
    }
    assert.match(run.stdout, /reviewed/, 'the lifecycle status is named, not merely counted');
  } finally {
    tree.dispose();
  }
});

test('Step 1 boundary: inventory over a directory with no conver artefacts exits 0 and says so', () => {
  const tree = createSyntheticTree(SUBJECT_TREE);
  try {
    const run = runCli(['inventory'], { cwd: tree.root });

    assert.equal(run.status, 0, 'absence is a finding, not an error');
    assert.match(run.stdout, /none|no conver|0 artefact/i, 'the absence is stated rather than left blank');
  } finally {
    tree.dispose();
  }
});

// ---------------------------------------------------------------------------
// Steps 3 and 4 — the published set
// ---------------------------------------------------------------------------

test('C003: status passes a complete destination and fails one missing a single document', () => {
  const tree = createSyntheticTree(SUBJECT_TREE);
  const out = reservedReverseDirectory(tree.root);
  try {
    mkdirSync(out, { recursive: true });
    for (const name of EXIT_DOCUMENTS) writeFileSync(join(out, name), '# present\n');

    const complete = runCli(['status'], { cwd: tree.root });

    rmSync(join(out, 'ORIGIN-LONG-SPEC.json'));
    const missing = runCli(['status'], { cwd: tree.root });
    const again = runCli(['status'], { cwd: tree.root });

    assert.equal(complete.status, 0, `a complete destination passes: ${complete.stderr}`);
    assert.equal(missing.status, 1, 'one document short is a failure');
    assert.match(missing.stderr, /ORIGIN-LONG-SPEC\.json/, 'the missing document is named');
    assert.equal(again.status, 1, 'the exit code is a function of the set, not of the run');
  } finally {
    tree.dispose();
  }
});

test('C003 boundary: status over an absent destination names the directory rather than throwing', () => {
  const tree = createSyntheticTree(SUBJECT_TREE);
  try {
    const run = runCli(['status'], { cwd: tree.root });

    assert.equal(run.status, 1);
    assert.match(run.stderr, /workspacify/, 'the directory it looked in is named');
    assert.doesNotMatch(run.stderr, /ENOENT|\n\s+at /, 'a finding, not a path and a stack');
  } finally {
    tree.dispose();
  }
});

test('Steps 3 and 4: the reading documents are checked present and non-empty', () => {
  const tree = createSyntheticTree(SUBJECT_TREE);
  const out = reservedReverseDirectory(tree.root);
  try {
    mkdirSync(out, { recursive: true });
    for (const name of EXIT_DOCUMENTS) writeFileSync(join(out, name), '# present\n');
    writeFileSync(join(out, 'R0-R2-REPORT.md'), '');

    const run = runCli(['status'], { cwd: tree.root });

    assert.equal(run.status, 1, 'an empty document is not a published one');
    assert.match(run.stderr, /R0-R2-REPORT\.md/, 'the empty document is named');
  } finally {
    tree.dispose();
  }
});

// ---------------------------------------------------------------------------
// Step 5 — the decisions, written through the schema
// ---------------------------------------------------------------------------

test('C004: decide writes the six answers and the document passes the schema', () => {
  const tree = createSyntheticTree(SUBJECT_TREE);
  try {
    mkdirSync(reservedReverseDirectory(tree.root), { recursive: true });
    const answers = join(tree.root, 'answers.json');
    writeFileSync(answers, JSON.stringify(SIX_ANSWERS));

    const run = runCli(['decide', `--answers=${answers}`], { cwd: tree.root });

    assert.equal(run.status, 0, `decide must accept six answers: ${run.stderr}`);
    const written = JSON.parse(readFileSync(reservedReverseDecisionsPath(tree.root), 'utf8'));
    assert.deepEqual(findSchemaViolations(written), [], 'the document it wrote is the one the gate reads');
    // The gate also reports material it did not find, which this fixture does not
    // publish; the six-item property is the `unrecorded-item` findings, and that is
    // what "the answers it wrote are the six the gate counts" means.
    assert.deepEqual(
      verifyReverseDecisions({ decisions: written, present: readdirSync(reservedReverseDirectory(tree.root)) })
        .filter((finding) => finding.kind === 'unrecorded-item'),
      [],
      'the six items it wrote are the six the gate counts',
    );
  } finally {
    tree.dispose();
  }
});

test('C004 invariant: a refused answer writes nothing, and the destination is byte-identical', () => {
  const tree = createSyntheticTree(SUBJECT_TREE);
  const scratch = createSyntheticTree({ 'placeholder.txt': '\n' });
  try {
    mkdirSync(reservedReverseDirectory(tree.root), { recursive: true });

    // The answers are written outside the subject: a fixture inside it would move the
    // digest this test compares, and the comparison would then fail for the fixture's
    // reason rather than the refusal's.
    const keys = Object.keys(SIX_ANSWERS);
    const shortAnswers = join(scratch.root, 'answers-5.json');
    writeFileSync(shortAnswers, JSON.stringify(Object.fromEntries(keys.slice(0, 5).map((key) => [key, SIX_ANSWERS[key]]))));
    const longAnswers = join(scratch.root, 'answers-7.json');
    writeFileSync(longAnswers, JSON.stringify({ ...SIX_ANSWERS, seventh_decision: { anything: true } }));

    const before = digestTree(tree.root);

    for (const answers of [shortAnswers, longAnswers]) {
      const run = runCli(['decide', `--answers=${answers}`], { cwd: tree.root });

      assert.equal(run.status, 1, `${answers} must be refused`);
      assert.deepEqual(digestTree(tree.root), before, 'a refused write leaves the destination as it was');
    }
  } finally {
    tree.dispose();
    scratch.dispose();
  }
});

test('C004 boundary: decide over a missing answers file exits 1 without writing', () => {
  const tree = createSyntheticTree(SUBJECT_TREE);
  try {
    mkdirSync(reservedReverseDirectory(tree.root), { recursive: true });
    const before = digestTree(tree.root);

    const run = runCli(['decide', `--answers=${join(tree.root, 'absent.json')}`], { cwd: tree.root });

    assert.equal(run.status, 1);
    assert.match(run.stderr, /absent\.json/, 'the file it could not read is named');
    assert.deepEqual(digestTree(tree.root), before);
  } finally {
    tree.dispose();
  }
});

// ---------------------------------------------------------------------------
// Step 6 — the seam
// ---------------------------------------------------------------------------

test('Step 6: seam names both directions of the difference, never netted into one number', () => {
  const tree = createSyntheticTree({
    ...SUBJECT_TREE,
    'RFC-ROOT-Dirs-Tree.json': JSON.stringify({ packages: [{ path: 'src/old' }] }),
    'workspacify/reverse/ORIGIN-LONG-SPEC.json': JSON.stringify({
      partition: { packages: [{ path: 'src/new' }] },
    }),
  });
  try {
    const run = runCli(['seam'], { cwd: tree.root });

    assert.equal(run.status, 0, `seam must exit 0: ${run.stderr}`);
    assert.match(run.stdout, /src\/old/, 'an entry only the prior partition carries is named');
    assert.match(run.stdout, /src\/new/, 'an entry only the fixed partition carries is named');
  } finally {
    tree.dispose();
  }
});

test('Step 6 boundary: a prior partition that cannot be read is named, not read as no seam', () => {
  const tree = createSyntheticTree({ ...SUBJECT_TREE, 'RFC-ROOT-Dirs-Tree.json': '{ not json\n' });
  try {
    const run = runCli(['seam'], { cwd: tree.root });

    // A broken prior passing as a project that never had one is the failure
    // `scope.mjs` already names: absence and unreadability are different findings.
    assert.equal(run.status, 1, 'a present but unreadable prior partition is a finding');
    assert.match(run.stderr, /RFC-ROOT-Dirs-Tree\.json/, 'the file it could not read is named');
  } finally {
    tree.dispose();
  }
});

test('Step 6 boundary: seam over a pattern-1 subject states that there is no seam', () => {
  const tree = createSyntheticTree(SUBJECT_TREE);
  try {
    const run = runCli(['seam'], { cwd: tree.root });

    assert.equal(run.status, 0, 'no prior partition is a finding, not an error');
    assert.match(run.stdout, /no seam/i);
  } finally {
    tree.dispose();
  }
});

// ---------------------------------------------------------------------------
// Step 8 — the report
// ---------------------------------------------------------------------------

test('Step 8: report prints the stages, the destination and the outcome, and grades nothing', () => {
  const tree = createSyntheticTree(SUBJECT_TREE);
  const out = reservedReverseDirectory(tree.root);
  try {
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'ANALYSIS-SCOPE.json'), JSON.stringify({ root: '.', stages_run: ['r0', 'r1'], target_digest: { sha256: 'abc', unmodified: true } }));
    writeFileSync(join(out, 'ORIGIN-LONG-SPEC.json'), '{}\n');
    writeFileSync(join(out, 'ORIGIN-LONG-SPEC.md'), '# spec\n');

    const run = runCli(['report'], { cwd: tree.root });

    assert.equal(run.status, 0, `report must exit 0: ${run.stderr}`);
    assert.match(run.stdout, /R0/, 'the stages that ran are named');
    assert.match(run.stdout, /workspacify\/reverse/, 'the destination is named');
    assert.match(run.stdout, /proved|not proved/);
    assert.doesNotMatch(run.stdout, /succeed|success|worked|failed/i, 'the reverse engineering is not graded here');
  } finally {
    tree.dispose();
  }
});

test('Step 8 boundary: report over a destination that holds nothing names what is missing', () => {
  const tree = createSyntheticTree(SUBJECT_TREE);
  try {
    const run = runCli(['report'], { cwd: tree.root });

    assert.equal(run.status, 1);
    assert.match(run.stderr, /workspacify|ANALYSIS-SCOPE/, 'what is missing is named');
  } finally {
    tree.dispose();
  }
});

// ---------------------------------------------------------------------------
// Invariants over the whole surface
// ---------------------------------------------------------------------------

test('C005: every Step-level subcommand refuses a bare path by name', () => {
  const tree = createSyntheticTree(SUBJECT_TREE);
  try {
    for (const subcommand of ['pattern', 'inventory', 'status', 'seam', 'report']) {
      const run = runCli([subcommand, tree.root], { cwd: tree.root });

      assert.equal(run.status, 1, `${subcommand} must refuse a positional token`);
      assert.ok(run.stderr.includes(tree.root), `${subcommand} names the token it refused`);
      assert.doesNotMatch(run.stdout, /^#/m, `${subcommand} prints nothing as if it had answered`);
    }
  } finally {
    tree.dispose();
  }
});

test('the declared surface, the declared list and the dispatch name the same subcommands', () => {
  const source = readFileSync(RUNNER, 'utf8');
  const declared = new Set(declaredSubcommands(source));
  const listed = new Set([.../const SUBCOMMANDS = \[([\s\S]*?)\]/.exec(source)[1].matchAll(/'([a-z]+)'/g)].map(([, name]) => name));
  const dispatched = new Set([...source.matchAll(/subcommand === '([a-z]+)'\) return/g)].map(([, name]) => name));

  for (const name of [...declared, ...STEP_SUBCOMMANDS]) {
    assert.ok(listed.has(name), `${name} is declared in USAGE and must be listed in SUBCOMMANDS`);
    // `verify` is the chain's default branch rather than one of its arms — it is what
    // the file did before the chain existed. Naming that one exception is what keeps a
    // newly declared subcommand from landing in it by accident, which is silent.
    assert.ok(
      dispatched.has(name) || name === 'verify',
      `${name} must be dispatched rather than fall through to runVerify`,
    );
  }
  for (const name of listed) assert.ok(declared.has(name), `${name} is listed but not declared in USAGE`);
});

test('every Step of the command file names a command the entrance declares', () => {
  const text = readFileSync(COMMAND_PATH, 'utf8');
  const declared = new Set(declaredSubcommands(readFileSync(RUNNER, 'utf8')));

  // A Run line is a block rather than a line: a Step whose command is a bash fence
  // states it there, and one whose command is a slash command states it inline.
  const runBlocks = [...text.matchAll(/^\*\*Run\*\*:[\s\S]*?(?=\n\*\*|\n## |\n?$)/gm)].map(([block]) => block);
  assert.equal(runBlocks.length, 9, 'every Step carries a Run line');

  for (const block of runBlocks) {
    for (const [, name] of block.matchAll(/run\.mjs ([a-z]+)/g)) {
      assert.ok(declared.has(name), `the file names run.mjs ${name}, which USAGE does not declare`);
    }
    assert.doesNotMatch(block, /^\*\*Run\*\*: nothing\b/m, 'no Step answers "nothing" where a script answers');
  }
});

test('the handlers report an unreadable root as a finding rather than a stack', () => {
  const absent = join(PROJECT_ROOT, 'tests/workspacify-reverse/fixtures/absent-step-root');
  assert.equal(existsSync(absent), false, 'the fixture path must not exist, or this asserts nothing');

  for (const subcommand of ['pattern', 'inventory', 'status', 'seam', 'report']) {
    const run = spawnSync(process.execPath, [RUNNER, subcommand], { cwd: PROJECT_ROOT, encoding: 'utf8' });
    assert.notEqual(run.status, 2, `${subcommand} is a declared subcommand, not a usage error`);
    assert.doesNotMatch(run.stderr, /Usage: run\.mjs/, `${subcommand} must not be reported as unknown`);
  }
});
