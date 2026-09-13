// [::TICKET::] PX-210 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-210 --for-spec --no-implementation-order`.
// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
/**
 * rotation-gate — a reverse-only section cannot reach a forward step.
 *
 * The reverse rotation was added to nine command files by appending a section to
 * each. Eight are safe by position, by additivity, or by a predicate that is false
 * in forward. The rest rested on prose a reader had to judge: "when the project
 * already contains an implementation", or `mode === "reverse"` where no such
 * variable exists. A command file is a prompt, not code — nothing executes its
 * gate — so the only property a machine can hold is the text itself.
 *
 * Two properties are held here. Placement: a reverse heading may not appear before
 * the file's forward procedure, because a section reaching the reader before the
 * steps finish can remove one. Gate: every reverse section opens with one sentence
 * naming a predicate drawn from a declared table, and every entry of that table
 * declares that it does not hold in the forward rotation.
 *
 * What the gate check cannot do is tell whether a predicate is the right one for
 * its section. It can only tell that a predicate was declared. That is the honest
 * limit of a mechanical check over a mapping, and it is stated rather than implied.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

import {
  COMMAND_FILE_NAMES,
  DECLARED_ROTATION_PREDICATES,
  FORWARD_PROCEDURE_HEADING_PATTERNS,
  ROTATION_GATE_PATTERN,
  compareDigests,
  digestCommandFiles,
  lintRotationGates,
  lintRotationPlacement,
  rejectInadmissiblePredicates,
} from '../../../.claude/scripts/workspacify-reverse/lib/command-file-digest.mjs';
import { resolveTreeMode, TREE_MODES } from '../../../.claude/scripts/workspacify-tree/lib/reverse-mode.mjs';
import { createThrowawayFile } from '../helpers/scratch.mjs';
import { resolveAllocateMode, ALLOCATE_MODES } from '../../../.claude/scripts/workspacify-allocate/lib/reverse-mode.mjs';

const PROJECT_ROOT = resolve(import.meta.dirname, '../../..');
const COMMANDS = join(PROJECT_ROOT, '.claude/commands');
const BASELINE = JSON.parse(
  readFileSync(join(PROJECT_ROOT, 'tests/workspacify-tree/baselines/manifest-hashes.json'), 'utf8'),
);

const digestOf = (text) => createHash('sha256').update(text).digest('hex');
const bytesOf = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const linesOf = (path) => readFileSync(path, 'utf8').split('\n');
const commandLines = (name) => linesOf(join(COMMANDS, `${name}.md`));

// [::TICKET::] PX-210, P23-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-210|P23-12) --for-spec --no-implementation-order`.
function fixture(name, lines) {
  return createThrowawayFile(name, lines, { prefix: 'px210-' });
}

/** The first non-blank line after the single reverse heading of a command file. */
// [::TICKET::] PX-210 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-210 --for-spec --no-implementation-order`.
function gateLineOf(name) {
  const lines = commandLines(name);
  const heading = lines.findIndex((line) => /^#{1,6} .*[Rr]everse/.test(line));
  assert.notStrictEqual(heading, -1, `${name}.md carries no reverse heading`);
  return lines.slice(heading + 1).find((line) => line.trim().length > 0) ?? '';
}

// ---------------------------------------------------------------------------
// C001 — a reverse section may not sit inside the forward procedure
// ---------------------------------------------------------------------------

test('C001: no reverse heading precedes a forward procedure heading in any of the nine', () => {
  const findings = lintRotationPlacement({ projectRoot: PROJECT_ROOT });
  assert.deepStrictEqual(findings, [], `findings: ${JSON.stringify(findings)}`);
});

test('C001: every file carries an anchor, so the rule cannot pass vacuously', () => {
  for (const name of COMMAND_FILE_NAMES) {
    assert.ok(
      commandLines(name).some((line) => FORWARD_PROCEDURE_HEADING_PATTERNS.some((pattern) => pattern.test(line))),
      `${name}.md carries no forward procedure heading, so the placement rule has nothing to anchor on`,
    );
  }
});

/**
 * A sentence that tells a reader not to run a step.
 *
 * Every phrasing rather than only the one that was found: the thing being kept
 * out of the forward path is the instruction, whatever words carry it. Two
 * instances existed when this test was written — one in the reverse section, and
 * one in a `## Guidelines` bullet that the weaker, single-phrase assertion had
 * passed over.
 */
const STEP_REMOVAL = /Step \d+ (?:is|are) (?:not run|not executed|skipped|omitted|unnecessary)/i;

test('C001: boundify-graph.md reaches Step 3 without meeting a step-removing sentence', () => {
  const lines = commandLines('boundify-graph');
  const step3 = lines.findIndex((line) => line.startsWith('## Step 3: Batch File Generation'));
  assert.notStrictEqual(step3, -1, 'the Step 3 heading must still exist');

  const offenders = lines.slice(0, step3).filter((line) => STEP_REMOVAL.test(line));
  assert.deepStrictEqual(offenders, [], `a step is removed inside the forward reading path: ${offenders.join(' | ')}`);
});

test('C001: no command file removes a step before its forward procedure ends', () => {
  for (const name of COMMAND_FILE_NAMES) {
    const lines = commandLines(name);
    const anchors = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => FORWARD_PROCEDURE_HEADING_PATTERNS.some((pattern) => pattern.test(line)));
    const procedureEnd = anchors.length ? Math.max(...anchors.map(({ index }) => index)) : lines.length;

    const offenders = lines.slice(0, procedureEnd).filter((line) => STEP_REMOVAL.test(line));
    assert.deepStrictEqual(offenders, [], `${name}.md removes a step before its procedure ends: ${offenders.join(' | ')}`);
  }
});

