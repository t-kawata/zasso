// [::TICKET::] P22-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-12 --for-spec --no-implementation-order`.
// P22-12 @verifies C001 C002
// A1 through A6 of the reverse rotation, and the safety guarantee they invert.
//
// The forward guarantee is `fresh-workspace only`: nothing may pre-exist. The
// reverse guarantee is the exact dual — everything must pre-exist, and a single
// extra or missing path stops the run. Both say the same thing: the machine never
// merges, overwrites or deletes. Only the direction of the comparison changed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  ALLOCATE_MODES,
  EXCLUDED_DIRECTORY_NAMES,
  REVERSE_GATE_IDS,
  WRITE_ALLOW_LIST,
  assertAdditionsOnly,
  assertSafetyInversion,
  assertSectionOneIndex,
  assertSeedParity,
  assertSeedPlacement,
  findPlacedSeedPaths,
  measureExistingDirectories,
  packagesRequiringSeed,
  renderReverseAllocateReport,
  resolveAllocateMode,
  runReverseAllocateGates,
  summarizeReverseAllocateGates,
} from '../../../.claude/scripts/workspacify-allocate/lib/reverse-mode.mjs';
import { MEASURED_TREE_EXCLUSIONS } from '../../../.claude/scripts/workspacify-tree/lib/structure-parity.mjs';
import { GATE_STATUS } from '../../../.claude/scripts/workspacify-tree/lib/errors.mjs';
import { renderSeed } from '../../../.claude/scripts/workspacify-allocate/lib/seed-render.mjs';
import { parseSeed } from '../../../.claude/scripts/workspacify-allocate/lib/seed-parse.mjs';
import { SEED_REQUIRED_SECTIONS, SEED_FILE_NAME, ALLOCATE_MANIFEST_FILE_NAME } from '../../../.claude/scripts/workspacify-allocate/lib/seed-model.mjs';
import { compareDigests, digestCommandFiles } from '../../../.claude/scripts/workspacify-reverse/lib/command-file-digest.mjs';
import { sidecarReference } from '../../../.claude/scripts/workspacify-reverse/lib/forward-extensions.mjs';
import { buildValidManifest, baseAiSections } from '../helpers/build-valid-manifest.mjs';
import {
  FIXTURE_SIDECAR_BUNDLE_HASH,
  FIXTURE_TOP_LEVEL_DIRECTORIES,
  buildReverseWorkspace,
  collectSeedPaths,
  createdEntries,
  fingerprintTree,
  isDirectory,
  plannedPathsOf,
  readTopLevelDirectories,
  removeTree,
} from './helpers/reverse-fixture.mjs';
import { REVERSE_PROVENANCE_FIELD } from '../../../.claude/scripts/workspacify-tree/lib/reverse-mode.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const ALLOCATE_RUN = join(PROJECT_ROOT, '.claude/scripts/workspacify-allocate/run.mjs');
const REGRESSION_RUN = join(PROJECT_ROOT, '.claude/scripts/workspacify-reverse/run.mjs');
const BASELINE_PATH = join(PROJECT_ROOT, 'tests/workspacify-tree/baselines/manifest-hashes.json');

/**
 * The four-level plan the *unit* gate tests are judged against. It is written out
 * rather than derived, so the gate tests and the workspace fixture cannot drift
 * into agreeing by accident: the workspace test below reads its own plan from the
 * manifest instead.
 */
const PLANNED_PATHS = ['crates', 'crates/protocol', 'crates/protocol/alpha', 'crates/protocol/beta'];

/** The bundle reference a reverse seed carries; both declared fields are required. */
const SIDECAR_REFERENCE = sidecarReference({
  bundleHash: 'b'.repeat(64),
  counts: { claims: 1, residuals: 0 },
});

// ---------------------------------------------------------------------------
// mode resolution — the reverse additions must be unreachable from forward
// ---------------------------------------------------------------------------

test('the mode is decided by the input, and an absent mode field means forward', () => {
  assert.equal(resolveAllocateMode({ mode: 'reverse' }), ALLOCATE_MODES.REVERSE);
  assert.equal(resolveAllocateMode({}), ALLOCATE_MODES.FORWARD);
  assert.equal(resolveAllocateMode(undefined), ALLOCATE_MODES.FORWARD);
  assert.equal(resolveAllocateMode({ mode: 'sideways' }), ALLOCATE_MODES.FORWARD);
  assert.equal(ALLOCATE_MODES.FORWARD, 'forward');
  assert.equal(ALLOCATE_MODES.REVERSE, 'reverse');
});

