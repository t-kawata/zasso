// [::TICKET::] P22-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-2 --for-spec --no-implementation-order`.
/**
 * The holdout ledger: freeze a candidate, recompute its digest, and hand a
 * human the material to judge it by.
 *
 * Every test builds its own throwaway project so that a freeze can never write
 * into the repository being measured. The candidate trees live under the same
 * relative path the real declaration uses, so the tests exercise the real path
 * arithmetic rather than a simplified one.
 *
 * Two properties matter more than any count here:
 *   - the machine never decides eligibility (UT-7);
 *   - a frozen digest can never be rewritten (UT-16).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  CANDIDATES_RELATIVE_PATH,
  LEDGER_RELATIVE_PATH,
  detectPrimaryLanguage,
  digestTree,
  evaluateEligibility,
  freezeLedger,
  loadLedger,
  nonCommentLines,
  renderLedgerReport,
} from '../../../.claude/scripts/workspacify-reverse/lib/holdout-ledger.mjs';
import { writeSyntheticTree } from '../helpers/scratch.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const RUN_SCRIPT = fileURLToPath(new URL('../../../.claude/scripts/workspacify-reverse/run.mjs', import.meta.url));
const FROZEN_AT = '2026-09-10T00:00:00Z';
const CORPUS_PREFIX = 'tests/workspacify-reverse/holdout/corpus';

const RUST_CANDIDATE = Object.freeze({
  id: 'mini-rust',
  path: `${CORPUS_PREFIX}/mini-rust`,
  domain: 'a small Rust audio library',
  declaredLanguage: 'rust',
  provenance: 'synthetic, declared by ledger.test.mjs',
});
const TS_CANDIDATE = Object.freeze({
  id: 'mini-ts',
  path: `${CORPUS_PREFIX}/mini-ts`,
  domain: 'a small TypeScript command line tool',
  declaredLanguage: 'typescript',
  provenance: 'synthetic, declared by ledger.test.mjs',
});
const OPAQUE_CANDIDATE = Object.freeze({
  id: 'mini-opaque',
  path: `${CORPUS_PREFIX}/mini-opaque`,
  domain: 'a data directory with no source',
  declaredLanguage: 'unknown',
  provenance: 'synthetic, declared by ledger.test.mjs',
});
const PARTIAL_CANDIDATE = Object.freeze({
  id: 'mini-partial',
  path: `${CORPUS_PREFIX}/mini-partial`,
  domain: 'a Rust project with no tests and no history',
  declaredLanguage: 'rust',
  provenance: 'synthetic, declared by ledger.test.mjs',
});

const RUST_FILES = {
  'Cargo.toml': '[package]\nname = "mini-rust"\nversion = "0.1.0"\n\n[dev-dependencies]\n',
  'src/lib.rs': 'pub fn add(a: u8, b: u8) -> u8 {\n    a + b\n}\n',
  'src/internal/mod.rs': 'pub fn helper() -> u8 {\n    0\n}\n',
  'tests/one.rs': '#[test]\nfn adds() {\n    assert_eq!(1 + 1, 2);\n}\n',
  'docs/design.md': '# Design\n\nThe boundary is the audio path.\n',
};
const TS_FILES = {
  'package.json': `${JSON.stringify({ name: 'mini-ts', scripts: { test: 'node --test' } }, null, 2)}\n`,
  'src/index.ts': 'export const add = (a: number, b: number): number => a + b;\n',
  'src/util/format.ts': 'export const fmt = (n: number): string => String(n);\n',
  'test/index.test.ts': 'test("adds", () => {});\n',
};
const OPAQUE_FILES = {
  'data/table.csv': 'a,b\n1,2\n',
  'notes.txt': 'no source here\n',
};
const PARTIAL_FILES = {
  'Cargo.toml': '[package]\nname = "mini-partial"\nversion = "0.1.0"\n',
  'main.rs': 'fn main() {}\n',
};

/** A throwaway project holding the declared candidate trees in their declared places. */
function makeHoldoutProject(candidateFiles = {}) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'p22-2-ledger-'));
  const declared = {
    [RUST_CANDIDATE.path]: RUST_FILES,
    [TS_CANDIDATE.path]: TS_FILES,
    [OPAQUE_CANDIDATE.path]: OPAQUE_FILES,
    [PARTIAL_CANDIDATE.path]: PARTIAL_FILES,
    ...candidateFiles,
  };
  for (const [relativePath, files] of Object.entries(declared)) {
    writeSyntheticTree(join(projectRoot, relativePath), files);
  }
  return projectRoot;
}