test('C001: a misplaced reverse section is reported by file and heading, and the file is untouched', () => {
  // The fixture reproduces the shape that was actually found: the reverse section
  // sits above Step 3, not below it. A fixture with the reverse heading last would
  // assert nothing, because nothing is misplaced in that arrangement.
  const { name, path } = fixture('misplaced.md', ['## Step 1: load', '### Reverse Mode', 'body', '## Step 3: generate']);
  const before = bytesOf(path);

  const findings = lintRotationPlacement({ files: [{ name, path }] });

  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].kind, 'misplaced-reverse-section');
  assert.strictEqual(findings[0].heading, '### Reverse Mode');
  assert.match(findings[0].file, /misplaced\.md$/);
  assert.strictEqual(bytesOf(path), before, 'a lint that rewrites its subject is not a lint');
});

test('C001: a reverse heading in a file with no forward procedure heading is reported, not passed', () => {
  // A file that carries no procedure heading would satisfy the placement rule by
  // having nothing to violate. Silence there is indistinguishable from compliance,
  // which is the failure this whole module exists to remove.
  const { name, path } = fixture('anchorless.md', ['## Overview', '## Reverse mode', '**Rotation gate** — this section runs only when `claim-ledger` holds. (reason)']);

  const findings = lintRotationPlacement({ files: [{ name, path }] });

  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].kind, 'no-procedure-anchor');
  assert.match(findings[0].file, /anchorless\.md$/);
});

test('C001: a file that cannot be read is reported by path rather than throwing', () => {
  // A lint over nine fixed names must not allow a missing file to read like a file
  // that passed: an unhandled exception names nothing, and a silent skip names
  // nothing either.
  const { name, path } = fixture('present.md', ['## Step 1: x']);

  const findings = lintRotationPlacement({ files: [{ name, path }, { name: 'absent', path: `${path}.missing` }] });

  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].kind, 'unreadable-file');
  assert.match(findings[0].file, /present\.md\.missing$/);
});

test('C002: a file with two reverse headings is reported rather than resolved', () => {
  // Two reverse sections have two gates, and picking either would be a choice the
  // lint is not entitled to make.
  const { name, path } = fixture('twice.md', [
    '## Step 1: x',
    '## Reverse mode',
    '**Rotation gate** — this section runs only when `claim-ledger` holds. (reason)',
    '## Reverse rotation only',
    '**Rotation gate** — this section runs only when `claim-ledger` holds. (reason)',
  ]);

  const findings = lintRotationGates({ files: [{ name, path }] });

  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].kind, 'multiple-reverse-headings');
});

// ---------------------------------------------------------------------------
// C002 — every reverse section opens with a gate naming a declared predicate
// ---------------------------------------------------------------------------

test('C002: every reverse section opens with a gate naming a declared predicate', () => {
  const findings = lintRotationGates({ projectRoot: PROJECT_ROOT });
  assert.deepStrictEqual(findings, [], `findings: ${JSON.stringify(findings)}`);
});