test('the gate identifiers are named constants, so report, tests and design cannot disagree', () => {
  assert.deepEqual(Object.values(REVERSE_GATE_IDS), ['A1', 'A2', 'A3', 'A4', 'A5', 'A6']);
});

// ---------------------------------------------------------------------------
// C001 — the planned and the existing directory sets
// ---------------------------------------------------------------------------

test('C001 precondition: the planned and the existing directory sets are given as two path arrays', () => {
  const record = assertSafetyInversion({ plannedPaths: PLANNED_PATHS, existingPaths: [...PLANNED_PATHS] });

  assert.equal(record.gateId, REVERSE_GATE_IDS.A1);
  assert.deepEqual(record.counts, { planned: 4, existing: 4, extra: 0, missing: 0 });
});

test('C001 postcondition: the two match exactly, and an extra path makes the run BLOCKED with the path named', () => {
  const agreed = assertSafetyInversion({ plannedPaths: PLANNED_PATHS, existingPaths: [...PLANNED_PATHS] });
  assert.equal(agreed.status, GATE_STATUS.PASS);

  const withExtra = assertSafetyInversion({ plannedPaths: PLANNED_PATHS, existingPaths: [...PLANNED_PATHS, 'vendor'] });
  assert.equal(withExtra.status, GATE_STATUS.BLOCKED);
  assert.deepEqual(withExtra.extraPaths, ['vendor']);
  assert.deepEqual(withExtra.missingPaths, []);
  assert.match(withExtra.reasons.join('\n'), /vendor/, 'the extra path is named, not merely counted');

  const withMissing = assertSafetyInversion({
    plannedPaths: PLANNED_PATHS,
    existingPaths: PLANNED_PATHS.filter((path) => path !== 'crates/protocol/beta'),
  });
  assert.equal(withMissing.status, GATE_STATUS.BLOCKED);
  assert.deepEqual(withMissing.missingPaths, ['crates/protocol/beta']);
  assert.deepEqual(withMissing.extraPaths, []);
  assert.match(withMissing.reasons.join('\n'), /crates\/protocol\/beta/);
});

test('C001 invariant: existing content is never merged, overwritten or deleted, and the gate authorises no write', () => {
  const agreed = assertSafetyInversion({ plannedPaths: PLANNED_PATHS, existingPaths: [...PLANNED_PATHS] });
  assert.deepEqual(agreed.writes, [], 'the agreement gate authorises no write at all');

  const blocked = assertSafetyInversion({ plannedPaths: PLANNED_PATHS, existingPaths: [...PLANNED_PATHS, 'docker'] });
  assert.deepEqual(blocked.writes, [], 'a blocked run writes nothing');
  assert.equal(blocked.status, GATE_STATUS.BLOCKED);
});

test('C001 boundary: a tree that already matches the plan exactly is reported as such, not as a failure', () => {
  const exact = assertSafetyInversion({ plannedPaths: PLANNED_PATHS, existingPaths: [...PLANNED_PATHS] });
  assert.equal(exact.status, GATE_STATUS.PASS, 'agreement is the pass condition in reverse mode');
  assert.equal(exact.counts.extra, 0);
  assert.equal(exact.counts.missing, 0);
  assert.deepEqual(exact.writes, []);
});

// ---------------------------------------------------------------------------
// C002 — one seed per package, additions only
// ---------------------------------------------------------------------------

test('C002 precondition: every package marked seed_required is true; an explicit false is the only exclusion', () => {
  const packages = [
    { id: 'pkg-a', path: 'crates/protocol/alpha', seed_required: true },
    { id: 'pkg-b', path: 'crates/protocol/beta', seed_required: true },
    { id: 'pkg-test', path: 'crates/protocol/testing', seed_required: false },
  ];
  assert.deepEqual(packagesRequiringSeed(packages).map((pkg) => pkg.id), ['pkg-a', 'pkg-b']);
  assert.deepEqual(packagesRequiringSeed([{ id: 'pkg-c', path: 'c' }]).map((pkg) => pkg.id), ['pkg-c']);
});

