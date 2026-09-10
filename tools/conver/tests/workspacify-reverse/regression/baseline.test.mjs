// [::TICKET::] P22-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-1 --for-spec --no-implementation-order`.
/**
 * The forward-rotation regression gate: freeze, reproduce, and refuse to guess.
 *
 * Every test builds its own throwaway project so that a capture run can never
 * write into the repository being measured. The forward pipeline scripts are
 * resolved from this module's own repository, so a temp project supplies only
 * the fixtures and the command files under measurement.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import process from 'node:process';

import {
  ALLOCATE_FIXTURES,
  BASELINE_RELATIVE_PATH,
  COMMAND_FILE_NAMES,
  COMMANDS_RELATIVE_DIR,
  allocateBaselineKey,
  captureBaselines,
  checkBaselines,
  pairBaselineKey,
  readFixtureDigests,
  renderCheckReport,
  stableManifestDigest,
  TREE_PIPELINE_PAIRS,
  TREE_FIXTURES_RELATIVE_DIR,
  ALLOCATE_FIXTURES_RELATIVE_DIR,
} from '../../../.claude/scripts/workspacify-reverse/lib/regression-gate.mjs';

const MODULE_ROOT = process.cwd();

/** A throwaway project holding copies of the fixtures and command files under test. */
function makeTempProject() {
  const projectRoot = mkdtempSync(join(tmpdir(), 'p22-1-gate-'));
  for (const dir of [TREE_FIXTURES_RELATIVE_DIR, ALLOCATE_FIXTURES_RELATIVE_DIR, COMMANDS_RELATIVE_DIR]) {
    cpSync(join(MODULE_ROOT, dir), join(projectRoot, dir), { recursive: true });
  }
  return projectRoot;
}

/** SHA-256 of every file beneath a directory, keyed by absolute path. */
function digestTree(dir) {
  const digests = {};
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      Object.assign(digests, digestTree(full));
    } else {
      digests[full] = createHash('sha256').update(readFileSync(full)).digest('hex');
    }
  }
  return digests;
}

function fixtureFile(projectRoot, name) {
  return join(projectRoot, TREE_FIXTURES_RELATIVE_DIR, name);
}

// --- F-1: the digest rule that makes a frozen baseline meaningful -------------

test('stableManifestDigest ignores volatile run provenance but tracks manifest content', () => {
  const base = { run: { generated_at: 'a', run_id: 'b', generator: { node_version: 'v1' }, workspace_root: '.' }, workspace: {} };
  const other = { run: { generated_at: 'z', run_id: 'y', generator: { node_version: 'v9' }, workspace_root: '.' }, workspace: {} };
  assert.equal(stableManifestDigest(base), stableManifestDigest(other));

  const changed = { ...base, workspace: { packages: [{ id: 'added' }] } };
  assert.notEqual(stableManifestDigest(base), stableManifestDigest(changed), 'a real content change must change the digest');
});

test('stableManifestDigest keeps non-volatile run fields, which carry real signal', () => {
  const small = { run: { workspace_root: '.', planned_directory_count: 4 } };
  const large = { run: { workspace_root: '.', planned_directory_count: 9 } };
  assert.notEqual(stableManifestDigest(small), stableManifestDigest(large), 'planned_directory_count is an output, not provenance');
});

// --- C001: frozen inputs ------------------------------------------------------

