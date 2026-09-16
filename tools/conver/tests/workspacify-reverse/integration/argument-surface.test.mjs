// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
// @verifies C005
/**
 * The entrance's argument surface: no arguments, and a destination beneath the
 * directory the command was run in.
 *
 * `/workspacify-reverse` names its own subject. Two things follow, and they are
 * the whole of this file. The first is that the subject is `process.cwd()` and
 * the destination is the reserved directory beneath it, so a run is reproducible
 * from its directory alone. The second is that a destination beneath the subject
 * is only sound where no walk of the analysis descends into it — otherwise the
 * next run would measure its own output, and the before-and-after digest, which
 * is the guarantee that a run did not change what it measured, would be
 * answering a question about a tree that had moved.
 *
 * So the exclusion and the destination are asserted to be one binding rather
 * than two literals that agree today, and the digest is asserted unchanged across
 * a run that publishes into the reserved directory.
 *
 * Every entrance invocation names its `cwd` explicitly. A test that inherited the
 * repository would publish into the repository, and the last test here is the
 * one that would notice.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  NEVER_WALKED_DIRECTORY_NAMES,
  RESERVED_REVERSE_SUBDIRECTORY,
  RESERVED_ROOT_NAME,
  digestTree,
  listTreeFiles,
  reservedReverseDirectory,
} from '../../../.claude/scripts/workspacify-reverse/lib/holdout-ledger.mjs';
import {
  EXCLUSION_RULES,
  NOT_ENUMERATED_DIRECTORY_NAMES,
  listArtefacts,
} from '../../../.claude/scripts/workspacify-reverse/lib/analysis-tech.mjs';
import { analyzeProject } from '../../../.claude/scripts/workspacify-reverse/lib/scope.mjs';
import { createSyntheticTree } from '../helpers/scratch.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const RUNNER = join(PROJECT_ROOT, '.claude/scripts/workspacify-reverse/run.mjs');
const COMMAND_PATH = join(PROJECT_ROOT, '.claude/commands/workspacify-reverse.md');
const LIB_ROOT = join(PROJECT_ROOT, '.claude/scripts/workspacify-reverse/lib');
/** Where the workspacify layers live, which is where the one declaration may be. */
const FAMILY_LIB_ROOTS = join(PROJECT_ROOT, '.claude/scripts');

/** The `lib` directory of each layer: the only places the declaration may sit. */
const LAYER_LIB_ROOTS = ['workspacify-tree', 'workspacify-allocate', 'workspacify-reverse']
  .map((layer) => join(FAMILY_LIB_ROOTS, layer, 'lib'));

/** The reserve as a path relative to the subject, which is how a walk reports it. */
const RESERVE_RELATIVE = `${RESERVED_ROOT_NAME}/${RESERVED_REVERSE_SUBDIRECTORY}`;

/** The stages a contract test needs: the scope is fixed and the record is published. */
const THROUGH_SCOPE = 'r0.5';

/** A small population the pipeline can run over without a build system. */
const SUBJECT_TREE = Object.freeze({
  'src/api/login.rs': [
    'use crate::model::User;',
    '',
    'pub fn login(user: &User) -> Result<(), Error> {',
    '    assert!(!user.name.is_empty());',
    '    Ok(())',
    '}',
    '',
  ].join('\n'),
  'src/model.rs': 'pub struct User { pub name: String }\n',
});

/**
 * Run the entrance and capture what an operator would see.
 *
 * `cwd` is a required parameter rather than an option with a default: the
 * subject of the entrance is the directory it runs in, so a call that does not
 * name one would silently analyse whatever the harness happens to be standing
 * in.
 */