test('C002 postcondition: exactly one RFC-SEED is placed in each package, and every deviation is named', () => {
  const packages = [
    { id: 'pkg-a', path: 'crates/protocol/alpha' },
    { id: 'pkg-b', path: 'crates/protocol/beta' },
  ];
  const placed = ['crates/protocol/alpha/RFC-SEED.md', 'crates/protocol/beta/RFC-SEED.md'];

  const exact = assertSeedPlacement({ packages, placedSeedPaths: placed });
  assert.equal(exact.status, GATE_STATUS.PASS);
  assert.deepEqual(exact.counts, { expected: 2, placed: 2 });

  const absent = assertSeedPlacement({ packages, placedSeedPaths: ['crates/protocol/alpha/RFC-SEED.md'] });
  assert.equal(absent.status, GATE_STATUS.BLOCKED);
  assert.deepEqual(absent.missingSeedPackages, ['pkg-b']);
  assert.match(absent.reasons.join('\n'), /pkg-b/);

  const twice = assertSeedPlacement({ packages, placedSeedPaths: [...placed, 'crates/protocol/beta/RFC-SEED.md'] });
  assert.equal(twice.status, GATE_STATUS.BLOCKED);
  assert.deepEqual(twice.duplicatedPackages, ['pkg-b']);

  const unplanned = assertSeedPlacement({ packages, placedSeedPaths: [...placed, 'vendor/pjsip/RFC-SEED.md'] });
  assert.equal(unplanned.status, GATE_STATUS.BLOCKED);
  assert.deepEqual(unplanned.unplannedSeedPaths, ['vendor/pjsip/RFC-SEED.md']);
});

test('C002 boundary: a package requiring no seed is handled without error', () => {
  const packages = [
    { id: 'pkg-a', path: 'crates/protocol/alpha', seed_required: true },
    { id: 'pkg-test', path: 'crates/protocol/testing', seed_required: false },
  ];
  const record = assertSeedPlacement({ packages, placedSeedPaths: ['crates/protocol/alpha/RFC-SEED.md'] });

  assert.equal(record.status, GATE_STATUS.PASS);
  assert.deepEqual(record.counts, { expected: 1, placed: 1 });
  assert.deepEqual(record.duplicatedPackages, []);
  assert.deepEqual(record.unplannedSeedPaths, []);
});

test('C002 invariant: writes are limited to RFC-SEED and the manifest, and the allow-list has exactly one definition', () => {
  assert.deepEqual([...WRITE_ALLOW_LIST], [SEED_FILE_NAME, ALLOCATE_MANIFEST_FILE_NAME]);

  const allowed = [
    { path: 'crates/protocol/alpha/RFC-SEED.md' },
    { path: ALLOCATE_MANIFEST_FILE_NAME },
  ];
  const unchanged = [...FIXTURE_TOP_LEVEL_DIRECTORIES];

  const ok = assertAdditionsOnly({
    writes: allowed,
    topLevelDirectoriesBefore: unchanged,
    topLevelDirectoriesAfter: unchanged,
  });
  assert.equal(ok.status, GATE_STATUS.PASS);

  const outsideList = assertAdditionsOnly({
    writes: [...allowed, { path: 'crates/protocol/alpha/mod.rs' }],
    topLevelDirectoriesBefore: unchanged,
    topLevelDirectoriesAfter: unchanged,
  });
  assert.equal(outsideList.status, GATE_STATUS.BLOCKED);
  assert.deepEqual(outsideList.forbiddenWrites, ['crates/protocol/alpha/mod.rs']);

  const renamed = assertAdditionsOnly({
    writes: allowed,
    topLevelDirectoriesBefore: ['crates', 'target', 'vendor'],
    topLevelDirectoriesAfter: ['crates', 'target', 'vendored'],
  });
  assert.equal(renamed.status, GATE_STATUS.BLOCKED);
  assert.deepEqual(renamed.renamedTopLevel, [{ before: 'vendor', after: 'vendored' }]);
  assert.match(renamed.reasons.join('\n'), /vendor/);
});

test('C002 invariant: reverse mode cannot rename by construction — no rename primitive is reachable from it', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../../../.claude/scripts/workspacify-allocate/lib/reverse-mode.mjs', import.meta.url)),
    'utf8',
  );
  assert.doesNotMatch(source, /\brenameSync\b/, 'reverse mode never renames');
  assert.doesNotMatch(source, /publishStagedTree/, 'the atomic top-level publish is a forward-only step');
  assert.doesNotMatch(source, /rollbackPublished/, 'there is nothing to roll back: reverse mode creates no directory');
});

