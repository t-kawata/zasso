// @verifies C001
// @verifies C002
// @verifies C003
/**
 * The language representatives — the declaration, read and verified.
 *
 * The population is data. Every later ticket in this phase reaches the six
 * representatives through `LANGUAGES.json` rather than through a path typed into
 * its own test file, so these tests read the declaration the way a consumer
 * would, and they assert the four properties the design puts on the population:
 * the language set equals `TARGET_LANGUAGES` exactly, each tree digest
 * reproduces, each declared construct is present where the declaration says it
 * is, and the three subject populations stay apart.
 *
 * Nothing here writes to a fixture. A test that mutated a representative would
 * make every later reading of it a reading of something else, so the error cases
 * build synthetic trees through `createSyntheticTree` and damage those instead.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TARGET_LANGUAGES } from '../../../.claude/scripts/workspacify-reverse/lib/analysis-tech.mjs';
import { GRAMMAR_BY_LANGUAGE } from '../../../.claude/scripts/workspacify-reverse/lib/structure.mjs';
import {
  BUILD_BY_LANGUAGE,
  CONSTRUCT_MARKERS,
  LANGUAGE_DECLARATION_PATH,
  MANIFEST_BY_LANGUAGE,
  PATTERN_REPRESENTATIVE_ROOTS,
  buildDeclaration,
  buildDeclarationEntry,
  digestRepresentative,
  loadLanguageRepresentatives,
  serialiseDeclaration,
  verifyDeclaration,
  verifyRepresentative,
} from '../../../.claude/scripts/workspacify-reverse/lib/language-representatives.mjs';
import { createSyntheticTree } from '../helpers/scratch.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

/** A recorded command line is a `node -e` invocation, so it can be re-run as argv rather than shelled. */
const COMMAND_LINE_SHAPE = /^node -e "(.*)"$/s;

/** The declaration as committed, read once: the subject of every assertion below. */
const declaration = loadLanguageRepresentatives({ projectRoot: PROJECT_ROOT });

/** One representative by language, failing loudly rather than returning undefined. */
// [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
function representative(language) {
  const entry = declaration.languages.find((candidate) => candidate.language === language);
  assert.ok(entry, `${language} has a representative in the declaration`);
  return entry;
}

/** The line of a file at a 1-indexed number, or `undefined` when the file is shorter. */
// [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
function lineAt(file, lineNumber) {
  return readFileSync(file, 'utf8').split('\n')[lineNumber - 1];
}

test('C001 precondition — every representative carries a build manifest, a test file and a source directory nested below its root', () => {
  for (const language of TARGET_LANGUAGES) {
    const entry = representative(language);
    const root = join(PROJECT_ROOT, entry.root);

    assert.equal(
      existsSync(join(root, MANIFEST_BY_LANGUAGE[language])),
      true,
      `${language} carries its build manifest at ${MANIFEST_BY_LANGUAGE[language]}`,
    );
    assert.equal(entry.testFileCount >= 1, true, `${language} carries a test file`);
    assert.equal(entry.flat, false, `${language} nests source below its root, so a partition is possible`);
  }
});

test('C001 postcondition — every representative records a revision, a digest, an environment, a build and its constructs', () => {
  for (const entry of declaration.languages) {
    assert.equal(typeof entry.root, 'string', `${entry.language} names its root`);
    assert.equal(typeof entry.revision.commit, 'string', `${entry.language} is pinned to a revision`);
    assert.match(entry.treeDigest.sha256, /^[0-9a-f]{64}$/, `${entry.language} records a digest`);
    assert.equal(entry.treeDigest.fileCount > 0, true, `${entry.language}'s digest covers real files`);
    assert.equal(typeof entry.environment.os, 'string', `${entry.language} records the OS the digest was taken on`);
    assert.equal(typeof entry.environment.arch, 'string', `${entry.language} records the architecture`);
    assert.match(entry.environment.commandLine, COMMAND_LINE_SHAPE, `${entry.language} records how the digest was taken`);
    assert.equal(typeof entry.build.command, 'string', `${entry.language} records its build command`);
    assert.equal(typeof entry.build.offline, 'boolean', `${entry.language} states whether the build reaches the network`);
    assert.equal(typeof entry.build.reason, 'string', `${entry.language} states why the flag reads as it does`);
    assert.ok(entry.constructs.length >= 1, `${entry.language} names at least one construct`);
  }
});