// --- UT-1: the ledger loads and every recorded digest recomputes --------------

test('UT-1: loadLedger recomputes every recorded sha256 and reports drift by id', () => {
  const projectRoot = makeHoldoutProject();
  try {
    const ledger = freezeLedger({ projectRoot, candidates: [RUST_CANDIDATE, TS_CANDIDATE], frozenAt: FROZEN_AT });
    const result = loadLedger({ projectRoot });

    assert.equal(result.entryCount, 2);
    assert.equal(result.recomputed.length, 2);
    for (const entry of result.recomputed) assert.match(entry.sha256, /^[0-9a-f]{64}$/);
    assert.equal(result.recomputed[0].sha256, ledger.holdouts[0].sha256);
    assert.deepEqual(result.drifted, []);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

// --- UT-3 / UT-7 / C001: the profile a human weighs ---------------------------

test('UT-3: evaluateEligibility emits a capability, observability, falsifiability and risk profile', () => {
  const projectRoot = makeHoldoutProject();
  try {
    const profile = evaluateEligibility(RUST_CANDIDATE, { projectRoot });
    for (const dimension of ['capability', 'observability', 'falsifiability', 'risk']) {
      assert.equal(typeof profile[dimension], 'object', `${dimension} must be present`);
      assert.ok(profile[dimension].evidence.length > 0, `${dimension} must cite evidence`);
    }
    assert.equal(typeof profile.capability.buildManifestPresent, 'boolean');
    assert.equal(profile.capability.buildManifestPresent, true);
    assert.equal(profile.observability.testCommand, 'cargo test');
    assert.equal(profile.falsifiability.testFileCount, 1);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('UT-7: evaluateEligibility never emits a boolean eligible field', () => {
  const projectRoot = makeHoldoutProject();
  try {
    for (const candidate of [RUST_CANDIDATE, PARTIAL_CANDIDATE, OPAQUE_CANDIDATE]) {
      const profile = evaluateEligibility(candidate, { projectRoot });
      assert.equal(
        Object.prototype.hasOwnProperty.call(profile, 'eligible'),
        false,
        'the machine must not decide eligibility',
      );
      assert.equal(Object.keys(profile).some((key) => /^(is|has)Eligible$/.test(key)), false);
      assert.equal(JSON.stringify(profile).includes('"eligible"'), false);
    }
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('C001 precondition: the profile schema is exactly the four dimensions and their reasons', () => {
  const projectRoot = makeHoldoutProject();
  try {
    const profile = evaluateEligibility(RUST_CANDIDATE, { projectRoot });
    assert.deepEqual(Object.keys(profile).sort(), ['capability', 'falsifiability', 'observability', 'reasons', 'risk']);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('C001 postcondition: every dimension carries evidence and a reason a human reads', () => {
  const projectRoot = makeHoldoutProject();
  try {
    const profile = evaluateEligibility(PARTIAL_CANDIDATE, { projectRoot });
    assert.ok(profile.reasons.length > 0);
    assert.equal(profile.reasons.every((reason) => typeof reason === 'string' && reason.length > 0), true);
    assert.ok(
      profile.risk.signals.includes('no-test-files'),
      `a project without tests must say so, got: ${profile.risk.signals.join(', ')}`,
    );
    assert.ok(profile.risk.signals.includes('no-git-history'));
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('C001 invariant: eligibility is decided by a human, so a rejected-looking profile still returns material', () => {
  const projectRoot = makeHoldoutProject();
  try {
    const profile = evaluateEligibility(OPAQUE_CANDIDATE, { projectRoot });
    assert.equal(typeof profile, 'object');
    assert.ok(profile.reasons.length > 0, 'even a poor candidate gets material rather than a verdict');
    assert.equal(profile.reasons.every((reason) => typeof reason === 'string'), true);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

// --- UT-5 / UT-16 / C002: drift and append-only -------------------------------

test('UT-5: a holdout modified after freezing is detected as a sha256 mismatch naming the id', () => {
  const projectRoot = makeHoldoutProject();
  try {
    freezeLedger({ projectRoot, candidates: [RUST_CANDIDATE], frozenAt: FROZEN_AT });
    writeFileSync(join(projectRoot, RUST_CANDIDATE.path, 'src', 'lib.rs'), '// altered\n', { flag: 'a' });

    const result = loadLedger({ projectRoot });
    assert.equal(result.drifted.length, 1);
    assert.equal(result.drifted[0].id, RUST_CANDIDATE.id);
    assert.notEqual(result.drifted[0].observed, result.drifted[0].frozen);
    assert.match(renderLedgerReport(result), new RegExp(RUST_CANDIDATE.id));
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('C002 postcondition: the drifted holdout is reported with the frozen and the observed digest', () => {
  const projectRoot = makeHoldoutProject();
  try {
    const ledger = freezeLedger({ projectRoot, candidates: [RUST_CANDIDATE], frozenAt: FROZEN_AT });
    const frozen = ledger.holdouts[0].sha256;
    writeFileSync(join(projectRoot, RUST_CANDIDATE.path, 'src', 'lib.rs'), '// altered\n', { flag: 'a' });

    const result = loadLedger({ projectRoot });
    assert.equal(result.drifted[0].frozen, frozen);
    assert.match(result.drifted[0].observed, /^[0-9a-f]{64}$/);

    const report = renderLedgerReport(result);
    assert.match(report, new RegExp(frozen), 'the report must print the frozen digest');
    assert.match(report, new RegExp(result.drifted[0].observed), 'the report must print the observed digest');
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('C002 precondition: a missing ledger is refused rather than invented', () => {
  const emptyProject = mkdtempSync(join(tmpdir(), 'p22-2-empty-'));
  try {
    assert.throws(
      () => loadLedger({ projectRoot: emptyProject }),
      (error) => {
        assert.match(error.message, /HOLDOUTS\.json/, 'the error must name the missing ledger path');
        assert.match(error.message, /holdout freeze/, 'the error must name the command that writes one');
        return true;
      },
    );
  } finally {
    rmSync(emptyProject, { recursive: true, force: true });
  }
});

test('UT-16 / C002 invariant: a frozen sha256 cannot be rewritten', () => {
  const projectRoot = makeHoldoutProject();
  try {
    const first = freezeLedger({ projectRoot, candidates: [RUST_CANDIDATE], frozenAt: FROZEN_AT });
    writeFileSync(join(projectRoot, RUST_CANDIDATE.path, 'src', 'lib.rs'), '// altered\n', { flag: 'a' });

    assert.throws(
      () => freezeLedger({ projectRoot, candidates: [RUST_CANDIDATE], frozenAt: FROZEN_AT }),
      (error) => {
        assert.match(error.message, /append-only|already frozen/i);
        return true;
      },
    );

    const onDisk = JSON.parse(readFileSync(join(projectRoot, LEDGER_RELATIVE_PATH), 'utf8'));
    assert.equal(onDisk.holdouts[0].sha256, first.holdouts[0].sha256, 'the refused freeze must not have written');
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('UT-16 companion: re-freezing an unchanged holdout is permitted and byte-identical', () => {
  const projectRoot = makeHoldoutProject();
  try {
    freezeLedger({ projectRoot, candidates: [RUST_CANDIDATE], frozenAt: FROZEN_AT });
    const first = readFileSync(join(projectRoot, LEDGER_RELATIVE_PATH), 'utf8');
    freezeLedger({ projectRoot, candidates: [RUST_CANDIDATE], frozenAt: FROZEN_AT });
    assert.equal(readFileSync(join(projectRoot, LEDGER_RELATIVE_PATH), 'utf8'), first);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

// --- UT-10 / UT-11 / UT-12: boundaries ----------------------------------------

test('UT-10: an empty ledger exits 0 and states that none were selected', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'p22-2-none-'));
  try {
    const ledger = freezeLedger({ projectRoot, candidates: [], frozenAt: FROZEN_AT });
    assert.deepEqual(ledger.holdouts, []);

    const result = loadLedger({ projectRoot });
    assert.equal(result.entryCount, 0);
    const report = renderLedgerReport(result);
    assert.match(report, /none were selected/i);
    assert.match(report, /[Hh]uman/);

    const run = spawnSync(process.execPath, [RUN_SCRIPT, 'holdout', '--project-root', projectRoot], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    assert.match(run.stdout, /none were selected/i);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('a frozen digest is kept while the material derived from the tree is re-measured', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'p22-2-refresh-'));
  try {
    const root = join(projectRoot, RUST_CANDIDATE.path);
    writeSyntheticTree(root, { 'src/lib.rs': 'pub fn a() {}\n' });
    const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    git('init', '--quiet');
    git('config', 'user.email', 'test@example.invalid');
    git('config', 'user.name', 'Test');
    git('add', '.');
    git('commit', '--quiet', '-m', 'first');

    const first = freezeLedger({ projectRoot, candidates: [RUST_CANDIDATE], frozenAt: FROZEN_AT });
    assert.equal(first.holdouts[0].profile.falsifiability.historyCommitCount, 1);

    // An empty commit changes the readable history and not one working-tree
    // byte, so the digest still matches. Keeping the recorded profile would
    // leave the ledger stating a history the tree no longer has.
    git('commit', '--quiet', '--allow-empty', '-m', 'second');

    const second = freezeLedger({ projectRoot, candidates: [RUST_CANDIDATE], frozenAt: FROZEN_AT });
    assert.equal(second.holdouts[0].sha256, first.holdouts[0].sha256, 'the frozen digest is not rewritten');
    assert.equal(second.holdouts[0].frozenAt, FROZEN_AT);
    assert.equal(second.holdouts[0].profile.falsifiability.historyCommitCount, 2);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('C002 invariant companion: a frozen holdout survives a candidate list that stops naming it', () => {
  const projectRoot = makeHoldoutProject();
  try {
    freezeLedger({ projectRoot, candidates: [RUST_CANDIDATE, TS_CANDIDATE], frozenAt: FROZEN_AT });

    // The declaration is edited to drop the second candidate. Its tree is still
    // on disk and its digest is still recorded, so the ledger must still hold
    // it: a freeze that an unrelated edit can erase is not append-only.
    const second = freezeLedger({ projectRoot, candidates: [RUST_CANDIDATE], frozenAt: FROZEN_AT });
    assert.deepEqual(second.holdouts.map((entry) => entry.id).sort(), [RUST_CANDIDATE.id, TS_CANDIDATE.id]);

    const reloaded = loadLedger({ projectRoot });
    assert.equal(reloaded.entryCount, 2);
    assert.deepEqual(reloaded.drifted, []);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('eligibility cannot read commit history out of an enclosing repository', () => {
  const outer = mkdtempSync(join(tmpdir(), 'p22-2-history-'));
  try {
    // An outer repository with a commit, and a candidate that is merely a
    // subdirectory of it. The candidate has no history of its own, so reporting
    // the outer project's commits would credit it with a history it lacks.
    const git = (...args) => spawnSync('git', args, { cwd: outer, encoding: 'utf8' });
    git('init', '--quiet');
    git('config', 'user.email', 'test@example.invalid');
    git('config', 'user.name', 'Test');
    writeSyntheticTree(join(outer, 'candidate'), { 'src/lib.rs': 'pub fn a() {}\n' });
    writeFileSync(join(outer, 'README.md'), '# outer\n');
    git('add', '.');
    git('commit', '--quiet', '-m', 'outer commit');
    assert.equal(git('rev-list', '--count', 'HEAD').stdout.trim(), '1', 'the outer repository must have a commit');

    const profile = evaluateEligibility(
      { ...RUST_CANDIDATE, path: 'candidate' },
      { projectRoot: outer },
    );
    assert.equal(
      profile.capability.historyIsRepository,
      false,
      'a subdirectory of a repository has no history of its own',
    );
    assert.equal(profile.falsifiability.historyCommitCount, null);
    assert.ok(profile.reasons.some((reason) => /larger project/.test(reason)), 'the reason a human reads must say why');
  } finally {
    rmSync(outer, { recursive: true, force: true });
  }
});

test('a leading asterisk is a dereference in Rust, not a block-comment continuation', () => {
  // `*self.inner.write() = state;` is an assignment. Stripping it would file a
  // file whose only change is that line under "no production line changed",
  // and the reconciliation would then label it expected rather than divergent.
  assert.deepEqual(nonCommentLines('*x = 1;\n', 'src/lib.rs'), ['*x = 1;']);
  assert.deepEqual(nonCommentLines('*self.count += 1;\n', 'src/main.rs'), ['*self.count += 1;']);
  // A genuine block-comment continuation is still a comment.
  assert.deepEqual(nonCommentLines(' * a note\n', 'src/lib.rs'), []);
  assert.deepEqual(nonCommentLines(' */\n', 'src/lib.rs'), []);
});

test('a tree that cannot be walked is reported by path rather than as a raw errno', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'p22-2-unreadable-'));
  try {
    const root = join(projectRoot, 'tree');
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, 'lib.rs'), 'pub fn a() {}\n');
    symlinkSync(join(root, 'gone.rs'), join(root, 'dangling.rs'));

    assert.throws(
      () => digestTree(root),
      (error) => {
        assert.match(error.message, /dangling\.rs/, 'the unreadable path must be named');
        assert.equal(/^ENOENT/.test(error.message), false, 'a bare errno does not say what was being measured');
        return true;
      },
    );
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('a Rust attribute is code, not a comment', () => {
  // `#[test]` begins with `#`, which comments a line in Python and does not in
  // Rust. Calling it a comment would hide a stripped test attribute behind
  // "the two files differ only in comments, so no production line changed".
  assert.deepEqual(nonCommentLines('#[test]\nfn t() {}\n', 'src/lib.rs'), ['#[test]', 'fn t() {}']);
  assert.deepEqual(nonCommentLines('// a comment\nfn t() {}\n', 'src/lib.rs'), ['fn t() {}']);
  assert.deepEqual(nonCommentLines('# a comment\nx = 1\n', 'tool.py'), ['x = 1']);
  assert.deepEqual(nonCommentLines('; a comment\n[section]\n', 'docker/extensions.conf'), ['[section]']);
});

test('the language reason names the extensions it measured, not a language as one', () => {
  const projectRoot = makeHoldoutProject();
  try {
    const detected = detectPrimaryLanguage(join(projectRoot, RUST_CANDIDATE.path));
    assert.equal(detected.language, 'rust');
    assert.match(detected.reason, /\.rs/, 'the reason must name the extension actually counted');
    assert.equal(/\.rust\b/.test(detected.reason), false, '".rust" is not an extension');
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('the bare holdout invocation reaches its handler rather than crashing', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'p22-2-bare-'));
  try {
    freezeLedger({ projectRoot, candidates: [], frozenAt: FROZEN_AT });

    // No action and no --project-root: the form the usage text documents. The
    // project root is then the working directory, so the scratch root is the cwd.
    const run = spawnSync(process.execPath, [RUN_SCRIPT, 'holdout'], { cwd: projectRoot, encoding: 'utf8' });

    assert.doesNotMatch(run.stderr, /TypeError/, 'an argument list with no action must not crash the parser');
    assert.equal(run.status, 0, run.stderr || run.stdout);
    assert.match(run.stdout, /none were selected/i);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('UT-11: a candidate whose primary language cannot be determined is reported as unknown', () => {
  const projectRoot = makeHoldoutProject();
  try {
    const detected = detectPrimaryLanguage(join(projectRoot, OPAQUE_CANDIDATE.path));
    assert.equal(detected.language, 'unknown');
    assert.ok(detected.reason.length > 0, 'an unknown language must carry the reason it is unknown');

    const ledger = freezeLedger({ projectRoot, candidates: [OPAQUE_CANDIDATE], frozenAt: FROZEN_AT });
    assert.equal(ledger.holdouts[0].language, 'unknown');
    assert.deepEqual(loadLedger({ projectRoot }).drifted, []);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('UT-11 companion: a declared language is detected from the tree, ignoring dependency directories', () => {
  const projectRoot = makeHoldoutProject();
  try {
    assert.equal(detectPrimaryLanguage(join(projectRoot, RUST_CANDIDATE.path)).language, 'rust');
    assert.equal(detectPrimaryLanguage(join(projectRoot, TS_CANDIDATE.path)).language, 'typescript');

    // A vendored C dependency must not outvote the project's own Rust source.
    const vendored = mkdtempSync(join(tmpdir(), 'p22-2-vendor-'));
    try {
      writeSyntheticTree(join(vendored), {
        'src/lib.rs': 'pub fn a() {}\n',
        'vendor/dep/include/a.h': '#define A 1\n',
        'vendor/dep/include/b.h': '#define B 2\n',
        'vendor/dep/src/a.c': 'int a(void) { return 1; }\n',
        'vendor/dep/src/b.c': 'int b(void) { return 2; }\n',
      });
      assert.equal(detectPrimaryLanguage(vendored).language, 'rust');
    } finally {
      rmSync(vendored, { recursive: true, force: true });
    }
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('UT-12: a single holdout is a valid ledger', () => {
  const projectRoot = makeHoldoutProject();
  try {
    const ledger = freezeLedger({ projectRoot, candidates: [RUST_CANDIDATE], frozenAt: FROZEN_AT });
    assert.equal(ledger.holdouts.length, 1);
    assert.equal(loadLedger({ projectRoot }).entryCount, 1);
    assert.deepEqual(loadLedger({ projectRoot }).drifted, []);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('a declared candidate that is absent from this checkout is reported by name rather than fabricated', () => {
  const projectRoot = makeHoldoutProject();
  try {
    const absent = { ...RUST_CANDIDATE, id: 'mini-absent', path: `${CORPUS_PREFIX}/mini-absent` };
    const ledger = freezeLedger({ projectRoot, candidates: [RUST_CANDIDATE, absent], frozenAt: FROZEN_AT });

    assert.equal(ledger.holdouts.length, 1);
    assert.equal(ledger.notSelected.length, 1);
    assert.equal(ledger.notSelected[0].id, 'mini-absent');
    assert.equal(ledger.notSelected[0].path, absent.path);
    assert.ok(ledger.notSelected[0].reason.length > 0);

    const result = loadLedger({ projectRoot });
    assert.equal(result.notSelected.length, 1);
    assert.match(renderLedgerReport(result), /mini-absent/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('a holdout that is not a directory is refused by name', () => {
  const projectRoot = makeHoldoutProject();
  try {
    writeFileSync(join(projectRoot, 'not-a-tree.txt'), 'x\n');
    const candidate = { ...RUST_CANDIDATE, id: 'file-not-tree', path: 'not-a-tree.txt' };
    assert.throws(
      () => freezeLedger({ projectRoot, candidates: [candidate], frozenAt: FROZEN_AT }),
      (error) => {
        assert.match(error.message, /not a directory|file-not-tree/);
        return true;
      },
    );
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

// --- The checked-in declaration and, when present, the checked-in ledger -------

test('C001 precondition: the checked-in candidate declaration parses into the declared schema', () => {
  const declarationPath = join(PROJECT_ROOT, CANDIDATES_RELATIVE_PATH);
  assert.equal(existsSync(declarationPath), true, `${CANDIDATES_RELATIVE_PATH} must exist`);
  const declaration = JSON.parse(readFileSync(declarationPath, 'utf8'));

  assert.equal(typeof declaration.protocolVersion, 'number');
  assert.ok(Array.isArray(declaration.candidates));
  assert.ok(declaration.candidates.length >= 2, 'at least two candidates must be proposed');
  for (const candidate of declaration.candidates) {
    assert.equal(typeof candidate.id, 'string', 'id must be a string');
    assert.equal(typeof candidate.path, 'string', 'path must be a string');
    assert.equal(typeof candidate.domain, 'string', 'domain must be a string');
    assert.equal(typeof candidate.declaredLanguage, 'string', 'declaredLanguage must be a string');
    assert.equal(typeof candidate.provenance, 'string', 'provenance must be a string');
  }
});

test('the checked-in ledger loads, recomputes cleanly, and names every candidate it did not select', () => {
  const ledgerPath = join(PROJECT_ROOT, LEDGER_RELATIVE_PATH);
  assert.equal(existsSync(ledgerPath), true, `${LEDGER_RELATIVE_PATH} must exist`);

  const result = loadLedger({ projectRoot: PROJECT_ROOT });
  assert.deepEqual(result.drifted, [], renderLedgerReport(result));

  const declaration = JSON.parse(readFileSync(join(PROJECT_ROOT, CANDIDATES_RELATIVE_PATH), 'utf8'));
  assert.equal(
    result.entryCount + result.notSelected.length,
    declaration.candidates.length,
    'every declared candidate must be either frozen or reported as not selected',
  );
});