// [::TICKET::] PX-214, PX-215, PX-213 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-214|PX-215|PX-213) --for-spec --no-implementation-order`.
function runEntrance(args, cwd) {
  const result = spawnSync(process.execPath, [RUNNER, ...args], { cwd, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/** Every file under a root, relative to it, sorted, including the reserve. */
// [::TICKET::] PX-214, PX-215, PX-213 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-214|PX-215|PX-213) --for-spec --no-implementation-order`.
function relativeFilesUnder(root) {
  return listTreeFiles(root, { excludedDirectoryNames: [] });
}

/** The `## Arguments` section of the command file. */
// [::TICKET::] PX-214, PX-215, PX-213 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-214|PX-215|PX-213) --for-spec --no-implementation-order`.
function argumentsSection(text) {
  const start = text.indexOf('## Arguments');
  assert.notEqual(start, -1, 'the command file has an Arguments section');
  const end = text.indexOf('\n## ', start + 1);
  return text.slice(start, end === -1 ? text.length : end);
}

/** The declared surface of the entrance, read from its one declaration. */
// [::TICKET::] PX-214, PX-215, PX-213 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-214|PX-215|PX-213) --for-spec --no-implementation-order`.
function declaredUsage(source) {
  const usage = /const USAGE = \[([\s\S]*?)\]\.join\('\\n'\)/.exec(source);
  assert.notEqual(usage, null, 'the entrance declares its surface in one block');
  return usage[1];
}

// ---------------------------------------------------------------------------
// C001 — the entrance takes no arguments and publishes beneath the caller
// ---------------------------------------------------------------------------

test('PX-214 / C001 precondition: every token the entrance once honoured is refused by name', () => {
  const tree = createSyntheticTree(SUBJECT_TREE);
  try {
    const refused = [
      { args: ['--out=/tmp/wsp-refused'], token: '--out' },
      { args: ['--through=r0.5'], token: '--through' },
      { args: ['--query=beta'], token: '--query' },
      { args: ['/some/other/project'], token: '/some/other/project' },
    ];
    for (const { args, token } of refused) {
      const run = runEntrance(['analyze', ...args], tree.root);
      assert.equal(run.status, 1, `${token}: an option the entrance no longer honours is not a success`);
      assert.equal(run.stderr.includes(token), true, `${token}: the refused token is named rather than left anonymous`);
      assert.match(run.stderr, /nothing was published/i);
      assert.equal(
        existsSync(join(tree.root, RESERVED_ROOT_NAME)),
        false,
        `${token}: a refusal leaves no reserve behind`,
      );
    }
  } finally {
    tree.dispose();
  }
});

test('PX-214 / C001 postcondition: a bare analyze publishes beneath the directory it was run in', () => {
  const tree = createSyntheticTree(SUBJECT_TREE);
  try {
    const run = runEntrance(['analyze'], tree.root);
    assert.equal(run.status, 0, run.stderr);

    const destination = reservedReverseDirectory(tree.root);
    assert.equal(existsSync(join(destination, 'ORIGIN-LONG-SPEC.json')), true, 'the origin spec was published');
    assert.equal(existsSync(join(destination, 'ORIGIN-LONG-SPEC.md')), true);
    assert.equal(
      run.stdout.includes(destination),
      true,
      'the destination is named on stdout, so a reader is told where the documents went',
    );

    const scope = JSON.parse(readFileSync(join(destination, 'ANALYSIS-SCOPE.json'), 'utf8'));
    assert.equal(realpathSync(scope.root), realpathSync(tree.root), 'the subject is where the command was run');
  } finally {
    tree.dispose();
  }
});

test('PX-214 / C001 invariant: every document the run creates lands under the reserve', () => {
  const tree = createSyntheticTree(SUBJECT_TREE);
  const before = relativeFilesUnder(tree.root);
  try {
    const run = runEntrance(['analyze'], tree.root);
    assert.equal(run.status, 0, run.stderr);

    const created = relativeFilesUnder(tree.root).filter((path) => !before.includes(path));
    assert.notEqual(created.length, 0, 'the run published something');
    for (const path of created) {
      assert.equal(
        path.startsWith(`${RESERVE_RELATIVE}/`),
        true,
        `${path} was written outside the reserved directory`,
      );
    }
  } finally {
    tree.dispose();
  }
});

test('PX-214 / C001 invariant: every subcommand that measures a subject takes no root', () => {
  const source = readFileSync(RUNNER, 'utf8');
  const usage = declaredUsage(source);

  const invocationLine = /'Usage: run\.mjs ([^']*)'/.exec(usage);
  assert.notEqual(invocationLine, null, 'the entrance declares how it is invoked');
  assert.equal(
    invocationLine[1].includes('<root>'),
    false,
    'the usage line names no root, because no subcommand is handed one',
  );

  for (const subcommand of ['detect', 'scrub', 'verify', 'analyze']) {
    const summary = new RegExp(`'\\s+${subcommand}\\s+[^']*'`).exec(usage);
    if (summary === null) continue;
    assert.equal(summary[0].includes('<root>'), false, `${subcommand} is not handed a root`);
  }

  assert.equal(
    /const ROOT_TAKING_SUBCOMMANDS/.test(source),
    false,
    'a constant listing the subcommands that take a root has nothing left to list',
  );
});

// ---------------------------------------------------------------------------
// C002 — the destination is a directory no walk descends into
// ---------------------------------------------------------------------------

test('PX-214 / C002 precondition: the reserved root is the name no walk descends into', () => {
  assert.equal(
    NEVER_WALKED_DIRECTORY_NAMES.includes(RESERVED_ROOT_NAME),
    true,
    'the digest walk must not descend into the directory the run writes to',
  );
  assert.equal(
    NOT_ENUMERATED_DIRECTORY_NAMES.includes(RESERVED_ROOT_NAME),
    true,
    'the artefact walk must not carry the run\'s own output as subject material',
  );
  assert.equal(EXCLUSION_RULES.includes(RESERVED_ROOT_NAME), true, 'the exclusion rules are derived from the same name');
  assert.equal(
    NEVER_WALKED_DIRECTORY_NAMES.includes(RESERVED_REVERSE_SUBDIRECTORY),
    false,
    'the root already covers everything beneath it; naming the subdirectory would add a second generic name',
  );
  assert.equal(
    NOT_ENUMERATED_DIRECTORY_NAMES.includes(RESERVED_REVERSE_SUBDIRECTORY),
    false,
  );
  assert.equal(
    new Set(NEVER_WALKED_DIRECTORY_NAMES).size,
    NEVER_WALKED_DIRECTORY_NAMES.length,
    'the name is not listed twice',
  );
});

test('PX-214 / C002 postcondition: publishing into the reserve does not move the digest', async () => {
  const tree = createSyntheticTree(SUBJECT_TREE);
  try {
    const before = digestTree(tree.root);
    await analyzeProject({ root: tree.root, out: reservedReverseDirectory(tree.root), through: THROUGH_SCOPE });
    const after = digestTree(tree.root);

    assert.equal(after.sha256, before.sha256, 'the tree hashed the same before and after');
    assert.equal(after.fileCount, before.fileCount);
    assert.deepEqual(after.unreadable, before.unreadable);

    const scope = JSON.parse(readFileSync(join(reservedReverseDirectory(tree.root), 'ANALYSIS-SCOPE.json'), 'utf8'));
    assert.equal(scope.target_digest.sha256, before.sha256, 'the record states the digest it took');
    assert.equal(scope.target_digest.unmodified, true);
    assert.deepEqual(
      scope.target_digest.excluded_directories,
      [...NEVER_WALKED_DIRECTORY_NAMES],
      'a digest over a tree one directory smaller says which directory it did not cover',
    );

    // A second run over a tree whose reserve is already populated is the case the
    // exclusion exists for: the first run's own output is present.
    await analyzeProject({ root: tree.root, out: reservedReverseDirectory(tree.root), through: THROUGH_SCOPE });
    assert.equal(digestTree(tree.root).sha256, before.sha256, 'the populated tree still matches');
  } finally {
    tree.dispose();
  }
});

test('PX-214 / C002 invariant: no walk returns a path beneath the reserve', () => {
  const tree = createSyntheticTree(SUBJECT_TREE);
  try {
    const digest = digestTree(tree.root);
    const reserved = reservedReverseDirectory(tree.root);
    mkdirSync(reserved, { recursive: true });
    writeFileSync(join(reserved, 'PLANTED.json'), '{}\n');

    assert.equal(
      listTreeFiles(tree.root).some((path) => path.startsWith(`${RESERVED_ROOT_NAME}/`)),
      false,
      'the file walk does not return the planted file',
    );
    assert.equal(
      digestTree(tree.root).sha256,
      digest.sha256,
      'a file under the reserve does not move the digest',
    );
    assert.equal(
      listArtefacts(tree.root).some((artefact) => artefact.path.startsWith(RESERVED_ROOT_NAME)),
      false,
      'the artefact walk does not carry the reserve as material',
    );
  } finally {
    tree.dispose();
  }
});

// ---------------------------------------------------------------------------
// C003 — one destination beneath the target is accepted, and only one
// ---------------------------------------------------------------------------

test('PX-214 / C003 precondition: the destination is judged before a stage runs', async () => {
  const tree = createSyntheticTree(SUBJECT_TREE);
  try {
    await assert.rejects(
      () => analyzeProject({ root: tree.root, out: join(tree.root, 'analysis'), through: THROUGH_SCOPE }),
      /inside the target/,
      'a destination that is not the reserve is still refused',
    );
    assert.equal(existsSync(join(tree.root, 'analysis')), false, 'a refused destination is not created');
  } finally {
    tree.dispose();
  }
});

test('PX-214 / C003 postcondition: four destinations, four verdicts', async () => {
  const tree = createSyntheticTree(SUBJECT_TREE);
  const outside = createSyntheticTree({ 'placeholder.txt': '' });
  try {
    await assert.rejects(
      () => analyzeProject({ root: tree.root, out: tree.root, through: THROUGH_SCOPE }),
      /inside the target/,
      'the target itself is refused',
    );
    await assert.rejects(
      () => analyzeProject({ root: tree.root, out: join(tree.root, 'analysis'), through: THROUGH_SCOPE }),
      /inside the target/,
      'a path beneath the target that is not the reserve is refused',
    );

    await analyzeProject({ root: tree.root, out: reservedReverseDirectory(tree.root), through: THROUGH_SCOPE });
    assert.equal(
      existsSync(join(reservedReverseDirectory(tree.root), 'ANALYSIS-SCOPE.json')),
      true,
      'the reserve beneath the target is accepted',
    );

    await analyzeProject({ root: tree.root, out: outside.root, through: THROUGH_SCOPE });
    assert.equal(
      existsSync(join(outside.root, 'ANALYSIS-SCOPE.json')),
      true,
      'a destination outside the target is accepted, as it always was',
    );
  } finally {
    tree.dispose();
    outside.dispose();
  }
});

test('PX-214 / C003 invariant: a refusal names the target and the destination it refused', async () => {
  const tree = createSyntheticTree(SUBJECT_TREE);
  const refusedDestination = join(tree.root, 'analysis');
  try {
    await assert.rejects(
      () => analyzeProject({ root: tree.root, out: refusedDestination, through: THROUGH_SCOPE }),
      (error) => {
        assert.match(error.message, /inside the target/, 'the phrase the existing guard is matched on survives');
        assert.equal(error.message.includes(refusedDestination), true, 'the destination is named');
        assert.equal(error.message.includes(tree.root), true, 'the target is named');
        return true;
      },
    );
  } finally {
    tree.dispose();
  }
});

// ---------------------------------------------------------------------------
// C004 — the destination and the exclusion are one binding
// ---------------------------------------------------------------------------

test('PX-214 / C004 invariant: the reserved root name is written once in the family', () => {
  const literal = `'${RESERVED_ROOT_NAME}'`;
  const carriers = LAYER_LIB_ROOTS
    .flatMap((layerLib) => {
      const relative = join(layerLib.slice(FAMILY_LIB_ROOTS.length + 1));
      return readdirSync(layerLib).map((name) => ({ file: join(layerLib, name), reported: join(relative, name) }));
    })
    .filter((entry) => entry.reported.endsWith('.mjs'))
    .filter((entry) => readFileSync(entry.file, 'utf8').includes(literal))
    .map((entry) => entry.reported);

  assert.deepEqual(
    carriers,
    [join('workspacify-tree', 'lib', 'reserved-root.mjs')],
    'the root is one binding, in the layer both later stages may read, not a literal retyped by each consumer',
  );

  // The forward rotation may not depend on the reverse tree, so the declaration
  // cannot live there: the reverse tree imports it and re-exports it, and that
  // direction is the one the layers permit.
  assert.equal(
    readFileSync(join(LIB_ROOT, 'holdout-ledger.mjs'), 'utf8').includes(literal),
    false,
    'the reverse tree re-exports the declaration rather than restating it',
  );

  const entrance = readFileSync(RUNNER, 'utf8');
  assert.equal(entrance.includes(literal), false, 'the entrance does not retype the root it builds the destination from');
  assert.match(entrance, /RESERVED_ROOT_NAME|reservedReverseDirectory/, 'the entrance imports the derived destination');
});

// ---------------------------------------------------------------------------
// C005 — the document and the entrance declare the same, empty, surface
// ---------------------------------------------------------------------------

test('PX-214 / C005 precondition: the command file heads no option as an argument', () => {
  const section = argumentsSection(readFileSync(COMMAND_PATH, 'utf8'));
  assert.deepEqual(
    [...section.matchAll(/^\s+- `(--[a-z-]+)/gm)].map(([, name]) => name),
    [],
    'an option the entrance refuses is named in prose, never headed as an argument the operator may pass',
  );
});

test('PX-214 / C005 postcondition: the withdrawn options are named as withdrawn, and the destination is stated', () => {
  const source = readFileSync(RUNNER, 'utf8');
  const declared = new Set([...declaredUsage(source).matchAll(/--[a-z-]+/g)].map(([name]) => name));
  assert.equal(declared.has('--through'), false, 'the entrance no longer declares --through');
  assert.equal(declared.has('--out'), false, 'the entrance no longer declares --out for anything but the spike');

  const section = argumentsSection(readFileSync(COMMAND_PATH, 'utf8'));
  for (const withdrawn of ['--out', '--through', '--query']) {
    assert.equal(
      section.includes(withdrawn),
      true,
      `${withdrawn} is named as withdrawn rather than dropped: a question silently dropped reads as one answered`,
    );
  }
  assert.match(section, /current working directory/i, 'the subject is stated');
  assert.equal(
    section.includes(RESERVE_RELATIVE),
    true,
    'the destination is stated as the path it is, not as either of its two segments in isolation',
  );
  assert.equal(
    section.includes('.workspacify-reverse'),
    false,
    'the superseded dotted name is gone rather than merely outnumbered: a reader who finds both cannot tell which one the tool obeys',
  );
});

test('PX-214 / C005 invariant: neither the document nor the entrance declares an argument the other does not', () => {
  const source = readFileSync(RUNNER, 'utf8');
  const section = argumentsSection(readFileSync(COMMAND_PATH, 'utf8'));

  const documented = new Set([...section.matchAll(/^\s+- `(--[a-z-]+)/gm)].map(([, name]) => name));
  assert.deepEqual(
    [...documented].filter((name) => !declaredUsage(source).includes(name)),
    [],
    'the document documents no option the entrance does not declare',
  );
});

// ---------------------------------------------------------------------------
// The repository is never the subject of a test
// ---------------------------------------------------------------------------

test('PX-214 / IT: no test run leaves a reserve in the repository', () => {
  assert.equal(
    existsSync(join(PROJECT_ROOT, RESERVED_ROOT_NAME)),
    false,
    'a test that inherited the repository as its cwd would have published into it',
  );
});