// ---------------------------------------------------------------------------
// A4 — the section 1 index, and the heading count that must not move
// ---------------------------------------------------------------------------

test('A4: the reverse index lives inside section 1 and the heading count stays 14', () => {
  assert.equal(SEED_REQUIRED_SECTIONS.length, 14, 'the heading contract is what it always was');

  const { manifest } = buildValidManifest();
  const { seedText } = renderSeed({
    package: { id: 'pkg-a', name: 'alpha', path: 'crates/protocol/alpha' },
    machine: {
      manifest,
      expectedAllocation: [],
      referenceBlock: { manifest_ref: 'WORKSPACIFY-TREE-MANIFEST.json' },
      contractEdges: [],
      mode: ALLOCATE_MODES.REVERSE,
      reverseIndex: [{ claim_id: 'C-1', risk_class: 'medium' }],
      sidecarReference: SIDECAR_REFERENCE,
    },
    aiSections: baseAiSections(),
  });

  const parsed = parseSeed(seedText);
  assert.equal(parsed.headings.length, SEED_REQUIRED_SECTIONS.length, 'no fifteenth heading is created');
  assert.ok(parsed.headings[0].title.startsWith('Identity and Position'), 'the index extends section 1');

  const record = assertSectionOneIndex({ seedText });
  assert.equal(record.gateId, REVERSE_GATE_IDS.A4);
  assert.equal(record.status, GATE_STATUS.PASS);
  assert.equal(record.headingCount, SEED_REQUIRED_SECTIONS.length);
});

test('A4 error case: a seed with fifteen headings is rejected and the count is named', () => {
  const { manifest } = buildValidManifest();
  const { seedText } = renderSeed({
    package: { id: 'pkg-a', name: 'alpha', path: 'crates/protocol/alpha' },
    machine: {
      manifest,
      expectedAllocation: [],
      referenceBlock: { manifest_ref: 'WORKSPACIFY-TREE-MANIFEST.json' },
      contractEdges: [],
      mode: ALLOCATE_MODES.REVERSE,
      reverseIndex: [{ claim_id: 'C-1' }],
      sidecarReference: SIDECAR_REFERENCE,
    },
    aiSections: baseAiSections(),
  });
  const fifteen = `${seedText}\n## 15. An extra heading\n\nbody\n`;

  const record = assertSectionOneIndex({ seedText: fifteen });
  assert.equal(record.status, GATE_STATUS.BLOCKED);
  assert.equal(record.headingCount, 15);
  assert.match(record.reasons.join('\n'), /15/);
  assert.match(record.reasons.join('\n'), /14/);
});

test('A4: a reverse seed without the reverse index is refused rather than quietly accepted', () => {
  const { manifest } = buildValidManifest();
  const { seedText } = renderSeed({
    package: { id: 'pkg-a', name: 'alpha', path: 'crates/protocol/alpha' },
    machine: {
      manifest,
      expectedAllocation: [],
      referenceBlock: { manifest_ref: 'WORKSPACIFY-TREE-MANIFEST.json' },
      contractEdges: [],
    },
    aiSections: baseAiSections(),
  });

  const record = assertSectionOneIndex({ seedText, mode: ALLOCATE_MODES.REVERSE });
  assert.equal(record.status, GATE_STATUS.BLOCKED);
  assert.match(record.reasons.join('\n'), /reverse_index/);
});

// ---------------------------------------------------------------------------
// A5 — seed parity, reused rather than re-derived
// ---------------------------------------------------------------------------

test('A5: the existing parity check is delegated to, not reimplemented', () => {
  const expectedByPackage = new Map([['pkg-a', [{ category: 'object', inventory_ref: 'obj-000001' }]]]);
  const parsedByPackage = new Map([['pkg-a', [{ category: 'object', inventory_ref: 'obj-000001' }]]]);

  const agreed = assertSeedParity({ expectedByPackage, parsedByPackage });
  assert.equal(agreed.gateId, REVERSE_GATE_IDS.A5);
  assert.equal(agreed.status, GATE_STATUS.PASS);

  const leaked = assertSeedParity({ expectedByPackage, parsedByPackage: new Map([['pkg-b', [{ category: 'object', inventory_ref: 'obj-000001' }]]]) });
  assert.equal(leaked.status, GATE_STATUS.BLOCKED);
  assert.match(leaked.reasons.join('\n'), /obj-000001/);
});

