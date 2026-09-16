// PX-215 @verifies C003 C004 C005
/**
 * The allocate rotation's argument surface: the manifest, and a decisions document
 * the rotation derives rather than the caller choosing.
 *
 * The manifest is the survivor, and it is not a courtesy. §2.1 makes the workspace
 * root a package of its own (path `.`), §2.2 draws the fifth layer beside its four
 * layers, and `workspacify-allocate/run.mjs` implements both as
 * `workspaceRoot = dirname(manifestPath)`. A standard manifest path would place the
 * generated workspace inside the reserve and break all four patterns at once, so
 * the argument stays and the reason travels with it.
 *
 * The decisions document is the other half: it was the last path in the family a
 * run asked the AI to invent, and it is now read from
 * `${RESERVED_ROOT_NAME}/${RESERVED_ALLOCATE_SUBDIRECTORY}` beneath the workspace
 * root. A run that passes `--decisions=<other>` is told by name rather than read
 * from a file it did not name.
 *
 * The guard reads `printUsage()`. A guard holding its own copy of the surface would
 * be a third rendering of the fact and would drift from the script exactly as the
 * document would, which is the failure it exists to prevent.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  RESERVED_ALLOCATE_SUBDIRECTORY,
  RESERVED_DECISIONS_FILE_NAME,
  RESERVED_ROOT_NAME,
  reservedAllocateDecisionsPath,
} from '../../../.claude/scripts/workspacify-tree/lib/reserved-root.mjs';
import { ALLOCATE_MANIFEST_FILE_NAME, SEED_FILE_NAME } from '../../../.claude/scripts/workspacify-allocate/lib/seed-model.mjs';
import { materializeSeedFixture, makeDecisions } from '../helpers/build-valid-manifest.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const RUNNER = join(PROJECT_ROOT, '.claude/scripts/workspacify-allocate/run.mjs');
const DESIGN_PATH = join(PROJECT_ROOT, 'docs/WORKSPACIFY-4-PATTERNS-COMPLETE-DESIGN.md');
const COMMAND_PATH = join(PROJECT_ROOT, '.claude/commands/workspacify-allocate.md');
const TREE_MANIFEST_FILE_NAME = 'WORKSPACIFY-TREE-MANIFEST.json';

/**
 * Every argument this entrance declares, and why it is still declared.
 *
 * `pattern` is present exactly when hiding the argument was a decision this ticket
 * had to make, and its value names the §1.1 pattern whose input would vanish.
 * `--package` carries no pattern and says so in its own reason: it selects one
 * package's authoring packet, which is material an authoring step asks for rather
 * than a path the rotation could derive, and three tests under
 * `tests/workspacify-allocate/unit/` already hold `runPacket` to honouring it.
 * Recording it here is what keeps it visible — the guard fails if the entrance
 * declares an argument this table does not, which is the "cannot grow back
 * unnoticed" property, whether or not the argument is one this ticket touched.
 */
const DECLARED_SURFACE = Object.freeze([
  {
    fact: 'the stage-one manifest',
    spellings: ['<path-to-WORKSPACIFY-TREE-MANIFEST.json>', '<manifest>'],
    pattern: 'pattern 1, pattern 2, pattern 3, pattern 4',
    reason: '§2.1 makes the workspace root a package of its own and §2.2 draws the fifth layer beside its '
      + 'four layers; the rotation implements both as workspaceRoot = dirname(manifestPath). A standard '
      + 'manifest path would create the generated workspace inside the reserve and break all four patterns.',
  },
  {
    fact: 'the authoring packet selector',
    spellings: ['--package'],
    pattern: undefined,
    reason: 'It selects which package\'s authoring packet `packet` prints. That is material an authoring step '
      + 'asks for, not a path the rotation can derive, and it was not a hiding candidate for this ticket: '
      + 'withdrawing it would change a behaviour three existing tests assert.',
  },
]);

/** The arguments this rotation keeps on its command line because a pattern needs them. */
const DECLARED_SURVIVORS = Object.freeze(DECLARED_SURFACE.filter((entry) => entry.pattern !== undefined));

// ---------------------------------------------------------------------------
// Reading the surface, and holding the survivors to their reasons
// ---------------------------------------------------------------------------

