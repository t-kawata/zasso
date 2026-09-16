// PX-215 @verifies C001 C002 C004 C005
/**
 * The forward rotation's argument surface: one argument, and a decisions document
 * the rotation derives rather than the caller choosing.
 *
 * Two things are asserted here, and they are the whole of this file. The first is
 * that the decisions JSON — the last path in the family that a run asked the AI to
 * invent — is now read from `${RESERVED_ROOT_NAME}/${RESERVED_TREE_SUBDIRECTORY}`
 * beneath the subject, and that a caller who learned the old surface is told so by
 * name rather than silently read from a file they did not name. The second is that
 * the remaining surface is data the script owns: the guard reads `printUsage()` and
 * fails if the entrance declares an argument the guard does not know, and if the
 * guard knows one the entrance does not declare.
 *
 * The distinction matters. A guard holding its own copy of the list would be a
 * third rendering of the surface and would drift from the script exactly as the
 * document would — which is the failure it exists to prevent. So the only thing
 * this file restates is *why* each surviving argument survives.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  RESERVED_DECISIONS_FILE_NAME,
  RESERVED_ROOT_NAME,
  RESERVED_TREE_SUBDIRECTORY,
  reservedTreeDecisionsPath,
} from '../../../.claude/scripts/workspacify-tree/lib/reserved-root.mjs';
import { normalizeTextBytes } from '../../../.claude/scripts/workspacify-tree/lib/normalization.mjs';
import { sha256Hex } from '../../../.claude/scripts/workspacify-tree/lib/hash.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const RUNNER = join(PROJECT_ROOT, '.claude/scripts/workspacify-tree/run.mjs');
const RESERVED_ROOT_SOURCE = join(PROJECT_ROOT, '.claude/scripts/workspacify-tree/lib/reserved-root.mjs');
const DESIGN_PATH = join(PROJECT_ROOT, 'docs/WORKSPACIFY-4-PATTERNS-COMPLETE-DESIGN.md');
const FIXTURES = join(PROJECT_ROOT, 'tests/workspacify-tree/fixtures');
/** The fixture pair that reaches COMPLETE through the forward gates. */
const SPEC_NAME = 'objects-table.md';
const DECISIONS_NAME = 'decisions-complete.json';
const MANIFEST_FILE_NAME = 'WORKSPACIFY-TREE-MANIFEST.json';

/**
 * The one fact this rotation keeps on its command line, and what hiding it breaks.
 *
 * `pattern` names the §1.1 row whose entry point is this argument. The tree is the
 * whole of pattern 4's entrance — "Empty, plus a long specification document" — and
 * an empty project holds nothing from which a specification path could be derived,
 * so hiding it would leave that pattern with no entry at all. The same fact is
 * spelled `--spec` on `gate` and `finalize` and as a positional on `parse` and
 * `extract`; it is one survivor with three spellings, not three survivors.
 */
const DECLARED_SURVIVOR = Object.freeze({
  fact: 'the specification',
  spellings: ['--spec', '<spec>', '<path-to-specification.md>'],
  pattern: 'pattern 4',
  reason: 'It is the entire input of pattern 4 (§1.1 row 4: "Empty, plus a long specification document"). An '
    + 'empty project holds nothing from which a specification path could be derived, so hiding it would leave '
    + 'that pattern with no entry at all rather than tidy the surface.',
});

/** Every argument this rotation decided not to hide. */
const DECLARED_SURVIVORS = Object.freeze([DECLARED_SURVIVOR]);

// ---------------------------------------------------------------------------
// Reading the surface, and holding the survivors to their reasons
// ---------------------------------------------------------------------------

/**
 * The declared surface of the entrance, read from its one declaration.
 *
 * The block rather than a list of literals: `printUsage()` is the single place the
 * entrance says what it accepts, so it is the place a guard can read and the place
 * a new flag cannot be added without an answer.
 */