// ---------------------------------------------------------------------------
// the six-gate runner
// ---------------------------------------------------------------------------

test('every gate returns an explicit record and is judged even after an earlier failure', () => {
  const { manifest } = buildValidManifest();
  const records = runReverseAllocateGates({
    mode: ALLOCATE_MODES.REVERSE,
    plannedPaths: PLANNED_PATHS,
    existingPaths: [...PLANNED_PATHS, 'vendor'],
    seedTexts: [],
    expectedByPackage: new Map(),
    parsedByPackage: new Map(),
    packets: [],
    writes: [],
    topLevelDirectoriesBefore: FIXTURE_TOP_LEVEL_DIRECTORIES,
    topLevelDirectoriesAfter: FIXTURE_TOP_LEVEL_DIRECTORIES,
    manifest,
  });

  for (const record of records) {
    assert.ok(Object.values(GATE_STATUS).includes(record.status), `${record.gateId} reports a known status`);
    assert.ok(Array.isArray(record.reasons) && record.reasons.length > 0, `${record.gateId} says why`);
  }
  assert.equal(records[0].status, GATE_STATUS.BLOCKED, 'the extra path is reported by A1');
  // The later gates are still judged: the operator repairs everything in one pass.
  assert.ok(records.slice(1).every((record) => record.gateId !== REVERSE_GATE_IDS.A1));
  assert.equal(records.every((record) => record.status !== undefined), true);
});

test('A6 folds into A3: the incoming-dependency material has one verdict, not two', () => {
  const records = runReverseAllocateGates({ mode: ALLOCATE_MODES.REVERSE });

  assert.deepEqual(
    records.map((record) => record.gateId),
    [REVERSE_GATE_IDS.A1, REVERSE_GATE_IDS.A2, REVERSE_GATE_IDS.A3, REVERSE_GATE_IDS.A4, REVERSE_GATE_IDS.A5],
    'the acceptance table gives A6 no FAIL condition of its own',
  );
  const a3 = records.find((record) => record.gateId === REVERSE_GATE_IDS.A3);
  assert.match(a3.reasons.join('\n'), /incoming-dependency excerpt|nothing to hand over/);
});

test('the summary is COMPLETE only when every gate passed, and BLOCKED otherwise', () => {
  const passing = summarizeReverseAllocateGates([
    { gateId: 'A1', status: GATE_STATUS.PASS, reasons: ['ok'] },
    { gateId: 'A2', status: GATE_STATUS.PASS, reasons: ['ok'] },
  ]);
  assert.equal(passing.status, GATE_STATUS.COMPLETE);
  assert.deepEqual(passing.failing, []);

  const failing = summarizeReverseAllocateGates([
    { gateId: 'A1', status: GATE_STATUS.BLOCKED, reasons: ['extra: vendor'] },
    { gateId: 'A2', status: GATE_STATUS.PASS, reasons: ['ok'] },
  ]);
  assert.equal(failing.status, GATE_STATUS.BLOCKED);
  assert.deepEqual(failing.failing, ['A1']);
});