/** The declared surface of the entrance, read from its one declaration. */
// [::TICKET::] PX-215 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-215 --for-spec --no-implementation-order`.
function declaredUsage(source) {
  const usage = /function printUsage\(\) \{\s*return \[([\s\S]*?)\]\.join\('\\n'\)/.exec(source);
  assert.notEqual(usage, null, 'the entrance declares its surface in one block');
  return usage[1];
}

/**
 * The options and placeholders a usage block names, as the tokens it writes.
 *
 * Two exclusions, each for a reason the notation carries. A placeholder directly
 * after `=` is an option's value rather than a positional, so `--package=<id>`
 * contributes `--package` and nothing more. A bracketed alternation — the
 * `<validate|plan|packet|gate|finalize>` that lists subcommands — is a choice among
 * commands, not an argument a caller writes, and reading it as a positional would
 * make the guard demand a survivor for the subcommand list itself.
 */
// [::TICKET::] PX-215 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-215 --for-spec --no-implementation-order`.
function declaredTokens(usage) {
  const options = [...usage.matchAll(/--[a-z][a-z-]*/g)].map(([name]) => name);
  const placeholders = [...usage.matchAll(/(?:^|[^=\w])(<[^>\s]+>)/g)]
    .map(([, name]) => name)
    .filter((name) => !name.includes('|'));
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

/** Write the decisions document where the rotation derives it, and return its path. */
// [::TICKET::] PX-215 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-215 --for-spec --no-implementation-order`.
function authorDecisions(dir, manifest, options) {
  const decisionsPath = reservedAllocateDecisionsPath(dir);
  mkdirSync(join(dir, RESERVED_ROOT_NAME, RESERVED_ALLOCATE_SUBDIRECTORY), { recursive: true });
  writeFileSync(decisionsPath, `${JSON.stringify(makeDecisions(manifest, options))}\n`);
  return decisionsPath;
}

/** Run the entrance and capture what an operator would see. */
// [::TICKET::] PX-215 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-215 --for-spec --no-implementation-order`.
function runChain(args, cwd) {
  const result = spawnSync(process.execPath, [RUNNER, ...args], { cwd, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '', text: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

/** Every seed file under a workspace root, relative to it, sorted. */
// [::TICKET::] PX-215 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-215 --for-spec --no-implementation-order`.
function seedsUnder(root) {
  const found = [];
  const visit = (abs, rel) => {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (entry.name === RESERVED_ROOT_NAME) continue;
        visit(join(abs, entry.name), relPath);
      } else if (entry.name === SEED_FILE_NAME) {
        found.push(relPath);
      }
    }
  };
  visit(root, '');
  return found.sort();
}

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

// ---------------------------------------------------------------------------
// C003 — the manifest survives, and the fifth layer stays at the workspace root
// ---------------------------------------------------------------------------

test('PX-215 / C003 precondition: the derived decisions path is the workspace root plus the reserved root', () => {
  assert.equal(
    reservedAllocateDecisionsPath('/a/b'),
    join('/a/b', RESERVED_ROOT_NAME, RESERVED_ALLOCATE_SUBDIRECTORY, RESERVED_DECISIONS_FILE_NAME),
    'the path is spelled once, and it is not the tree rotation\'s document',
  );
  assert.notEqual(
    reservedAllocateDecisionsPath('/a/b'),
    join('/a/b', RESERVED_ROOT_NAME, RESERVED_DECISIONS_FILE_NAME),
    'the two rotations do not share one staging document, because the two schemas are not one schema',
  );
});

test('PX-215 / C003 postcondition: finalize completes with no decisions argument and publishes into dirname(manifestPath)', () => {
  const fixture = materializeSeedFixture();
  try {
    authorDecisions(fixture.dir, fixture.manifest);
    const run = runChain(['finalize', fixture.manifestPath], fixture.dir);
    assert.equal(run.status, 0, run.text);

    assert.equal(
      existsSync(join(fixture.dir, ALLOCATE_MANIFEST_FILE_NAME)),
      true,
      'the allocate manifest is published at the workspace root',
    );
    assert.equal(existsSync(join(fixture.dir, TREE_MANIFEST_FILE_NAME)), true, 'the stage-one manifest is still there');
    assert.deepEqual(
      seedsUnder(fixture.dir),
      (fixture.manifest.workspace?.packages ?? []).map((pkg) => `${pkg.path}/${SEED_FILE_NAME}`).sort(),
      'one seed per package, placed in the package rather than in the reserve',
    );
    assert.equal(
      existsSync(join(fixture.dir, RESERVED_ROOT_NAME)),
      false,
      'the reserve held nothing but staging, so the residue is the published set',
    );
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('PX-215 / C003 error case: a missing decisions document is reported by its derived path', () => {
  const fixture = materializeSeedFixture();
  try {
    const run = runChain(['gate', fixture.manifestPath], fixture.dir);
    assert.equal(run.status, 1, 'a gate with no decisions document cannot pass');
    assert.ok(
      run.text.includes(reservedAllocateDecisionsPath(fixture.dir)),
      `the refusal names the file it looked for: ${run.text}`,
    );
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('PX-215 / C003 invariant: the reserve is not an existing output, and the fifth layer never moves beneath it', () => {
  const fixture = materializeSeedFixture();
  try {
    // The reserve is populated before the run, which is exactly the state the
    // planning decision asked to be measured rather than assumed: the forward
    // population is `fresh-workspace only`, judged over the planned directories.
    authorDecisions(fixture.dir, fixture.manifest);
    const run = runChain(['finalize', fixture.manifestPath], fixture.dir);
    assert.equal(run.status, 0, `a reserve is not an existing output: ${run.text}`);

    for (const name of [TREE_MANIFEST_FILE_NAME, ALLOCATE_MANIFEST_FILE_NAME]) {
      assert.equal(existsSync(join(fixture.dir, name)), true, `${name} belongs at the workspace root`);
      assert.equal(
        existsSync(join(fixture.dir, RESERVED_ROOT_NAME, RESERVED_ALLOCATE_SUBDIRECTORY, name)),
        false,
        `${name} is not published beneath the reserve`,
      );
    }
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('PX-215 / C003 invariant: a decisions token is refused by name, and the derived document is never opened', () => {
  const fixture = materializeSeedFixture();
  try {
    // A document that could not pass the schema, at the derived path: the token is
    // reported instead, which is what says the file was never opened.
    const derived = reservedAllocateDecisionsPath(fixture.dir);
    mkdirSync(join(fixture.dir, RESERVED_ROOT_NAME, RESERVED_ALLOCATE_SUBDIRECTORY), { recursive: true });
    writeFileSync(derived, '{\n  "not": "a decisions document"\n}\n');

    const run = runChain(['finalize', fixture.manifestPath, '--decisions=/tmp/other.json'], fixture.dir);
    assert.equal(run.status, 1, 'an option the entrance once honoured is refused rather than ignored');
    assert.ok(run.text.includes('--decisions=/tmp/other.json'), 'the whole token is named, value included');
    // The machine line on stdout, not the operator guidance on stderr: the guidance
    // is advice for a decisions-schema failure and would be read as evidence the
    // document had been judged.
    assert.doesNotMatch(run.stdout, /not readable JSON|schema/i, 'the derived document is not read on the way to the refusal');
    assert.equal(existsSync(join(fixture.dir, ALLOCATE_MANIFEST_FILE_NAME)), false, 'a refusal publishes nothing');
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// C004 — the declared surface is data the script owns
// ---------------------------------------------------------------------------

test('PX-215 / C004 postcondition: the guard reads the declared surface rather than restating it', () => {
  const declared = survivingArguments();
  assert.equal(declared.includes('--decisions'), false, 'the decisions argument left the command line');
  assert.equal(
    declared.includes('<path-to-WORKSPACIFY-TREE-MANIFEST.json>'),
    true,
    'the manifest survives, and the guard says so from the script',
  );

  const spellings = DECLARED_SURFACE.flatMap((entry) => entry.spellings);
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
    { fact: 'the stage-one manifest', spellings: ['<path-to-WORKSPACIFY-TREE-MANIFEST.json>'], reason: 'it has always been there' },
  ];
  assert.throws(
    () => assertSurvivorsAreJustified(unjustified),
    /<path-to-WORKSPACIFY-TREE-MANIFEST\.json>: a surviving argument must name the pattern hiding it would break/,
    'an unjustified survivor is a failure, not a warning',
  );
  assert.doesNotThrow(
    () => assertSurvivorsAreJustified(DECLARED_SURVIVORS),
    'and the survivors this rotation records are justified',
  );
});

test('PX-215 / C004 boundary case: the family keeps exactly two arguments it decided not to hide', () => {
  // One here, one in the tree guard: the stage-one manifest and the specification.
  assert.deepEqual(
    DECLARED_SURVIVORS.map((entry) => entry.fact),
    ['the stage-one manifest'],
    'this rotation keeps one argument for a named pattern',
  );
});

// ---------------------------------------------------------------------------
// C005 — the design document and the scripts are two renderings of one surface
// ---------------------------------------------------------------------------

test('PX-215 / C005 invariant: the document states the criterion and names each survivor with its pattern', () => {
  const section = implementationSurfaceSection(readFileSync(DESIGN_PATH, 'utf8'));

  assert.match(section, /an argument is hidden unless hiding it breaks one of the four patterns/, 'the criterion is stated');
  assert.match(section, /--spec[^\n]*pattern 4/, 'the tree\'s survivor names the pattern it protects');
  assert.equal(
    section.includes('<path-to-WORKSPACIFY-TREE-MANIFEST.json>'),
    true,
    'this rotation\'s survivor is named in the same place',
  );
  assert.equal(/--decisions=<path>/.test(section), false, 'an argument the scripts no longer declare is not offered');
});

test('PX-215 / C005 postcondition: the command file stops asking the operator to choose a decisions location', () => {
  const command = readFileSync(COMMAND_PATH, 'utf8');
  const derived = `${RESERVED_ROOT_NAME}/${RESERVED_ALLOCATE_SUBDIRECTORY}/${RESERVED_DECISIONS_FILE_NAME}`;

  assert.equal(command.includes(derived), true, 'the derived location is stated as the path it is');
  assert.doesNotMatch(command, /os\.tmpdir\(\)/, 'the operator is no longer told to invent a location');
  assert.doesNotMatch(command, /--decisions=/, 'no step invocation carries a decisions argument');
  assert.match(
    command,
    /an argument is hidden unless hiding it breaks one of the four patterns/,
    'the criterion is stated here too, so a reader of the command file does not have to find the design document to learn it',
  );
  assert.match(
    command,
    /workspaceRoot = dirname\(manifestPath\)/,
    'and the mechanism that makes the manifest a survivor is named, rather than asserted',
  );
});