test('C001 precondition: both fixture roots are present and hold content', () => {
  const projectRoot = makeTempProject();
  try {
    for (const dir of [TREE_FIXTURES_RELATIVE_DIR, ALLOCATE_FIXTURES_RELATIVE_DIR]) {
      const full = join(projectRoot, dir);
      assert.equal(existsSync(full), true, dir + ' must exist');
      assert.ok(readdirSync(full).length > 0, dir + ' must be non-empty');
    }
    assert.equal(readdirSync(join(projectRoot, TREE_FIXTURES_RELATIVE_DIR)).length, 21, 'the 21 pre-existing tree fixtures');
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('C001 postcondition: capture freezes a digest for every fixture and check reproduces it', () => {
  const projectRoot = makeTempProject();
  try {
    const baseline = captureBaselines({ projectRoot });
    const observed = readFixtureDigests(projectRoot);
    assert.ok(Object.keys(observed).length > 0, 'the fixture set must not be empty');
    for (const [relPath, digest] of Object.entries(observed)) {
      assert.match(digest, /^[0-9a-f]{64}$/, relPath + ' must be a lowercase SHA-256 hex digest');
      assert.equal(baseline.manifestHashes[relPath], digest, relPath + ' must be frozen with its own digest');
    }

    const verdict = checkBaselines({ projectRoot });
    assert.equal(verdict.verdict, 'proved');
    assert.deepEqual(verdict.driftedNames, []);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('C001 postcondition: every COMPLETE tree pair is frozen under a namespaced key', () => {
  const projectRoot = makeTempProject();
  try {
    assert.equal(TREE_PIPELINE_PAIRS.length, 3, 'only the three measured COMPLETE pairs may be declared');
    const baseline = captureBaselines({ projectRoot });
    const pairKeys = Object.keys(baseline.manifestHashes).filter((key) => key.startsWith('pair:')).sort();
    assert.deepEqual(pairKeys, TREE_PIPELINE_PAIRS.map(pairBaselineKey).sort());
    for (const key of pairKeys) assert.match(baseline.manifestHashes[key], /^[0-9a-f]{64}$/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('C001 postcondition: the allocate fixture is frozen by its own manifest digest', () => {
  const projectRoot = makeTempProject();
  try {
    const baseline = captureBaselines({ projectRoot });
    for (const fixture of ALLOCATE_FIXTURES) {
      const key = allocateBaselineKey(fixture);
      assert.match(baseline.manifestHashes[key], /^[0-9a-f]{64}$/, key + ' must be frozen');
    }
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('C001 invariant: capture and check never alter a target byte', () => {
  const projectRoot = makeTempProject();
  try {
    const before = digestTree(join(projectRoot, TREE_FIXTURES_RELATIVE_DIR));
    captureBaselines({ projectRoot });
    assert.deepEqual(digestTree(join(projectRoot, TREE_FIXTURES_RELATIVE_DIR)), before, 'capture must not write into the fixture tree');
    checkBaselines({ projectRoot });
    assert.deepEqual(digestTree(join(projectRoot, TREE_FIXTURES_RELATIVE_DIR)), before, 'check must not write into the fixture tree');
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

// --- C003: drift is named, never swallowed ------------------------------------

test('C003 postcondition: a one-byte fixture edit is named and the verdict is not proved', () => {
  const projectRoot = makeTempProject();
  try {
    captureBaselines({ projectRoot });
    writeFileSync(fixtureFile(projectRoot, 'small-spec.md'), 'X', { flag: 'a' });

    const verdict = checkBaselines({ projectRoot });
    assert.equal(verdict.verdict, 'not proved');
    assert.ok(verdict.driftedNames.includes('small-spec.md'), 'the drifted fixture must be named: ' + verdict.driftedNames.join(', '));
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('C003 postcondition: a drifted fixture is reported with the expected and the actual value', () => {
  const projectRoot = makeTempProject();
  try {
    const baseline = captureBaselines({ projectRoot });
    const frozen = baseline.manifestHashes['small-spec.md'];
    writeFileSync(fixtureFile(projectRoot, 'small-spec.md'), 'X', { flag: 'a' });

    const verdict = checkBaselines({ projectRoot });
    const finding = verdict.fixtureFindings.find((entry) => entry.key === 'small-spec.md');
    assert.ok(finding, 'the drifted fixture must appear as a finding');
    assert.equal(finding.expected, frozen, 'the frozen value must be shown');
    assert.match(finding.observed, /^[0-9a-f]{64}$/, 'the actual value must be shown');

    const report = renderCheckReport(verdict);
    assert.match(report, /small-spec\.md/);
    assert.match(report, new RegExp(frozen), 'the report must print the expected digest');
    assert.match(report, new RegExp(finding.observed), 'the report must print the observed digest');
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('C003 invariant: the vocabulary is proved or not proved, and never a success judgement', () => {
  const projectRoot = makeTempProject();
  try {
    captureBaselines({ projectRoot });
    const clean = checkBaselines({ projectRoot });
    assert.ok(['proved', 'not proved'].includes(clean.verdict));

    writeFileSync(fixtureFile(projectRoot, 'small-spec.md'), 'X', { flag: 'a' });
    const dirty = checkBaselines({ projectRoot });
    assert.equal(dirty.verdict, 'not proved');
    for (const value of [clean.verdict, dirty.verdict]) {
      assert.equal(/\b(success|succeeded|failure|failed|pass|fail)\b/i.test(value), false, 'the gate must not judge success');
    }
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

// --- Error paths: a gate that fails open is worse than no gate ----------------

test('UT-5: a missing baseline file produces a descriptive error rather than a silent pass', () => {
  const projectRoot = makeTempProject();
  try {
    assert.throws(
      () => checkBaselines({ projectRoot }),
      (error) => {
        assert.match(error.message, /manifest-hashes\.json/, 'the error must name the missing baseline path');
        return true;
      },
    );
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('UT-9: invalid UTF-8 in a fixture is digested without crashing the gate', () => {
  const projectRoot = makeTempProject();
  try {
    const binary = join(projectRoot, TREE_FIXTURES_RELATIVE_DIR, 'binary-probe.md');
    writeFileSync(binary, Buffer.from([0xff, 0xfe, 0x00, 0x80, 0xc3, 0x28]));
    const baseline = captureBaselines({ projectRoot });
    const rel = relative(join(projectRoot, TREE_FIXTURES_RELATIVE_DIR), binary);
    assert.match(baseline.manifestHashes[rel], /^[0-9a-f]{64}$/, 'a non-UTF-8 fixture is hashed as bytes, never decoded');
    assert.equal(checkBaselines({ projectRoot }).verdict, 'proved');
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('UT-8: zero fixtures exits cleanly and says there is nothing to check', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'p22-1-empty-'));
  try {
    mkdirSync(join(projectRoot, TREE_FIXTURES_RELATIVE_DIR), { recursive: true });
    mkdirSync(join(projectRoot, ALLOCATE_FIXTURES_RELATIVE_DIR), { recursive: true });
    const baseline = captureBaselines({ projectRoot, pipelinePairs: [], allocateFixtures: [] });
    assert.deepEqual(baseline.fixtures, [], 'no fixtures were found');
    assert.deepEqual(Object.keys(baseline).sort(), ['commandFileDigests', 'fixtures', 'manifestHashes'], 'the baseline schema is exactly the three declared keys');

    const verdict = checkBaselines({ projectRoot, pipelinePairs: [], allocateFixtures: [] });
    assert.equal(verdict.verdict, 'proved');
    assert.equal(verdict.nothingToCheck, true);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('UT-10: a fixture directory that exists but is empty behaves the same as an absent one', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'p22-1-empty2-'));
  try {
    mkdirSync(join(projectRoot, TREE_FIXTURES_RELATIVE_DIR), { recursive: true });
    captureBaselines({ projectRoot, pipelinePairs: [], allocateFixtures: [] });

    const absentVerdict = checkBaselines({ projectRoot, pipelinePairs: [], allocateFixtures: [] });
    assert.equal(absentVerdict.nothingToCheck, true, 'the allocate root is absent and must read as nothing to check');
    assert.equal(absentVerdict.verdict, 'proved');

    const baseline = JSON.parse(readFileSync(join(projectRoot, BASELINE_RELATIVE_PATH), 'utf8'));
    assert.deepEqual(baseline.fixtures, []);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

// --- C001/UT-13: idempotence --------------------------------------------------

test('UT-13: two consecutive captures produce byte-identical JSON', () => {
  const projectRoot = makeTempProject();
  try {
    captureBaselines({ projectRoot });
    const first = readFileSync(join(projectRoot, BASELINE_RELATIVE_PATH), 'utf8');
    captureBaselines({ projectRoot });
    const second = readFileSync(join(projectRoot, BASELINE_RELATIVE_PATH), 'utf8');
    assert.equal(second, first, 'capture must be idempotent');
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

// --- C002: the command files --------------------------------------------------

// [::TICKET::] P22-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-9 --for-spec --no-implementation-order`.
// [::TICKET::] P22-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-9 --for-spec --no-implementation-order`.
// P22-1 asserted the absence of `workspacify-reverse.md` as a precondition of
// its own moment, and named P22-9 as the ticket that would create it. That
// premise is now false, so the assertion is updated to the truth rather than
// dropped, and tightened: the tenth file exists, and it stays outside the set
// the digest freezes — an edit may append to the nine, a creation is not one.
test('C002 precondition: the nine command files exist, and the tenth P22-9 created stands beside them', () => {
  const projectRoot = makeTempProject();
  try {
    assert.equal(COMMAND_FILE_NAMES.length, 9);
    for (const name of COMMAND_FILE_NAMES) {
      assert.equal(existsSync(join(projectRoot, COMMANDS_RELATIVE_DIR, name + '.md')), true, name + '.md must exist');
    }
    assert.equal(existsSync(join(projectRoot, COMMANDS_RELATIVE_DIR, 'workspacify-reverse.md')), true, 'P22-9 creates the tenth file');
    assert.equal(COMMAND_FILE_NAMES.includes('workspacify-reverse'), false, 'the tenth file is a creation, not an edit of the nine');
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('C002 invariant: capture leaves every command file byte-identical', () => {
  const projectRoot = makeTempProject();
  try {
    const before = digestTree(join(projectRoot, COMMANDS_RELATIVE_DIR));
    captureBaselines({ projectRoot, pipelinePairs: [] });
    assert.deepEqual(digestTree(join(projectRoot, COMMANDS_RELATIVE_DIR)), before, 'the digest only reads');
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

// --- The gate itself, through the CLI ----------------------------------------

test('C003 invariant: a pipeline pair that can no longer run is a disagreement, not an exception', () => {
  const projectRoot = makeTempProject();
  try {
    captureBaselines({ projectRoot });
    rmSync(fixtureFile(projectRoot, 'decisions-long-ok.json'));

    let verdict;
    assert.doesNotThrow(() => {
      verdict = checkBaselines({ projectRoot });
    }, 'a pipeline that refuses to publish must be reported, not thrown');

    assert.equal(verdict.verdict, 'not proved');
    const keys = verdict.pairFindings.map((finding) => finding.key);
    assert.ok(keys.includes('pair:long-spec.md+decisions-long-ok.json'), `expected the failing pair to be named, got: ${keys.join(', ')}`);
    const finding = verdict.pairFindings.find((entry) => entry.key === 'pair:long-spec.md+decisions-long-ok.json');
    assert.match(finding.observed, /unavailable/, 'the observation must say the pair could not run');
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('IT-1/IT-2: the regression subcommand proves an untouched tree and names a drifted one', () => {
  const projectRoot = makeTempProject();
  try {
    const runScript = join(MODULE_ROOT, '.claude/scripts/workspacify-reverse/run.mjs');
    const capture = spawnSync(process.execPath, [runScript, 'regression', 'capture'], { cwd: projectRoot, encoding: 'utf8' });
    assert.equal(capture.status, 0, capture.stderr);

    const clean = spawnSync(process.execPath, [runScript, 'regression', 'check'], { cwd: projectRoot, encoding: 'utf8' });
    assert.equal(clean.status, 0, clean.stdout);
    assert.match(clean.stdout, /proved/i);

    writeFileSync(fixtureFile(projectRoot, 'small-spec.md'), 'X', { flag: 'a' });
    const dirty = spawnSync(process.execPath, [runScript, 'regression', 'check'], { cwd: projectRoot, encoding: 'utf8' });
    assert.equal(dirty.status, 1, 'drift must exit non-zero');
    assert.match(dirty.stdout, /small-spec\.md/, 'the drifted fixture must be named');
    assert.match(dirty.stdout, /not proved/i);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