test('the report is Markdown the AI can read, and it names what has to be repaired', () => {
  const report = renderReverseAllocateReport([
    { gateId: 'A1', status: GATE_STATUS.BLOCKED, reasons: ['existing path "vendor" is not in the plan'] },
    { gateId: 'A2', status: GATE_STATUS.PASS, reasons: ['writes are limited to the allow-list'] },
  ]);

  assert.match(report, /^# Reverse-mode allocate gates/m);
  assert.match(report, /A1 — BLOCKED/);
  assert.match(report, /vendor/);
  assert.match(report, /Repair/);
  assert.doesNotMatch(report, /"[a-z_]+":/, 'the AI reads prose, not a serialisation');
});

// ---------------------------------------------------------------------------
// end-to-end: the CLI, the filesystem, and the forward rotation
// ---------------------------------------------------------------------------

test('IT-1 every package receives exactly one seed and the measured tree is byte-identical afterwards', () => {
  const workspace = buildReverseWorkspace();
  try {
    const before = fingerprintTree(workspace.dir);
    const run = spawnSync(
      process.execPath,
      [ALLOCATE_RUN, 'reverse', `--root=${workspace.dir}`, `--decisions=${writeDecisions(workspace)}`],
      { encoding: 'utf8' },
    );
    assert.equal(run.status, 0, `reverse allocate must exit 0\nstdout: ${run.stdout}\nstderr: ${run.stderr}`);

    const seedPaths = collectSeedPaths(workspace.dir);
    assert.deepEqual(
      seedPaths,
      workspace.manifest.workspace.packages.map((pkg) => `${pkg.path}/${SEED_FILE_NAME}`).sort(),
      'exactly one seed per package, and nowhere else',
    );

    // The run verifies its own placement and says so in the published report.
    assert.match(run.stdout, /C002 — PASS/, 'C002 is judged at runtime, not only by this test');
    assert.deepEqual(
      findPlacedSeedPaths(workspace.dir),
      workspace.manifest.workspace.packages.map((pkg) => `${pkg.path}/${SEED_FILE_NAME}`).sort(),
      'the read-back finds one seed per package and nothing else',
    );

    const after = fingerprintTree(workspace.dir);
    const created = createdEntries(before, after);
    assert.ok(
      created.every((line) => line.includes(SEED_FILE_NAME) || line.includes(ALLOCATE_MANIFEST_FILE_NAME)),
      `only seeds and the manifest may appear: ${created.join(', ')}`,
    );
    assert.deepEqual(
      after.filter((line) => before.includes(line)),
      before,
      'every pre-existing entry survives with identical bytes',
    );
  } finally {
    removeTree(workspace.dir);
  }
});

test('IT-2 a tree with one extra path is BLOCKED, the path is named, and nothing is written', () => {
  // `docker` is a real directory no package claims. `vendor` would not do: it is a
  // dependency population the reverse measurement never counts, so an A1 that
  // reported it would be reporting the build directory rather than the project.
  const workspace = buildReverseWorkspace({ extraDirectories: ['docker'] });
  try {
    const before = fingerprintTree(workspace.dir);
    const run = spawnSync(
      process.execPath,
      [ALLOCATE_RUN, 'reverse', `--root=${workspace.dir}`, `--decisions=${writeDecisions(workspace)}`],
      { encoding: 'utf8' },
    );

    assert.notEqual(run.status, 0, 'an extra path stops the run');
    assert.match(`${run.stdout}${run.stderr}`, /docker/);
    assert.deepEqual(collectSeedPaths(workspace.dir), [], 'a blocked run publishes no seed');
    assert.deepEqual(fingerprintTree(workspace.dir), before, 'a blocked run writes nothing at all');
  } finally {
    removeTree(workspace.dir);
  }
});

test('A1 measures the project, not the build directory: vendor and target are never extras', () => {
  const workspace = buildReverseWorkspace();
  try {
    // Both exist on disk and neither is claimed by a package.
    assert.equal(isDirectory(join(workspace.dir, 'vendor')), true);
    assert.equal(isDirectory(join(workspace.dir, 'target')), true);

    const measured = measureExistingDirectories(workspace.dir);
    assert.ok(!measured.includes('vendor'), 'a dependency population is not part of the measured project');
    assert.ok(!measured.includes('target'), 'build output is not part of the measured project');
    const record = assertSafetyInversion({ plannedPaths: workspace.plannedPaths, existingPaths: measured });
    assert.equal(record.status, GATE_STATUS.PASS, 'the exclusions are what let the plan and the project agree');
  } finally {
    removeTree(workspace.dir);
  }
});

test('A1 excludes exactly what the tree measurement excludes, so the two cannot disagree', () => {
  // A second exclusion list here could only diverge from the first, and the
  // divergence would be a false BLOCK on a project that merely has a `dist/`.
  assert.deepEqual(
    [...EXCLUDED_DIRECTORY_NAMES],
    [...MEASURED_TREE_EXCLUSIONS],
    'the exclusions have one definition, shared with the measurement that built the manifest',
  );

  const workspace = buildReverseWorkspace({ extraDirectories: [...MEASURED_TREE_EXCLUSIONS] });
  try {
    const measured = measureExistingDirectories(workspace.dir);
    for (const excluded of MEASURED_TREE_EXCLUSIONS) {
      assert.ok(!measured.includes(excluded), `${excluded} must be invisible to A1`);
    }
    assert.deepEqual(measured, workspace.plannedPaths, 'nothing unexcluded and unplanned is left either');
  } finally {
    removeTree(workspace.dir);
  }
});

test('A1 follows a linked directory, because the tree measurement that produced the manifest did', () => {
  // `Dirent.isDirectory()` is false for a symlink and `statSync(...).isDirectory()`
  // is true. The manifest is derived with the second, so A1 must count with the
  // second too — otherwise a legitimate project is reported missing a path it has.
  const workspace = buildReverseWorkspace();
  const linked = mkdtempSync(join(tmpdir(), 'allocate-reverse-linked-'));
  try {
    symlinkSync(join(workspace.dir, 'crates'), join(linked, 'crates'), 'dir');
    const measured = measureExistingDirectories(linked);
    assert.ok(measured.includes('crates'), 'a linked directory is a directory');
    assert.ok(measured.includes('crates/protocol/alpha'), 'and it is walked, not merely counted');
    assert.equal(
      assertSafetyInversion({ plannedPaths: workspace.plannedPaths, existingPaths: measured }).status,
      GATE_STATUS.PASS,
      'a wholly linked tree still matches the plan',
    );
  } finally {
    removeTree(linked);
    removeTree(workspace.dir);
  }
});

test('IT-2b a tree missing one planned path is BLOCKED, the path is named, and no top-level rename occurs', () => {
  const workspace = buildReverseWorkspace();
  try {
    const missingPath = join(workspace.dir, 'crates/protocol/beta');
    rmSync(missingPath, { recursive: true, force: true });
    const topLevelBefore = readTopLevelDirectories(workspace.dir);

    const run = spawnSync(
      process.execPath,
      [ALLOCATE_RUN, 'reverse', `--root=${workspace.dir}`, `--decisions=${writeDecisions(workspace)}`],
      { encoding: 'utf8' },
    );

    assert.notEqual(run.status, 0, 'a missing path stops the run');
    assert.match(`${run.stdout}${run.stderr}`, /crates\/protocol\/beta/);
    assert.deepEqual(readTopLevelDirectories(workspace.dir), topLevelBefore, 'no top-level entry moved');
    assert.equal(existsSync(join(workspace.dir, 'crates/protocol/alpha/mod.rs')), true, 'the surviving package is untouched');
  } finally {
    removeTree(workspace.dir);
  }
});

test('IT-3 the command digest still matches: an edit stayed an edit', () => {
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  const findings = compareDigests(baseline.commandFileDigests, digestCommandFiles(PROJECT_ROOT));
  assert.deepEqual(findings, [], 'appending lost no heading, no Language Protocol and no First-Class Rule');
});

test('IT-4 the forward-rotation regression gate still exits 0 and reports "proved"', () => {
  const check = spawnSync(process.execPath, [REGRESSION_RUN, 'regression', 'check'], { encoding: 'utf8' });

  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stdout, /proved/);
  assert.match(check.stdout, /0 pipeline run\(s\) disagreed/);
});