test('C001 postcondition — every named construct is present at the file and line the declaration names', () => {
  for (const entry of declaration.languages) {
    for (const construct of entry.constructs) {
      const file = join(PROJECT_ROOT, entry.root, construct.path);

      assert.equal(existsSync(file), true, `${entry.language}/${construct.id} names a file that exists: ${construct.path}`);
      const line = lineAt(file, construct.line);
      assert.equal(typeof line, 'string', `${entry.language}/${construct.id} names a line inside ${construct.path}`);
      assert.equal(
        line.includes(construct.marker),
        true,
        `${entry.language}/${construct.id} carries "${construct.marker}" at ${construct.path}:${construct.line}`,
      );
    }
  }
});

test('C001 invariant — the declaration names every declared language and no other, in both directions', () => {
  const declared = declaration.languages.map((entry) => entry.language);

  assert.equal(new Set(declared).size, declared.length, 'no language appears twice');
  assert.deepEqual(
    [...declared].sort(),
    [...TARGET_LANGUAGES].sort(),
    'a language cannot be dropped from the population by being dropped from the declaration',
  );
});

test('C001 invariant as a property — the symmetric difference of the two sets is empty, computed here rather than read', () => {
  const declaredLanguages = new Set(declaration.languages.map((entry) => entry.language));
  const targetLanguages = new Set(TARGET_LANGUAGES);
  const symmetricDifference = [
    ...[...targetLanguages].filter((language) => !declaredLanguages.has(language)),
    ...[...declaredLanguages].filter((language) => !targetLanguages.has(language)),
  ];

  assert.deepEqual(symmetricDifference, [], 'neither list holds a language the other lacks');
});

test('C001 invariant — every grammar the instrument declares is exercised by a representative', () => {
  assert.deepEqual(
    declaration.languages.map((entry) => entry.language).sort(),
    Object.keys(GRAMMAR_BY_LANGUAGE).sort(),
    'a grammar without a representative is an untested table row',
  );
});

test('C001 boundary — a single test file is accepted, because the criterion is presence rather than sufficiency', () => {
  const entry = representative('rust');

  assert.equal(entry.testFileCount, 1, 'the criterion is presence, and the open item records what it does not settle');
});

test('C001 boundary — a tree whose files all sit at its root is recorded as flat, with the fact stated', () => {
  const flat = createSyntheticTree({ 'a.py': 'x = 1\n', 'b.py': 'y = 2\n' }, { prefix: 'p24-flat-' });
  try {
    const entry = buildDeclarationEntry('python', flat.root, { projectRoot: PROJECT_ROOT });

    assert.equal(entry.flat, true, 'a flat tree cannot exercise a partition measurement, and the declaration says so');
    assert.equal(typeof entry.flat, 'boolean', 'the flag is present rather than omitted');
  } finally {
    flat.dispose();
  }
});

test('C001 boundary — one nested directory beside one root file is non-flat, which pins flatness to nesting rather than to a count', () => {
  const nested = createSyntheticTree({ 'a.py': 'x = 1\n', 'src/b.py': 'y = 2\n' }, { prefix: 'p24-nested-' });
  try {
    assert.equal(
      buildDeclarationEntry('python', nested.root, { projectRoot: PROJECT_ROOT }).flat,
      false,
      'one nested source directory is enough for a partition to be possible',
    );
  } finally {
    nested.dispose();
  }
});

test('C001 boundary — a tree spanning two target languages is declared under its dominant language with the mixture stated', () => {
  const mixed = createSyntheticTree(
    { 'src/a.ts': 'export const a = 1;\n', 'src/b.ts': 'export const b = 2;\n', 'src/c.js': 'module.exports = 3;\n' },
    { prefix: 'p24-mixed-' },
  );
  try {
    const entry = buildDeclarationEntry('typescript', mixed.root, { projectRoot: PROJECT_ROOT });

    assert.equal(entry.language, 'typescript', 'the dominant extension decides the declaration');
    assert.deepEqual(entry.languagesInTree, ['javascript', 'typescript'], 'the mixture is a recorded property');
  } finally {
    mixed.dispose();
  }
});