test('C002: each of the nine carries exactly one reverse heading', () => {
  for (const name of COMMAND_FILE_NAMES) {
    const reverse = commandLines(name).filter((line) => /^#{1,6} .*[Rr]everse/.test(line));
    assert.strictEqual(reverse.length, 1, `${name}.md carries ${reverse.length} reverse headings`);
  }
});

test('C002: a reverse heading followed by ordinary prose is reported as missing-gate', () => {
  const { name, path } = fixture('nogate.md', ['## Step 1: x', '## Reverse mode', '', 'Just some prose about it.']);

  const findings = lintRotationGates({ files: [{ name, path }] });

  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].kind, 'missing-gate');
});

test('C002: a gate-shaped sentence naming an undeclared predicate is reported by predicate', () => {
  const { name, path } = fixture('undeclared.md', [
    '## Step 1: x',
    '## Reverse mode',
    '',
    '**Rotation gate** — this section runs only when `mode === "reverse"` holds. (the sentence under repair)',
  ]);

  const findings = lintRotationGates({ files: [{ name, path }] });

  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].kind, 'undeclared-predicate');
  assert.strictEqual(findings[0].predicate, 'mode === "reverse"');
});

test('C002 boundary: a gate on the final line is found', () => {
  const { name, path } = fixture('lastline.md', [
    '## Step 1: x',
    '## Reverse mode',
    '',
    '**Rotation gate** — this section runs only when `claim-ledger` holds. (reason)',
  ]);

  assert.deepStrictEqual(lintRotationGates({ files: [{ name, path }] }), []);
});

test('C002 boundary: a reverse heading with nothing after it is reported, not skipped', () => {
  const { name, path } = fixture('empty.md', ['## Step 1: x', '## Reverse mode']);

  const findings = lintRotationGates({ files: [{ name, path }] });

  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].kind, 'missing-gate');
});

// ---------------------------------------------------------------------------
// C003 — the declared predicate table
// ---------------------------------------------------------------------------

test('C003: every declared predicate carries a kind, a reason and forwardDefault false', () => {
  assert.ok(DECLARED_ROTATION_PREDICATES.length > 0, 'the table must declare something');

  for (const entry of DECLARED_ROTATION_PREDICATES) {
    assert.ok(['artifact', 'argument'].includes(entry.kind), `${entry.name} has kind ${entry.kind}`);
    assert.strictEqual(entry.forwardDefault, false, `${entry.name} must not hold in the forward rotation`);
    assert.strictEqual(typeof entry.reason, 'string');
    assert.ok(entry.reason.trim().length >= 20, `${entry.name} must carry a reason worth reading, not a shrug`);
  }

  assert.strictEqual(
    new Set(DECLARED_ROTATION_PREDICATES.map((entry) => entry.name)).size,
    DECLARED_ROTATION_PREDICATES.length,
    'predicate names must be distinct',
  );
});

test('C003: every predicate named by a gate in the nine files is a member of the table', () => {
  const declared = new Set(DECLARED_ROTATION_PREDICATES.map((entry) => entry.name));
  for (const name of COMMAND_FILE_NAMES) {
    const named = ROTATION_GATE_PATTERN.exec(gateLineOf(name))?.[1];
    assert.ok(named !== undefined, `${name}.md carries no parseable gate sentence`);
    assert.ok(declared.has(named), `${name}.md names undeclared predicate ${named}`);
  }
});

test('C003: every declared predicate is named by at least one gate', () => {
  const named = new Set(COMMAND_FILE_NAMES.map((name) => ROTATION_GATE_PATTERN.exec(gateLineOf(name))?.[1]));
  const unused = DECLARED_ROTATION_PREDICATES
    .map((entry) => entry.name)
    .filter((name) => !named.has(name));

  assert.deepStrictEqual(unused, [], `a declared predicate no gate uses is a permission nobody exercises: ${unused.join(', ')}`);
});

test('C003: an entry with forwardDefault true is refused', () => {
  const rejected = rejectInadmissiblePredicates([
    ...DECLARED_ROTATION_PREDICATES,
    {
      name: 'rotation-agnostic-flag',
      kind: 'argument',
      forwardDefault: true,
      reason: 'This holds in both rotations, so it cannot gate a reverse-only section.',
    },
  ]);

  assert.deepStrictEqual(rejected.map((entry) => entry.name), ['rotation-agnostic-flag']);
});

test('C003: an entry with a kind outside the declared vocabulary is refused', () => {
  const rejected = rejectInadmissiblePredicates([
    { name: 'mystery', kind: 'vibe', forwardDefault: false, reason: 'A kind outside the declared vocabulary is not admissible.' },
  ]);

  assert.deepStrictEqual(rejected.map((entry) => entry.name), ['mystery']);
});

