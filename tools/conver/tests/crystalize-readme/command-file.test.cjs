/**
 * command-file.test.cjs — the CRITICAL block of crystalize-readme.md, held against
 * the steps that file defines (Contracts C001, C002).
 *
 * The command file carried no static guard of its own, and that is how an exception
 * naming a step the file does not define survived: the exception sentence points at
 * a step called 1.5, while the headings define Step 0 through Step 3 and the
 * sub-steps 1-1 through 1-8. A reader cannot resolve the exception, so the
 * prohibition it excepts stays in force — and the prohibition forbids the options
 * and the delegation of a decision that the heading proposals of 1-2 perform.
 *
 * What is asserted here is resolution, not obedience: whether a run stops at the
 * heading proposals is a choice an agent makes and no test can observe it. What a
 * test can observe is whether the exception names something the file defines.
 *
 * @verifies C001
 * @verifies C002
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

const {
  findUnresolvedSteps,
  readCriticalBlock,
  readNamedSteps,
} = require('../../.claude/scripts/crystalize-readme/check-command-steps.js');

/** The command file this ticket repairs, and the guard that reads any command file. */
const COMMAND = path.resolve(__dirname, '../../.claude/commands/crystalize-readme.md');
const GUARD = path.resolve(__dirname, '../../.claude/scripts/crystalize-readme/check-command-steps.js');

/**
 * The other two installs of the same command file, reached through the repository root.
 *
 * This file sits two directories below the tool, where the guards under
 * tests/question-gate/unit sit three, so the climb to the repository root is four
 * steps rather than three.
 */
const REPOSITORY_ROOT = path.resolve(__dirname, '../../../..');
const COPIES = [
  COMMAND,
  path.join(REPOSITORY_ROOT, 'crates/siprs/.claude/commands/crystalize-readme.md'),
  path.join(REPOSITORY_ROOT, '.claude/commands/crystalize-readme.md'),
];

const CRITICAL_TITLE = '# CRITICAL — NON-INTERACTIVE, END-TO-END EXECUTION';

/** The terms the block prohibits; the exception may narrow them where it names a step. */
const PROHIBITED_TERMS = [
  'questions',
  'confirmations',
  'approvals',
  'options',
  'human-decision delegation',
];

/** A command file whose exception names a step the file does not define. */
const STALE_FILE = [
  CRITICAL_TITLE,
  '',
  'Strictly prohibit questions, confirmations, approvals, options, and human-decision delegation.',
  '',
  '**Exception to the above, scoped to this command only**: Step 1.5 below is a genuine ask; stop checkpoint.',
  '',
  '# /crystalize-readme <graph-path>',
  '',
  '### Step 0: Read sourceFile',
  '',
  '### Step 1: Grill — Hierarchical Headings (Table of Contents)',
  '',
  '#### 1-2. **Heading proposals (non-deterministic)**',
  '',
  '#### 1-5. **User response**',
  '',
].join('\n');

/** The same file with the exception removed, so the block excepts nothing. */
const SILENT_FILE = STALE_FILE.replace(/^\*\*Exception.*$/m, '');