test('C001 boundary — an empty declaration produces a finding naming every language, so it cannot pass by having nothing to compare', () => {
  const findings = verifyDeclaration({ ...declaration, languages: [] }, { projectRoot: PROJECT_ROOT });
  const named = findings
    .filter((finding) => finding.code === 'language-without-representative')
    .map((finding) => finding.language);

  assert.deepEqual([...named].sort(), [...TARGET_LANGUAGES].sort());
});

test('C001 boundary — an entry that omits the flat flag produces a finding, because an omitted flag reads as a usable tree', () => {
  const source = representative('python');
  const withoutFlag = { ...source };
  delete withoutFlag.flat;

  const findings = verifyRepresentative(withoutFlag, { projectRoot: PROJECT_ROOT });

  assert.equal(findings.some((finding) => finding.code === 'flat-flag-absent'), true);
});

test('C002 precondition — a representative digests to a shape a reader can compare', () => {
  const measured = digestRepresentative('typescript', { projectRoot: PROJECT_ROOT });

  assert.match(measured.sha256, /^[0-9a-f]{64}$/);
  assert.equal(measured.fileCount > 0, true, 'the walk reached real files, so the digest is not of nothing');
  assert.deepEqual(measured.unreadable, [], 'every file the digest covers was read');
});

test('C002 postcondition — the recorded digest reproduces for each of the six', () => {
  for (const entry of declaration.languages) {
    const measured = digestRepresentative(entry.language, { projectRoot: PROJECT_ROOT });

    assert.equal(measured.sha256, entry.treeDigest.sha256, `${entry.language} reproduces its recorded digest`);
    assert.equal(measured.fileCount, entry.treeDigest.fileCount, `${entry.language} reproduces its file count`);
  }
});

test('C002 postcondition — the recorded command line, run verbatim, prints the recorded digest', () => {
  for (const entry of declaration.languages) {
    const script = COMMAND_LINE_SHAPE.exec(entry.environment.commandLine)[1];
    const rerun = spawnSync(process.execPath, ['-e', script], { cwd: PROJECT_ROOT, encoding: 'utf8' });

    assert.equal(rerun.status, 0, `${entry.language}: ${rerun.stderr}`);
    assert.equal(rerun.stdout.trim(), entry.treeDigest.sha256, `${entry.language} can be re-derived rather than trusted`);
  }
});

test('C002 invariant — a digest that does not reproduce is reported with both digests and both environments', () => {
  const entry = representative('typescript');
  const recorded = { sha256: 'f'.repeat(64), fileCount: 1, unreadable: [] };
  const damaged = { ...entry, treeDigest: recorded, environment: { ...entry.environment, os: 'linux' } };
  const measured = { sha256: 'a'.repeat(64), fileCount: 2, unreadable: [] };

  const findings = verifyRepresentative(damaged, { projectRoot: PROJECT_ROOT, digest: () => measured });
  const mismatch = findings.find((finding) => finding.code === 'digest-mismatch');

  assert.ok(mismatch, 'a digest that does not reproduce is a finding');
  assert.equal(mismatch.recorded.sha256, recorded.sha256);
  assert.equal(mismatch.measured.sha256, measured.sha256);
  assert.equal(mismatch.recorded.environment.os, 'linux', 'the environment the wrong digest was taken in is named');
  assert.equal(mismatch.measured.environment.os, process.platform, 'and so is the one it was taken in now');
});

