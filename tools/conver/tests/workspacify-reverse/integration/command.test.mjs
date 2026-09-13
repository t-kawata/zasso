// @verifies C001
// @verifies C002
// @verifies C003
// [::TICKET::] P22-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-9 --for-spec --no-implementation-order`.
/**
 * The entrance to the reverse rotation, measured through the command line.
 *
 * `/workspacify-reverse <root>` is the one door R0 through R8 are reached by.
 * These tests treat it as an operator would: they spawn it, read its exit code
 * and its Markdown, and check that a run either publishes a complete analysis
 * or names the stage that stopped it. Nothing here asserts a semantic verdict —
 * the machine's vocabulary is *proved* and *not proved*, and a disagreement
 * list is a human's material, not a score.
 *
 * zg is exercised by putting a stand-in on the child's PATH rather than by
 * adding a test-only switch to the command, so the code path under test is the
 * one an operator gets.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  COMMAND_FILE_NAMES,
  COMMANDS_RELATIVE_DIR,
  compareDigests,
  digestCommandFiles,
} from '../../../.claude/scripts/workspacify-reverse/lib/command-file-digest.mjs';
import {
  ANALYSIS_EVALUATION_ORDER,
  ANALYSIS_STAGES,
  analyzeProject,
} from '../../../.claude/scripts/workspacify-reverse/lib/scope.mjs';
import { ZG_REPORT_FILE_NAME } from '../../../.claude/scripts/workspacify-reverse/lib/zg-probe.mjs';
import { assertCommandFileStructure } from '../helpers/command-file.mjs';
import { createSyntheticTree } from '../helpers/scratch.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const RUNNER = join(PROJECT_ROOT, '.claude/scripts/workspacify-reverse/run.mjs');
const NEW_COMMAND_PATH = join(PROJECT_ROOT, COMMANDS_RELATIVE_DIR, 'workspacify-reverse.md');
const BASELINE_PATH = 'tests/workspacify-tree/baselines/manifest-hashes.json';
const REVERSE_ROOT = join(PROJECT_ROOT, 'siprs-for-reverse');
const targetAvailable = existsSync(REVERSE_ROOT);

/**
 * Run the command and capture what an operator would see.
 *
 * `PATH` is overridden per call rather than inherited so the zg branch is
 * chosen by the test and not by whatever happens to be installed on the machine
 * running it.
 */