/** Write the decisions payload beside the workspace so the CLI can read it. */
// [::TICKET::] P22-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-12 --for-spec --no-implementation-order`.
function writeDecisions(workspace) {
  const path = `${workspace.dir}.decisions.json`;
  writeFileSync(path, JSON.stringify(workspace.decisions));
  return path;
}

test('the fixture really is the shape the gates are judged against', () => {
  const workspace = buildReverseWorkspace();
  try {
    // The plan is read from the manifest, so the fixture and the gate cannot
    // agree only because the same literal was written in two places.
    assert.deepEqual(workspace.plannedPaths, plannedPathsOf(workspace.manifest));
    assert.deepEqual(
      workspace.plannedPaths,
      ['crates', 'crates/protocol', 'crates/protocol/alpha', 'crates/protocol/beta'],
    );
    assert.deepEqual(readTopLevelDirectories(workspace.dir), ['crates', 'target', 'vendor']);
    // The partition is the forward fixture's, untouched; the only addition is the
    // provenance the reverse tree run recorded.
    assert.equal(workspace.manifest[REVERSE_PROVENANCE_FIELD].sidecar_bundle_hash, FIXTURE_SIDECAR_BUNDLE_HASH);
    assert.equal(workspace.manifest.workspace.packages.length, 2, 'the reverse rotation grounds the partition, it does not widen it');
  } finally {
    removeTree(workspace.dir);
  }
});