test('C002 invariant — a digest mismatch is reported rather than repaired, so the population cannot move without a finding', () => {
  const entry = representative('typescript');
  const recorded = { sha256: 'f'.repeat(64), fileCount: 1, unreadable: [] };
  const damaged = { ...entry, treeDigest: recorded };

  verifyRepresentative(damaged, {
    projectRoot: PROJECT_ROOT,
    digest: () => ({ sha256: 'a'.repeat(64), fileCount: 2, unreadable: [] }),
  });

  assert.equal(damaged.treeDigest.sha256, recorded.sha256, 'nothing re-pinned the entry');
  assert.equal(entry.treeDigest.sha256, representative('typescript').treeDigest.sha256, 'and the declaration is untouched');
});

test('C002 invariant — a revision that resolves to no commit in the repository is reported rather than passing as a pin', () => {
  const entry = representative('rust');
  const unpinned = { ...entry, revision: { ...entry.revision, commit: '0'.repeat(40) } };

  const findings = verifyRepresentative(unpinned, { projectRoot: PROJECT_ROOT });

  assert.equal(findings.some((finding) => finding.code === 'revision-unresolvable'), true);
});

test('C002 invariant as a property — digesting the same tree twice yields the same value', () => {
  for (const entry of declaration.languages) {
    const first = digestRepresentative(entry.language, { projectRoot: PROJECT_ROOT });
    const second = digestRepresentative(entry.language, { projectRoot: PROJECT_ROOT });

    assert.equal(first.sha256, second.sha256, `${entry.language} digests deterministically`);
    assert.equal(first.fileCount, second.fileCount);
  }
});

test('C003 precondition — the three subject populations are declared separately, each with its purpose named', () => {
  for (const name of ['experiment', 'patterns', 'languages']) {
    const population = declaration.populations[name];

    assert.ok(population, `${name} is declared`);
    assert.equal(typeof population.purpose, 'string', `${name} states what it is for`);
    assert.equal(population.purpose.length > 0, true, `${name}'s purpose is a sentence rather than a placeholder`);
    assert.ok(population.roots.length > 0, `${name} names its roots`);
  }
});

test('C003 precondition — the three population declarations name the roots the design names', () => {
  assert.deepEqual(declaration.populations.experiment.roots, ['siprs-for-reverse']);
  assert.deepEqual(declaration.populations.patterns.roots, [...PATTERN_REPRESENTATIVE_ROOTS]);
  assert.deepEqual(
    declaration.populations.languages.roots,
    declaration.languages.map((entry) => entry.root),
    'the language population is the representatives, named once',
  );
});

test('C003 postcondition — the language representatives are declared as the instrument\'s validation population', () => {
  const purpose = declaration.populations.languages.purpose;

  assert.match(purpose, /validation population/i, 'the declaration says what this population is for');
  assert.match(purpose, /not the experiment/i, 'and what it is not');
});

test('C003 invariant — no language representative is used as the experiment subject', () => {
  const languageRoots = declaration.languages.map((entry) => entry.root);
  const otherPopulations = [
    ...declaration.populations.experiment.roots,
    ...declaration.populations.patterns.roots,
  ];

  for (const root of languageRoots) {
    assert.equal(
      otherPopulations.includes(root),
      false,
      `${root} is a validation tree and must not be reachable as an answer key`,
    );
  }
});

test('C003 invariant — no representative root holds another, computed as a path-prefix check', () => {
  const roots = declaration.languages.map((entry) => entry.root);

  for (const outer of roots) {
    for (const inner of roots) {
      if (outer === inner) continue;
      assert.equal(inner.startsWith(`${outer}/`), false, `${outer} must not hold ${inner}`);
    }
  }
});

test('C003 error — a declaration naming the experiment subject as a language representative produces a finding', () => {
  const conflated = {
    ...declaration,
    languages: [
      { ...representative('rust'), root: 'siprs-for-reverse' },
      ...declaration.languages.filter((entry) => entry.language !== 'rust'),
    ],
  };

  const findings = verifyDeclaration(conflated, { projectRoot: PROJECT_ROOT });

  assert.equal(
    findings.some((finding) => finding.code === 'population-overlap' && finding.language === 'rust'),
    true,
    'the three populations cannot be conflated by a typo',
  );
});