// [::TICKET::] P22-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-9 --for-spec --no-implementation-order`.
// [::TICKET::] P23-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-7 --for-spec --no-implementation-order`.
function runCli(args, { path } = {}) {
  const result = spawnSync(process.execPath, [RUNNER, ...args], {
    encoding: 'utf8',
    env: path === undefined ? process.env : { ...process.env, PATH: path },
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/** A throwaway directory to publish into, so no test writes into the project. */
// [::TICKET::] P22-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-9 --for-spec --no-implementation-order`.
function scratchDirectory(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  return { root, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

/** A PATH holding a stand-in zg and nothing of this project's. */
// [::TICKET::] P22-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-9 --for-spec --no-implementation-order`.
function zgBinDirectory() {
  const root = mkdtempSync(join(tmpdir(), 'wsp-zg-bin-'));
  const script = join(root, 'zg');
  writeFileSync(script, [
    '#!/usr/bin/env node',
    'const args = process.argv.slice(2);',
    "if (args[0] === 'version') { process.stdout.write('zg 0.3.1\\n'); process.exit(0); }",
    "process.stdout.write('src/api/login.rs:4:    assert!(!user.name.is_empty());\\n');",
    'process.exit(0);',
    '',
  ].join('\n'));
  chmodSync(script, 0o755);
  return { root, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

/** A PATH on which zg cannot be found, whatever the machine has installed. */
// [::TICKET::] P22-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-9 --for-spec --no-implementation-order`.
function emptyPathDirectory() {
  return scratchDirectory('wsp-no-zg-');
}

/**
 * The names a run published.
 *
 * The set is read from the directory rather than from a declared list because a
 * stage that stopped publishing silently is exactly the failure a declared list
 * would hide.
 */
// [::TICKET::] P22-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-9 --for-spec --no-implementation-order`.
function publishedNames(directory) {
  return readdirSync(directory).sort();
}

/** A population carrying a boundary crossing, an asserted condition and an error return. */
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
  'src/model.rs': 'pub struct User { pub name: String }\n',
});

// --- C001: the command file, and the nine it stands beside --------------------

test('C001 precondition: the nine protected command files are present and the tenth is created', () => {
  assert.equal(COMMAND_FILE_NAMES.length, 9);
  for (const name of COMMAND_FILE_NAMES) {
    assert.equal(existsSync(join(PROJECT_ROOT, COMMANDS_RELATIVE_DIR, `${name}.md`)), true, `${name}.md must exist`);
  }
  assert.equal(existsSync(NEW_COMMAND_PATH), true, 'P22-9 creates the tenth command file');
  assert.equal(
    COMMAND_FILE_NAMES.includes('workspacify-reverse'),
    false,
    'the tenth file is deliberately outside the frozen digest: it is a creation, not an edit',
  );
});

test('C001 postcondition / UT-1: the new command file carries the same structural elements as the nine', () => {
// [::TICKET::] P23-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-1 --for-spec --no-implementation-order`.
  // The eight assertions live in `helpers/command-file.mjs`, so this test and the
  // procedure guard added by P23-1 hold the file to one definition of them.
  assertCommandFileStructure(readFileSync(NEW_COMMAND_PATH, 'utf8'), { projectRoot: PROJECT_ROOT });
});

test('C001 invariant / UT-10 / IT-2: no protected command file is modified against the P22-1 baseline', () => {
  const baseline = JSON.parse(readFileSync(join(PROJECT_ROOT, BASELINE_PATH), 'utf8'));
  const findings = compareDigests(baseline.commandFileDigests, digestCommandFiles(PROJECT_ROOT));

  assert.deepEqual(
    findings,
    [],
    'no protected command file lost a heading, its Language Protocol table or its First-Class Rule line',
  );
  assert.deepEqual(
    Object.keys(baseline.commandFileDigests).sort(),
    [...COMMAND_FILE_NAMES].sort(),
    'the baseline freezes exactly the nine',
  );
});

// --- C002: one invocation, R0 through R8 --------------------------------------

test('C002 precondition: every declared stage is reached exactly once, in a declared order', () => {
  assert.deepEqual(
    [...ANALYSIS_STAGES],
    ['r0', 'r0.5', 'r1', 'r2', 'r2.5', 'r3', 'r3.5', 'r4', 'r5', 'r5.5', 'r6', 'r6.5', 'r7', 'r8'],
  );
  assert.equal(ANALYSIS_STAGES.length, 14);
  assert.equal(ANALYSIS_STAGES[ANALYSIS_STAGES.length - 1], 'r8', 'a run without --through reaches R8');

  assert.deepEqual(
    [...ANALYSIS_EVALUATION_ORDER].sort(),
    [...ANALYSIS_STAGES].sort(),
    'the evaluation order reaches every declared stage and invents none',
  );
  assert.equal(
    new Set(ANALYSIS_EVALUATION_ORDER).size,
    ANALYSIS_EVALUATION_ORDER.length,
    'no stage is evaluated twice',
  );
});

test('C002 postcondition / UT-2 / IT-1: a single invocation runs R0 through R8 in series', async () => {
  const tree = createSyntheticTree(CLAIM_BEARING_TREE);
  const out = scratchDirectory('wsp-cmd-out-');
  try {
    const observed = [];
    await analyzeProject({ root: tree.root, out: out.root, options: { onStage: (stage) => observed.push(stage) } });
    assert.deepEqual(observed, [...ANALYSIS_EVALUATION_ORDER], 'every stage runs, and none runs out of turn');

    const run = runCli(['analyze', tree.root, `--out=${out.root}`]);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(existsSync(join(out.root, 'ORIGIN-LONG-SPEC.json')), true);
    assert.equal(existsSync(join(out.root, 'ORIGIN-LONG-SPEC.md')), true);
    assert.equal(
      JSON.parse(readFileSync(join(out.root, 'ORIGIN-LONG-SPEC.json'), 'utf8')).kind,
      'origin-long-spec',
    );
  } finally {
    tree.dispose();
    out.dispose();
  }
});

test('C002 invariant / UT-12: each stage adds its own documents and reaches back for none', async () => {
  const tree = createSyntheticTree(CLAIM_BEARING_TREE);
  const early = scratchDirectory('wsp-prefix-r65-');
  const late = scratchDirectory('wsp-prefix-r8-');
  try {
    await analyzeProject({ root: tree.root, out: early.root, through: 'r6.5' });
    await analyzeProject({ root: tree.root, out: late.root, through: 'r8' });

    const atR65 = publishedNames(early.root);
    const atR8 = publishedNames(late.root);
    assert.equal(
      atR65.every((name) => atR8.includes(name)),
      true,
      'an earlier prefix publishes nothing a later prefix drops',
    );
    assert.deepEqual(
      atR8.filter((name) => !atR65.includes(name)).sort(),
      ['CAPABILITY-PROFILE.json', 'ORIGIN-LONG-SPEC.json', 'ORIGIN-LONG-SPEC.md', 'ORIGIN-SPEC-CANDIDATE.json', 'R7-SERVING.md'].sort(),
      'the documents R7 and R8 add are the only difference',
    );
  } finally {
    tree.dispose();
    early.dispose();
    late.dispose();
  }
});

test('UT-9: a target holding a single file reaches every stage', async () => {
  const tree = createSyntheticTree({ 'src/one.rs': 'pub fn one() -> u8 { 1 }\n' });
  const out = scratchDirectory('wsp-single-');
  try {
    const observed = [];
    await analyzeProject({ root: tree.root, out: out.root, options: { onStage: (stage) => observed.push(stage) } });
    assert.deepEqual(observed, [...ANALYSIS_EVALUATION_ORDER]);
    assert.equal(existsSync(join(out.root, 'ORIGIN-LONG-SPEC.json')), true);
  } finally {
    tree.dispose();
    out.dispose();
  }
});

test('UT-7: an empty target produces an explicit empty analysis', () => {
  const tree = createSyntheticTree({});
  const out = scratchDirectory('wsp-empty-');
  try {
    const run = runCli(['analyze', tree.root, `--out=${out.root}`]);
    assert.equal(run.status, 0, run.stderr);

    const spec = JSON.parse(readFileSync(join(out.root, 'ORIGIN-LONG-SPEC.json'), 'utf8'));
    assert.deepEqual(spec.claims, []);
    assert.match(
      readFileSync(join(out.root, 'ORIGIN-LONG-SPEC.md'), 'utf8'),
      /This origin spec is empty\./,
      'the emptiness is stated rather than implied by an absent section',
    );
  } finally {
    tree.dispose();
    out.dispose();
  }
});

// --- UT-4 / UT-6: a stage that cannot run names itself -------------------------

test('UT-4 / UT-6: a stage that cannot run reports its name and its input, and publishes nothing', () => {
  const parent = scratchDirectory('wsp-absent-');
  const out = scratchDirectory('wsp-absent-out-');
  const absentRoot = join(parent.root, 'no-such-tree');
  try {
    const run = runCli(['analyze', absentRoot, `--out=${out.root}`]);

    assert.equal(run.status, 1, 'a stage that cannot run is a failure, not a report');
    assert.equal(run.stderr.includes('R0'), true, 'the failing stage is named');
    assert.equal(run.stderr.includes(absentRoot), true, 'the input is named by its path');
    assert.match(run.stderr, /nothing was published/i);
    assert.deepEqual(publishedNames(out.root), [], 'a failed run emits no partial document');
  } finally {
    parent.dispose();
    out.dispose();
  }
});

test('UT-4: an unknown stage is refused by name rather than silently running everything', () => {
  const tree = createSyntheticTree(CLAIM_BEARING_TREE);
  const out = scratchDirectory('wsp-badstage-');
  try {
    const run = runCli(['analyze', tree.root, `--out=${out.root}`, '--through=r99']);
    assert.equal(run.status, 1);
    assert.equal(run.stderr.includes('r99'), true);
    assert.deepEqual(publishedNames(out.root), []);
  } finally {
    tree.dispose();
    out.dispose();
  }
});

// --- C003: zg in the serving layer --------------------------------------------

test('IT-4 / UT-11: the deterministic documents do not depend on zg, and the candidate section does', () => {
  const tree = createSyntheticTree(CLAIM_BEARING_TREE);
  const withZg = scratchDirectory('wsp-with-zg-');
  const withoutZg = scratchDirectory('wsp-without-zg-');
  const zgBin = zgBinDirectory();
  const noZg = emptyPathDirectory();
  try {
    const present = runCli(['analyze', tree.root, `--out=${withZg.root}`, '--query=where credentials are validated'], {
      path: `${zgBin.root}:${process.env.PATH}`,
    });
    const absent = runCli(['analyze', tree.root, `--out=${withoutZg.root}`, '--query=where credentials are validated'], {
      path: noZg.root,
    });

    assert.equal(present.status, 0, present.stderr);
    assert.equal(absent.status, 0, absent.stderr);

    const namesWith = publishedNames(withZg.root).filter((name) => name !== ZG_REPORT_FILE_NAME);
    const namesWithout = publishedNames(withoutZg.root).filter((name) => name !== ZG_REPORT_FILE_NAME);
    assert.deepEqual(namesWith, namesWithout, 'zg adds no deterministic document and removes none');
    assert.deepEqual(namesWith, publishedNames(withoutZg.root), 'and the absent run publishes no candidate section');

    for (const name of namesWith) {
      assert.equal(
        readFileSync(join(withZg.root, name), 'utf8'),
        readFileSync(join(withoutZg.root, name), 'utf8'),
        `${name} must be byte-identical: no deterministic stage may consume a zg result`,
      );
    }

    assert.equal(existsSync(join(withZg.root, ZG_REPORT_FILE_NAME)), true, 'zg present serves a candidate section');
    assert.equal(existsSync(join(withoutZg.root, ZG_REPORT_FILE_NAME)), false, 'an absent zg is served as no candidate section');
  } finally {
    tree.dispose();
    withZg.dispose();
    withoutZg.dispose();
    zgBin.dispose();
    noZg.dispose();
  }
});

test('IT-4: the candidate section is present and says in plain English that a candidate is not a finding', () => {
  const tree = createSyntheticTree(CLAIM_BEARING_TREE);
  const out = scratchDirectory('wsp-candidates-');
  const zgBin = zgBinDirectory();
  try {
    const run = runCli(['analyze', tree.root, `--out=${out.root}`, '--query=where credentials are validated'], {
      path: `${zgBin.root}:${process.env.PATH}`,
    });
    assert.equal(run.status, 0, run.stderr);

    const section = readFileSync(join(out.root, ZG_REPORT_FILE_NAME), 'utf8');
    assert.match(section, /^## /m, 'the candidate section is a section');
    assert.match(section, /candidate/i);
    assert.match(section, /does not settle a claim/i, 'the section states what a candidate may not be used for');
    assert.match(section, /src\/api\/login\.rs:4/, 'a hit is served with its location, not as a bare statement');
  } finally {
    tree.dispose();
    out.dispose();
    zgBin.dispose();
  }
});

test('IT-4: an installed zg with no question asked does not break the invocation the command file documents', () => {
  const tree = createSyntheticTree(CLAIM_BEARING_TREE);
  const out = scratchDirectory('wsp-zg-unasked-');
  const zgBin = zgBinDirectory();
  try {
    // No `--query`: this is the form the command definition's Step 1 gives, and
    // it is the form an operator runs. An installed search tool with nothing to
    // search for is as ordinary as an absent one, and must not be a failure.
    const run = runCli(['analyze', tree.root, `--out=${out.root}`], { path: `${zgBin.root}:${process.env.PATH}` });

    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /zg is installed/);
    assert.match(run.stdout, /no question was asked/i);
    assert.doesNotMatch(run.stderr, /TypeError|renderZgReport/, 'a normal state is never reported as a stack trace');

    assert.equal(existsSync(join(out.root, 'ORIGIN-LONG-SPEC.json')), true, 'the analysis is complete without a search');
    const section = readFileSync(join(out.root, ZG_REPORT_FILE_NAME), 'utf8');
    assert.match(section, /^## /m);
    assert.match(section, /no question was asked/i);
  } finally {
    tree.dispose();
    out.dispose();
    zgBin.dispose();
  }
});

test('UT-5 / UT-8: an unavailable zg is reported and the run completes without it', () => {
  const tree = createSyntheticTree(CLAIM_BEARING_TREE);
  const out = scratchDirectory('wsp-no-zg-out-');
  const noZg = emptyPathDirectory();
  try {
    const run = runCli(['analyze', tree.root, `--out=${out.root}`], { path: noZg.root });

    assert.equal(run.status, 0, 'an absent search tool never aborts a run');
    assert.match(run.stdout, /zg/, 'the absence is reported');
    assert.match(run.stdout, /not installed|unavailable/i);
    assert.equal(existsSync(join(out.root, ZG_REPORT_FILE_NAME)), false);
    assert.equal(existsSync(join(out.root, 'ORIGIN-LONG-SPEC.json')), true, 'a complete analysis is still produced');
  } finally {
    tree.dispose();
    out.dispose();
    noZg.dispose();
  }
});

// --- IT-3: the forward rotation is untouched ----------------------------------

test('IT-3: the forward-rotation regression gate is still proved', () => {
  const result = spawnSync(process.execPath, [RUNNER, 'regression', 'check'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /proved/);
  assert.match(result.stdout, /0 command-file loss\(es\)/);
});

// --- IT-1: over the real experiment input -------------------------------------

test('IT-1: over siprs-for-reverse the entrance publishes the origin spec', { skip: !targetAvailable }, () => {
  const out = scratchDirectory('wsp-real-');
  const noZg = emptyPathDirectory();
  try {
    const run = runCli(['analyze', REVERSE_ROOT, `--out=${out.root}`], { path: noZg.root });
    assert.equal(run.status, 0, run.stderr);

    const sidecar = JSON.parse(readFileSync(join(out.root, 'ORIGIN-LONG-SPEC.json'), 'utf8'));
    const markdown = readFileSync(join(out.root, 'ORIGIN-LONG-SPEC.md'), 'utf8');
    assert.equal(sidecar.kind, 'origin-long-spec');
    assert.ok(sidecar.claims.length > 1000, `expected the real population, found ${sidecar.claims.length}`);
    assert.match(markdown, /^# /m);
  } finally {
    out.dispose();
    noZg.dispose();
  }
});