/** Write one command file into a directory of its own and hand its path to the run. */
// [::TICKET::] PX-271 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-271 --for-spec --no-implementation-order`.
function withCommandFile(text, run) {
  const directory = mkdtempSync(path.join(tmpdir(), 'px271-'));
  try {
    const file = path.join(directory, 'crystalize-readme.md');
    writeFileSync(file, text, 'utf8');
    return run(file);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** Run the guard against one file and report how it ended. */
// [::TICKET::] PX-271 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-271 --for-spec --no-implementation-order`.
function runGuard(file) {
  return spawnSync(process.execPath, [GUARD, `--file=${file}`], { encoding: 'utf8' });
}

/** Run the guard with one argument exactly as given, so its own parsing is under test. */
// [::TICKET::] PX-271 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-271 --for-spec --no-implementation-order`.
function runGuardWithArgument(argument) {
  return spawnSync(process.execPath, [GUARD, argument], { encoding: 'utf8' });
}

/** The identifiers the guard refused, in the order it reported them. */
// [::TICKET::] PX-271 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-271 --for-spec --no-implementation-order`.
function refusedIdentifiers(result) {
  const [, listed] = result.stderr.split('does not define:');
  if (listed === undefined) return [];
  return listed
    .split('(')[0]
    .split(',')
    .map((identifier) => identifier.trim())
    .filter((identifier) => identifier !== '');
}

describe('C001 — the CRITICAL block and the exception it carries', () => {
  it('C001-Pre: the block carries a prohibition and an exception that names a step', () => {
    const block = readCriticalBlock(readFileSync(COMMAND, 'utf8'));

    assert.equal(block.heading, CRITICAL_TITLE, 'the block is found by its own heading');
    assert.ok(block.prohibition.length > 0, 'the prohibition paragraph is read');
    assert.ok(block.exception.length > 0, 'the exception paragraph is read');
    assert.ok(readNamedSteps(block.exception).length > 0, 'and it names at least one step');
  });

  it('C001-Post: every step the exception names resolves, and 1-2 is among them', () => {
    const text = readFileSync(COMMAND, 'utf8');

    assert.deepEqual(
      findUnresolvedSteps(text),
      [],
      'the exception names no step the file does not define',
    );
    assert.ok(
      readNamedSteps(readCriticalBlock(text).exception).includes('1-2'),
      'the proposal sub-step is named, not only the answer sub-step',
    );
  });

  it('C001-Inv: the prohibition keeps all five terms, so the exception narrows it only where it names', () => {
    const block = readCriticalBlock(readFileSync(COMMAND, 'utf8'));
    const prohibition = block.prohibition.toLowerCase();

    for (const term of PROHIBITED_TERMS) {
      assert.ok(prohibition.includes(term), `${term} stays prohibited outside the exception`);
    }
  });

  it('C001-Pre: a block carrying no exception is refused rather than passed', () => {
    const result = withCommandFile(SILENT_FILE, runGuard);

    assert.equal(result.status, 1, 'a block that excepts nothing is not a pass');
    assert.match(result.stderr, /no exception paragraph/, 'and the guard says what is missing');
  });
});

describe('C002 — the guard against a file whose exception names an undefined step', () => {
  it('C002-Pre: the stale reference is read as one unresolved identifier', () => {
    const unresolved = findUnresolvedSteps(STALE_FILE);

    assert.deepEqual(
      unresolved.map((finding) => finding.identifier),
      ['1.5'],
      'the dotted reference is the identifier the file does not define',
    );
    assert.deepEqual(
      unresolved[0].defined,
      ['0', '1', '1-2', '1-5'],
      'and the heading set is reported beside it, in the order the file declares them',
    );
  });

  it('C002-Post: the guard exits non-zero and names 1.5 on stderr', () => {
    const result = withCommandFile(STALE_FILE, runGuard);

    assert.equal(result.status, 1, 'an unresolved step is a non-zero exit');
    assert.deepEqual(refusedIdentifiers(result), ['1.5'], 'the identifier is named');
    assert.match(result.stderr, /1-2/, 'and the heading set it was searched against is named');
  });

  it('C002-Post: the guard exits 0 and says nothing against the command file this ticket repairs', () => {
    const result = runGuard(COMMAND);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), '', 'a passing guard says nothing');
  });

  it('C002-Post: a file the guard cannot read is an error, not a pass', () => {
    const result = runGuard(path.join(tmpdir(), 'px271-no-such-command-file.md'));

    assert.equal(result.status, 2, 'a missing file is not a silent pass');
    assert.match(result.stderr, /cannot read/, 'and it says so');
  });

  it('C002-Post: an argument the guard does not understand is an error, not a silent default', () => {
    const result = runGuardWithArgument('--file');

    assert.equal(result.status, 2, 'a bare --file must not quietly judge the default file instead');
    assert.match(result.stderr, /usage/, 'and the guard states how it is called');
  });

  it('C002-Inv: a dotted reference is not the hyphenated heading it resembles', () => {
    const unresolved = findUnresolvedSteps(STALE_FILE);

    assert.deepEqual(
      unresolved.map((finding) => finding.identifier),
      ['1.5'],
      '1.5 does not resolve to the heading 1-5, and 1 alone does not resolve it either',
    );
  });

  it('C002-Inv: an identifier the file never declares does not resolve, however it is written', () => {
    for (const alternative of ['Step 2.5 below', 'sub-step 9-9 below']) {
      const rewritten = STALE_FILE.replace('Step 1.5 below', alternative);
      const unresolved = findUnresolvedSteps(rewritten);

      assert.equal(unresolved.length, 1, `${alternative} is refused`);
      assert.deepEqual(unresolved[0].defined, ['0', '1', '1-2', '1-5'], 'the heading set is this file only');
    }
  });
});

describe('C001 — the three installs of the command file', () => {
  it('C001-Post: all three installs carry one text, compared by content', () => {
    const digests = COPIES.map((file) => createHash('sha256').update(readFileSync(file)).digest('hex'));

    for (const [index, file] of COPIES.entries()) {
      assert.match(digests[index], /^[0-9a-f]{64}$/, `${file} is readable`);
    }
    assert.equal(new Set(digests).size, 1, 'one text in three places');
  });
});