test('C002 error — a declared construct whose marker is absent produces a finding naming the construct', () => {
  const entry = representative('typescript');
  const damaged = {
    ...entry,
    constructs: [{ id: 'export-star', marker: 'export *', path: 'src/index.ts', line: 999 }],
  };

  const findings = verifyRepresentative(damaged, { projectRoot: PROJECT_ROOT });

  assert.equal(
    findings.some((finding) => finding.code === 'construct-marker-absent' && finding.construct === 'export-star'),
    true,
  );
});

test('C002 error — a declared construct whose path is absent produces a finding naming the path', () => {
  const entry = representative('typescript');
  const damaged = {
    ...entry,
    constructs: [{ id: 'export-star', marker: 'export *', path: 'src/missing.ts', line: 1 }],
  };

  const findings = verifyRepresentative(damaged, { projectRoot: PROJECT_ROOT });
  const absent = findings.find((finding) => finding.code === 'construct-path-absent');

  assert.ok(absent, 'a declaration cannot claim material the tree does not contain');
  assert.equal(absent.path, 'src/missing.ts');
});

test('C002 error — a missing offline flag is an error rather than an assumption that the tree is buildable', () => {
  const entry = representative('rust');
  const assumed = { ...entry, build: { command: entry.build.command } };

  const findings = verifyRepresentative(assumed, { projectRoot: PROJECT_ROOT });

  assert.equal(
    findings.some((finding) => finding.code === 'absent-offline-flag'),
    true,
    'an assumed-buildable representative would be handed to an execution channel that cannot run it',
  );
});

test('C002 error — offline: false is a statement rather than a missing value, and carries its reason', () => {
  const entry = representative('rust');
  const stated = { ...entry, build: { command: entry.build.command, offline: false, reason: 'the registry must be reached' } };

  const findings = verifyRepresentative(stated, { projectRoot: PROJECT_ROOT });

  assert.deepEqual(findings.filter((finding) => finding.code === 'absent-offline-flag'), []);
  assert.equal(findings.some((finding) => finding.code === 'offline-without-reason'), false);
});

test('C001 error — a language outside the declared six produces a finding rather than being analysed', () => {
  const widened = {
    ...declaration,
    languages: [...declaration.languages, { ...representative('rust'), language: 'ruby' }],
  };

  const findings = verifyDeclaration(widened, { projectRoot: PROJECT_ROOT });

  assert.equal(findings.some((finding) => finding.code === 'unknown-language' && finding.language === 'ruby'), true);
});

test('C001 invariant — every recorded marker is one of that language\'s declared markers, which catches a Rust idiom pasted into another entry', () => {
  for (const entry of declaration.languages) {
    const vocabulary = Object.values(CONSTRUCT_MARKERS[entry.language]);

    for (const construct of entry.constructs) {
      assert.equal(
        vocabulary.includes(construct.marker),
        true,
        `${construct.marker} is not a declared ${entry.language} marker`,
      );
    }
  }
});

test('C001 invariant — the declaration is regenerated from the trees rather than transcribed', () => {
  const regenerated = serialiseDeclaration(buildDeclaration({ projectRoot: PROJECT_ROOT, previous: declaration }));

  assert.equal(
    regenerated,
    readFileSync(join(PROJECT_ROOT, LANGUAGE_DECLARATION_PATH), 'utf8'),
    'the digest and the construct lines are measured, so regenerating produces no diff',
  );
});

test('C001 invariant — reading the declaration and writing it back is byte-identical, so a later ticket adds no spurious diff', () => {
  assert.equal(
    serialiseDeclaration(loadLanguageRepresentatives({ projectRoot: PROJECT_ROOT })),
    readFileSync(join(PROJECT_ROOT, LANGUAGE_DECLARATION_PATH), 'utf8'),
  );
});

test('C001 normal — every language names the build command and the toolchain that command needs', () => {
  for (const language of TARGET_LANGUAGES) {
    assert.equal(typeof BUILD_BY_LANGUAGE[language].command, 'string', `${language} names a build command`);
    assert.equal(typeof BUILD_BY_LANGUAGE[language].toolchain, 'string', `${language} names its toolchain`);
    assert.equal(representative(language).build.command, BUILD_BY_LANGUAGE[language].command);
  }
});