// [::TICKET::] PX-215 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-215 --for-spec --no-implementation-order`.
function declaredUsage(source) {
  const usage = /function printUsage\(\) \{\s*return \[([\s\S]*?)\]\.join\('\\n'\)/.exec(source);
  assert.notEqual(usage, null, 'the entrance declares its surface in one block');
  return usage[1];
}

/**
 * The options and placeholders a usage block names, as the tokens it writes.
 *
 * A placeholder directly after `=` is an option's value, not a positional, so
 * `--spec=<path>` contributes `--spec` and nothing more.
 */
// [::TICKET::] PX-215 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-215 --for-spec --no-implementation-order`.
function declaredTokens(usage) {
  const options = [...usage.matchAll(/--[a-z][a-z-]*/g)].map(([name]) => name);
  const placeholders = [...usage.matchAll(/(?:^|[^=\w])(<[^>\s]+>)/g)].map(([, name]) => name);
  return [...new Set([...options, ...placeholders])];
}

/** The arguments the entrance declares, read from the script rather than restated here. */
// [::TICKET::] PX-215 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-215 --for-spec --no-implementation-order`.
function survivingArguments() {
  return declaredTokens(declaredUsage(readFileSync(RUNNER, 'utf8')));
}

/** Fail when an argument survives without saying which pattern its absence would break. */
// [::TICKET::] PX-215 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-215 --for-spec --no-implementation-order`.
function assertSurvivorsAreJustified(entries) {
  for (const entry of entries) {
    if (!/pattern [1-4]/.test(entry.pattern ?? '')) {
      throw new Error(`${entry.spellings[0]}: a surviving argument must name the pattern hiding it would break`);
    }
  }
}

/**
 * A subject holding one specification, with the decisions document already where
 * the rotation derives it.
 *
 * The fixture pair is the one that reaches COMPLETE, so a passing run here is the
 * forward rotation and not a vacuous success. The specification is placed inside
 * the subject because stage two resolves the manifest's recorded basename against
 * the manifest's directory.
 */
// [::TICKET::] PX-215 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-215 --for-spec --no-implementation-order`.
function createSubject({ withDecisions = true } = {}) {
  // Resolved: the subcommand reports `process.cwd()`, which the platform spells in
  // its canonical form, and a comparison against the unresolved temp path would be
  // a comparison of two spellings rather than of two documents.
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'workspacify-tree-surface-')));
  const specPath = join(root, SPEC_NAME);
  copyFileSync(join(FIXTURES, SPEC_NAME), specPath);
  if (withDecisions) {
    mkdirSync(join(root, RESERVED_ROOT_NAME, RESERVED_TREE_SUBDIRECTORY), { recursive: true });
    copyFileSync(join(FIXTURES, DECISIONS_NAME), reservedTreeDecisionsPath(root));
  }
  return {
    root,
    specPath,
    manifestPath: join(root, MANIFEST_FILE_NAME),
    decisionsPath: reservedTreeDecisionsPath(root),
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

/** Run the entrance over a subject and capture what an operator would see. */
// [::TICKET::] PX-215 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-215 --for-spec --no-implementation-order`.
function runChain(args, cwd) {
  const result = spawnSync(process.execPath, [RUNNER, ...args], { cwd, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '', text: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

/** The derived decisions path as a run reports it, taken from the report itself. */
// [::TICKET::] PX-215 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-215 --for-spec --no-implementation-order`.
function decisionsPathNamedIn(text) {
  const named = new RegExp(`[^\\s"'\`]*${RESERVED_ROOT_NAME}[^\\s"'\`]*${RESERVED_DECISIONS_FILE_NAME}`).exec(text);
  return named === null ? null : named[0];
}

// ---------------------------------------------------------------------------
// C001 — the decisions document is derived, and the gate and finalize agree on it
// ---------------------------------------------------------------------------

test('PX-215 / C001 precondition: the derived path is one binding, and nothing outside the subject can move it', () => {
  assert.equal(
    reservedTreeDecisionsPath('/a/b'),
    join('/a/b', RESERVED_ROOT_NAME, RESERVED_TREE_SUBDIRECTORY, RESERVED_DECISIONS_FILE_NAME),
    'the path is the working directory plus the reserved root, spelled once',
  );
  assert.equal(
    reservedTreeDecisionsPath('/a/b'),
    reservedTreeDecisionsPath('/a/b'),
    'and it is a function of the subject alone',
  );
  assert.equal(
    reservedTreeDecisionsPath('/a/b') === reservedTreeDecisionsPath('/a/c'),
    false,
    'two subjects resolve two documents, so the derivation is of the subject rather than a constant',
  );
  assert.doesNotMatch(
    readFileSync(RESERVED_ROOT_SOURCE, 'utf8'),
    /process\.env/,
    'no environment variable can move it, because the declaration reads none',
  );
});

test('PX-215 / C001 postcondition: gate and finalize complete with no decisions argument, and the staging file is swept', () => {
  const subject = createSubject();
  try {
    const gate = runChain(['gate', `--spec=${subject.specPath}`], subject.root);
    assert.equal(gate.status, 0, gate.text);
    const finalize = runChain(['finalize', `--spec=${subject.specPath}`], subject.root);
    assert.equal(finalize.status, 0, finalize.text);

    assert.equal(existsSync(subject.manifestPath), true, 'the manifest is published at the workspace root');
    assert.equal(
      existsSync(subject.decisionsPath),
      false,
      'the staging decisions document is swept once the manifest it produced is published',
    );
    assert.equal(
      existsSync(join(subject.root, RESERVED_ROOT_NAME, RESERVED_TREE_SUBDIRECTORY)),
      false,
      'the directory that held nothing but staging goes with it, so the residue is the published set',
    );
  } finally {
    subject.dispose();
  }
});

test('PX-215 / C001 error case: a missing decisions document is reported by its derived path', () => {
  const subject = createSubject({ withDecisions: false });
  try {
    const run = runChain(['gate', `--spec=${subject.specPath}`], subject.root);
    assert.equal(run.status, 1, 'a gate with no decisions document cannot pass');
    assert.equal(
      decisionsPathNamedIn(run.text),
      subject.decisionsPath,
      'the refusal names the file it looked for rather than an empty argument',
    );
    assert.equal(existsSync(subject.manifestPath), false, 'nothing is published');
  } finally {
    subject.dispose();
  }
});

test('PX-215 / C001 boundary case: a schema-invalid document is reported by its derived path, and nothing is published', () => {
  const subject = createSubject();
  try {
    writeFileSync(subject.decisionsPath, `${JSON.stringify({ workspace: [] })}\n`);
    const run = runChain(['finalize', `--spec=${subject.specPath}`], subject.root);
    assert.equal(run.status, 1, 'an incomplete decisions document is not a passing finalize');
    assert.equal(decisionsPathNamedIn(run.text), subject.decisionsPath, 'the derived path is named');
    assert.equal(existsSync(subject.manifestPath), false, 'no partial tree or manifest is left behind');
  } finally {
    subject.dispose();
  }
});

test('PX-215 / C001 invariant: a decisions token is refused by name, and the derived document is never opened', () => {
  const subject = createSubject();
  try {
    // A document that could not pass the schema, placed exactly where the rotation
    // derives it. If the refusal read it on the way, the schema failure would be
    // reported instead of the token.
    writeFileSync(subject.decisionsPath, '{\n  "not": "a decisions document"\n}\n');
    const refused = runChain(['gate', `--spec=${subject.specPath}`, '--decisions=/tmp/other.json'], subject.root);

    assert.equal(refused.status, 1, 'an option the entrance once honoured is refused rather than ignored');
    assert.ok(refused.text.includes('--decisions=/tmp/other.json'), 'the whole token is named, value included');
    assert.doesNotMatch(refused.text, /schema/i, 'the derived document is not read on the way to the refusal');
    assert.equal(existsSync(subject.manifestPath), false, 'a refusal publishes nothing');
  } finally {
    subject.dispose();
  }
});

test('PX-215 / C001 invariant: the gate and the finalize of one run resolve to the same string', () => {
  const subject = createSubject({ withDecisions: false });
  try {
    // Both report the same document because both derive it rather than choosing it:
    // a run cannot approve one file at the gate and publish from another at the
    // finalize. The comparison is between the two reports, never against a constant
    // this file holds.
    const gate = runChain(['gate', `--spec=${subject.specPath}`], subject.root);
    const finalize = runChain(['finalize', `--spec=${subject.specPath}`], subject.root);

    assert.equal(gate.status, 1);
    assert.equal(finalize.status, 1);
    assert.notEqual(decisionsPathNamedIn(gate.text), null, 'the gate names the document it looked for');
    assert.equal(
      decisionsPathNamedIn(gate.text),
      decisionsPathNamedIn(finalize.text),
      'the semantics the gate approved are the semantics the finalize applies',
    );
  } finally {
    subject.dispose();
  }
});

// ---------------------------------------------------------------------------
// C002 — the specification survives, and is read rather than rewritten
// ---------------------------------------------------------------------------

test('PX-215 / C002 invariant: the specification is read from the argument and is byte-identical afterwards', () => {
  const subject = createSubject();
  try {
    const before = readFileSync(subject.specPath);
    const run = runChain(['finalize', `--spec=${subject.specPath}`], subject.root);
    assert.equal(run.status, 0, run.text);

    assert.deepEqual(readFileSync(subject.specPath), before, 'the command reads its input and never rewrites it');

    const manifest = JSON.parse(readFileSync(subject.manifestPath, 'utf8'));
    assert.equal(
      manifest.input.source_hash,
      sha256Hex(normalizeTextBytes(before).bytes),
      'the recorded hash is still the hash of the normalised input',
    );
    assert.equal(
      manifest.input.spec_path,
      basename(subject.specPath),
      'the specification is still recorded as the basename stage two resolves',
    );
  } finally {
    subject.dispose();
  }
});

// ---------------------------------------------------------------------------
// C004 — the declared surface is data the script owns
// ---------------------------------------------------------------------------

test('PX-215 / C004 postcondition: the guard reads the declared surface rather than restating it', () => {
  const declared = survivingArguments();
  assert.equal(declared.includes('--decisions'), false, 'the decisions argument left the command line');
  assert.equal(declared.includes('--spec'), true, 'the specification survives, and the guard says so from the script');

  const spellings = DECLARED_SURVIVORS.flatMap((entry) => entry.spellings);
  assert.deepEqual(
    declared.filter((name) => !spellings.includes(name)),
    [],
    'the entrance declares no argument this guard does not know — an option added to the script alone fails here',
  );
  assert.deepEqual(
    spellings.filter((name) => !declared.includes(name)),
    [],
    'the guard knows no argument the entrance does not declare — an option deleted from the script alone fails here',
  );
});

test('PX-215 / C004 invariant: a survivor without a recorded pattern fails the guard', () => {
  const unjustified = [
    { fact: 'the specification', spellings: ['--spec'], reason: 'it has always been there' },
  ];
  assert.throws(
    () => assertSurvivorsAreJustified(unjustified),
    /--spec: a surviving argument must name the pattern hiding it would break/,
    'an unjustified survivor is a failure, not a warning',
  );
  assert.doesNotThrow(
    () => assertSurvivorsAreJustified(DECLARED_SURVIVORS),
    'and the survivors this rotation records are justified',
  );
});

test('PX-215 / C004 boundary case: the family keeps exactly two arguments it decided not to hide', () => {
  // One here, one in the allocate guard: the specification and the stage-one
  // manifest. The count is asserted where the facts are, rather than in a third
  // list that would be one more thing to drift.
  assert.deepEqual(
    DECLARED_SURVIVORS.map((entry) => entry.fact),
    ['the specification'],
    'this rotation keeps one argument for a named pattern',
  );
});

// ---------------------------------------------------------------------------
// C005 — the design document and the scripts are two renderings of one surface
// ---------------------------------------------------------------------------

/**
 * The section of the design document that states the family's argument surface.
 *
 * A reader is meant to derive the surface from the criterion rather than memorise
 * it, so the criterion, the survivors and the reason each survives are read from
 * one place and held to the scripts in both directions.
 */
// [::TICKET::] PX-215 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-215 --for-spec --no-implementation-order`.
function implementationSurfaceSection(text) {
  const start = text.indexOf('## 9. ');
  assert.notEqual(start, -1, 'the design document states the family\'s argument surface');
  const end = text.indexOf('\n## ', start + 1);
  return text.slice(start, end === -1 ? text.length : end);
}

test('PX-215 / C005 precondition: the document states the criterion and names each survivor with its pattern', () => {
  const section = implementationSurfaceSection(readFileSync(DESIGN_PATH, 'utf8'));

  assert.match(section, /an argument is hidden unless hiding it breaks one of the four patterns/, 'the criterion is stated');
  assert.match(section, /--spec[^\n]*pattern 4/, '--spec names the pattern it protects');
  assert.equal(
    section.includes('<path-to-WORKSPACIFY-TREE-MANIFEST.json>'),
    true,
    'the other survivor is named in the same place, because the surface is derived from one criterion and not read off one script',
  );
  assert.equal(
    /--decisions=<path>/.test(section),
    false,
    'an argument the scripts no longer declare is not offered by the document',
  );
});

test('PX-215 / C005 postcondition: the command file stops asking the operator to choose a decisions location', () => {
  const command = readFileSync(join(PROJECT_ROOT, '.claude/commands/workspacify-tree.md'), 'utf8');
  const derived = `${RESERVED_ROOT_NAME}/${RESERVED_TREE_SUBDIRECTORY}/${RESERVED_DECISIONS_FILE_NAME}`;

  assert.equal(command.includes(derived), true, 'the derived location is stated as the path it is');
  assert.doesNotMatch(command, /os\.tmpdir\(\)/, 'the operator is no longer told to invent a location');
  assert.doesNotMatch(
    command,
    /--decisions=/,
    'no step invocation carries a decisions argument, so the document and the instrument agree',
  );
  assert.match(
    command,
    /never be selected|not selectable|is derived/i,
    'the document says why the operator no longer chooses',
  );
});

test('PX-215 / C005 invariant: the document and the scripts declare the same surface', () => {
  const section = implementationSurfaceSection(readFileSync(DESIGN_PATH, 'utf8'));

  // Every option the script declares is named by the document, on a line that says
  // which pattern its absence would break. The rule is stated once and applied to
  // both, so neither is readable apart from the other — and a reader who adds a
  // flag has one sentence to satisfy rather than a table to memorise.
  for (const name of survivingArguments().filter((token) => token.startsWith('--'))) {
    assert.match(section, new RegExp(`${name}[^\\n]*pattern [1-4]`), `${name} names the pattern it protects`);
  }
});