test('C003: the gate lint reports a declared predicate that is not admissible', () => {
  // `rejectInadmissiblePredicates` was reachable only from the tests, so the table
  // was checked where a developer looks and not on the path a ticket takes. The
  // lint runs it, so an entry that holds in the forward rotation fails through the
  // same call the regression gate makes.
  const { name, path } = fixture('inadmissible.md', [
    '## Step 1: x',
    '## Reverse mode',
    '**Rotation gate** — this section runs only when `claim-ledger` holds. (reason)',
  ]);
  const holdsInBoth = {
    name: 'holds-in-both-rotations',
    kind: 'argument',
    forwardDefault: true,
    reason: 'This holds in both rotations and therefore cannot gate a reverse-only section.',
  };

  const findings = lintRotationGates({
    files: [{ name, path }],
    predicates: [...DECLARED_ROTATION_PREDICATES, holdsInBoth],
  });

  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].kind, 'inadmissible-predicate');
  assert.strictEqual(findings[0].predicate, 'holds-in-both-rotations');
});

test('C003: an absent, empty or unrecognised mode resolves to forward', () => {
  assert.strictEqual(resolveTreeMode({}), TREE_MODES.FORWARD);
  assert.strictEqual(resolveTreeMode(undefined), TREE_MODES.FORWARD);
  assert.strictEqual(resolveTreeMode({ mode: 'sideways' }), TREE_MODES.FORWARD);
  assert.strictEqual(resolveAllocateMode({}), ALLOCATE_MODES.FORWARD);
  assert.strictEqual(resolveAllocateMode(undefined), ALLOCATE_MODES.FORWARD);
  assert.strictEqual(resolveAllocateMode({ mode: 'sideways' }), ALLOCATE_MODES.FORWARD);
});

// ---------------------------------------------------------------------------
// C004 — the forward rotation's protected sections are intact
// ---------------------------------------------------------------------------

test('C004: compareDigests over the PX-205 baseline returns no findings', () => {
  const findings = compareDigests(BASELINE.commandFileDigests, digestCommandFiles(PROJECT_ROOT));
  assert.deepStrictEqual(findings, [], `findings: ${JSON.stringify(findings)}`);
});

test('C004: the frozen Language Protocol and First-Class Rule digests are unchanged', () => {
  const current = digestCommandFiles(PROJECT_ROOT);
  for (const name of COMMAND_FILE_NAMES) {
    assert.strictEqual(
      current[name].languageProtocolDigest,
      BASELINE.commandFileDigests[name].languageProtocolDigest,
      `${name}.md changed its Language Protocol table`,
    );
    assert.strictEqual(
      current[name].firstClassRuleDigest,
      BASELINE.commandFileDigests[name].firstClassRuleDigest,
      `${name}.md changed its First-Class Rule line`,
    );
  }
});

test('C004: the digest adds no key the frozen baseline carries no value for', () => {
  // The rotation gate is enforced by the two lints, which run over the real files
  // on every `make test`. Freezing its sentence in the digest as well would need
  // `regression capture`, and capture re-derives the five forward surfaces too —
  // which this ticket may not do. A key written into the digest that the baseline
  // carries no value for is therefore a stored-but-uncompared field: the exact
  // shape that PX-208 and PX-209 each repaired, and that this ticket records as an
  // open item against `documentDigest`. It is not added a second time.
  const current = digestCommandFiles(PROJECT_ROOT);

  for (const name of COMMAND_FILE_NAMES) {
    const frozen = BASELINE.commandFileDigests[name];
    const withoutValue = Object.keys(current[name]).filter((key) => !(key in frozen));
    assert.deepStrictEqual(
      withoutValue,
      [],
      `${name}.md's digest carries ${withoutValue.join(', ')}, which nothing compares`,
    );
  }
});

test('C004: a deleted frozen heading is reported by name', () => {
  const frozen = {
    sample: {
      headings: ['## Step 1: x', '## Reverse mode'],
      languageProtocolDigest: digestOf('absent'),
      firstClassRuleDigest: digestOf('absent'),
    },
  };
  const current = {
    sample: {
      headings: ['## Step 1: x'],
      languageProtocolDigest: digestOf('absent'),
      firstClassRuleDigest: digestOf('absent'),
    },
  };

  const findings = compareDigests(frozen, current);

  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].kind, 'missing-heading');
  assert.strictEqual(findings[0].heading, '## Reverse mode');
});
