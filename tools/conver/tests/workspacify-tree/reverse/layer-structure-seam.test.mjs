// P23-9 @verifies C002 @verifies C003
/**
 * Pattern 2's second obligation — the seam, and the receptacle that fits it.
 *
 * §3.2: the old root artefacts are not deleted and are not the answer. They become the
 * **prior** against which the new partition's difference is taken, and "reading the old
 * `RFC-ROOT-Dirs-Tree.json` as *the* partition would freeze the too-coarse boundaries
 * into the new canon". §3.4 adds that the old and the new differ and the difference is
 * **recorded** rather than eliminated, following §2.4: an unrecorded inconsistency is a
 * contradiction; a recorded one is not.
 *
 * Two receptacles existed and were not interchangeable. §7.3 left the question open. The
 * answer is stated in the module and asserted here: the `.delta.json` family records how
 * an artefact changed across one drill round, which presupposes the artefact continued
 * to exist, and the layer-structure change is the case where it did not.
 *
 * The measurement is one rule applied to both sides. §7.4 records the sub-error this
 * guards against: `measureExistingDirectories` (A1) excludes the workspace root while
 * `measureDirectoryTree` (T1/T2) includes it as `.`, and reading the first as evidence
 * about the second produced a wrong conclusion. Comparing the two here would report the
 * root as both new and disappeared, so the pair is refused rather than reported.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ARCHITECTURE_DELTA_FILE_NAME,
  MEASUREMENTS,
  PARTITION_ROLES,
  ROOT_PACKAGE_PATH,
  SEAM_DIFFERENCE_CLASSES,
  SEAM_RECEPTACLE,
  ZERO_DIFFERENCE_SIGNAL,
  assertDeltaRecorded,
  assertPriorUnchanged,
  assertSingleMeasurement,
  buildLayerStructureSeam,
  classifyPartitionDifference,
  digestFile,
  loadArchitectureDelta,
  mergeSeamIntoDelta,
  normalizePartitionPaths,
  readPriorPartition,
  renderLayerStructureSeam,
} from '../../../.claude/scripts/workspacify-tree/lib/architecture-delta.mjs';
import { runReverseGates } from '../../../.claude/scripts/workspacify-tree/lib/reverse-mode.mjs';
import { createSyntheticTree } from '../../workspacify-reverse/helpers/scratch.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const FIXTURES = join(PROJECT_ROOT, 'tests/workspacify-tree/fixtures');
const RUN_SCRIPT = join(PROJECT_ROOT, '.claude/scripts/workspacify-tree/run.mjs');
const MANIFEST_FILE_NAME = 'WORKSPACIFY-TREE-MANIFEST.json';

const ONE_MEASUREMENT = MEASUREMENTS.ROOT_INCLUDING;

/** A prior partition document, as `/boundify-graph` writes a Dirs-Tree. */
const PRIOR_DOCUMENT = Object.freeze({
  schemaVersion: 1,
  sourceFile: 'RFC-ROOT.md',
  trees: {
    rust: {
      name: 'src',
      type: 'directory',
      kind: 'root',
      children: [{ name: 'a', type: 'directory', kind: 'architecture', children: [] }],
    },
  },
});

/** Two path sets that differ, generated deterministically from a seed. */
// [::TICKET::] P23-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-9 --for-spec --no-implementation-order`.
function generateDifferingPartitions(seed) {
  const additions = ['src/a/one', 'src/a/two', 'src/c', 'src/d'];
  const removals = ['src/b', 'src/e'];
  const oldPaths = ['src', 'src/a', removals[seed % removals.length]];
  const newPaths = ['src', 'src/a', additions[seed % additions.length], additions[(seed + 1) % additions.length]];

  return { oldPaths: [...new Set(oldPaths)], newPaths: [...new Set(newPaths)] };
}

/**
 * A partition descriptor for one side of a seam.
 *
 * `present: true` is declared rather than implied: the seam refuses a prior whose
 * presence was never stated, because an unread prior and an empty one are different
 * findings.
 */
// [::TICKET::] P23-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-9 --for-spec --no-implementation-order`.
function makePartition(source, paths) {
  return { present: true, source, paths };
}

test('C002 the five classes are the vocabulary the count and the assertion share', () => {
  assert.deepEqual(SEAM_DIFFERENCE_CLASSES, ['unchanged', 'split', 'merged', 'new', 'disappeared']);
  assert.equal(ROOT_PACKAGE_PATH, '.');
  assert.deepEqual(Object.keys(PARTITION_ROLES).sort(), ['MEASURED', 'PRIOR']);
});

test('C002 UT-11: every package in the union is classified exactly once, with counts per class', () => {
  const oldPartition = makePartition('priors/RFC-ROOT-Dirs-Tree.json', ['src', 'src/a', 'src/b']);
  const newPartition = makePartition('measured manifest', ['.', 'src', 'src/a', 'src/a/one', 'src/a/two']);
  const seam = buildLayerStructureSeam({ oldPartition, newPartition, measurement: ONE_MEASUREMENT });

  assert.deepEqual(Object.keys(seam.difference).sort(), [...SEAM_DIFFERENCE_CLASSES].sort());

  const union = new Set([...oldPartition.paths, ...newPartition.paths]);
  assert.equal(
    Object.values(seam.counts).reduce((sum, count) => sum + count, 0),
    union.size,
    'the counts reconcile with the partition, not with the choice of classifier',
  );
  for (const kind of SEAM_DIFFERENCE_CLASSES) {
    assert.equal(seam.counts[kind], seam.difference[kind].length, `${kind} count matches its list`);
  }

  // Both survivors gained packages beneath them, so both boundaries were drawn finer,
  // and nothing in this pair survived undivided.
  assert.deepEqual(seam.difference.unchanged, []);
  assert.deepEqual(seam.difference.split, ['src', 'src/a']);
  assert.deepEqual(seam.difference.disappeared, ['src/b']);
  assert.deepEqual(seam.difference.new, ['.', 'src/a/one', 'src/a/two']);
  assert.deepEqual(seam.difference.merged, []);
});

test('C002 UT-11b: a merge is named as a merge, and the boundaries it swallowed as disappeared', () => {
  const difference = classifyPartitionDifference({
    oldPaths: ['p/a', 'p/b', 'p/a/x'],
    newPaths: ['p'],
  });

  assert.deepEqual(difference.merged, ['p'], 'three old boundaries collapsed into one new package');
  assert.deepEqual(difference.disappeared, ['p/a', 'p/a/x', 'p/b']);
  assert.deepEqual(difference.unchanged, []);
  assert.deepEqual(difference.new, []);
  assert.deepEqual(difference.split, []);
});

test('C002 UT-11c: an old boundary replaced by finer ones is a split on the old side and new on the new', () => {
  const difference = classifyPartitionDifference({
    oldPaths: ['q', 'q/a'],
    newPaths: ['q/x', 'q/y'],
  });

  assert.deepEqual(difference.split, ['q'], 'q itself is gone, and packages now stand where it stood');
  assert.deepEqual(difference.disappeared, ['q/a']);
  assert.deepEqual(difference.new, ['q/x', 'q/y']);
});

test('C002 UT-12: the record states its receptacle and the reason, settling §7.3 by argument', () => {
  assert.equal(SEAM_RECEPTACLE.file, ARCHITECTURE_DELTA_FILE_NAME);
  assert.match(SEAM_RECEPTACLE.reason, /discontinuity/);
  assert.match(SEAM_RECEPTACLE.reason, /incremental/, 'the reason names what the other receptacle records');

  const seam = buildLayerStructureSeam({
    oldPartition: makePartition('prior', ['src']),
    newPartition: makePartition('measured manifest', ['src', 'src/a']),
    measurement: ONE_MEASUREMENT,
  });

  assert.equal(seam.receptacle, ARCHITECTURE_DELTA_FILE_NAME);
  assert.equal(seam.receptacleReason, SEAM_RECEPTACLE.reason);
  assert.equal(seam.oldPartition.role, PARTITION_ROLES.PRIOR);
  assert.equal(seam.newPartition.role, PARTITION_ROLES.MEASURED);

  const rendered = renderLayerStructureSeam(seam);
  assert.match(rendered, /prior/);
  assert.match(rendered, /never the answer/);
  assert.match(rendered, /discontinuity/);
});

test('C003 UT-13: at the zero, the equality is reported as a signal rather than as health', () => {
  const paths = ['src', 'src/a', 'src/b'];
  const seam = buildLayerStructureSeam({
    oldPartition: makePartition('prior', paths),
    newPartition: makePartition('measured manifest', [...paths]),
    measurement: ONE_MEASUREMENT,
  });

  assert.deepEqual(seam.difference.unchanged, paths);
  for (const kind of ['split', 'merged', 'new', 'disappeared']) assert.deepEqual(seam.difference[kind], [], kind);
  assert.equal(seam.boundaryChanged, false);
  assert.deepEqual(seam.mismatches, [], 'agreement produces no mismatch to record');
  assert.equal(seam.signal, ZERO_DIFFERENCE_SIGNAL);

  const rendered = renderLayerStructureSeam(seam);
  assert.match(rendered, /no boundary change/);
  assert.match(rendered, /signal rather than health/i);
  assert.doesNotMatch(rendered, /\bPASS\b/, 'the equality is not presented as a success');
});

test('C002 UT-14: the root is compared through one measurement, so it cannot become a spurious row', () => {
  // T1's measurement names the root `.`; a partition walked naively names it ''.
  assert.deepEqual(normalizePartitionPaths(['', './', '.', 'src/']), ['.', 'src']);
  assert.deepEqual(normalizePartitionPaths(['.', 'src', 'src']), ['.', 'src']);

  const seam = buildLayerStructureSeam({
    oldPartition: makePartition('a root-excluding walk (root as "")', ['', 'src']),
    newPartition: makePartition('the tree measurement (root as ".")', ['.', 'src']),
    measurement: ONE_MEASUREMENT,
  });
  assert.deepEqual(seam.difference.unchanged, ['.', 'src']);
  assert.deepEqual(seam.difference.new, []);
  assert.deepEqual(seam.difference.disappeared, []);
  assert.equal(seam.counts.unchanged, 2, 'the root is one row, not two');

  // A pair measured twice, under two rules, is refused rather than reported: that is the
  // error §7.4 records, and reporting it as a difference would repeat it.
  assert.throws(
    () => buildLayerStructureSeam({
      oldPartition: { ...makePartition('allocate', ['src']), measurement: MEASUREMENTS.ROOT_EXCLUDING },
      newPartition: { ...makePartition('tree', ['.', 'src']), measurement: MEASUREMENTS.ROOT_INCLUDING },
      measurement: MEASUREMENTS.ROOT_INCLUDING,
    }),
    /measured under two rules/,
  );
  assert.throws(
    () => assertSingleMeasurement({
      measurement: MEASUREMENTS.ROOT_INCLUDING,
      partitions: [makePartition('a', ['src']), { ...makePartition('b', ['src']), measurement: MEASUREMENTS.ROOT_EXCLUDING }],
    }),
    /measured under two rules/,
  );
});

test('C002 UT-15: a prior that moved under the run is named by path, not measured against', () => {
  const tree = createSyntheticTree({ 'RFC-ROOT-Dirs-Tree.json': JSON.stringify(PRIOR_DOCUMENT) });
  try {
    const priorPath = join(tree.root, 'RFC-ROOT-Dirs-Tree.json');
    const before = digestFile(priorPath);
    const prior = readPriorPartition(priorPath);
    assert.equal(prior.present, true);
    assert.deepEqual(prior.paths, ['src', 'src/a']);

    // Untouched: the guard is silent, which is the state every run must leave.
    assert.doesNotThrow(() =>
      assertPriorUnchanged({ path: priorPath, beforeDigest: before, afterDigest: digestFile(priorPath) }));

    writeFileSync(priorPath, JSON.stringify({ ...PRIOR_DOCUMENT, analysis: 'rewritten by the run' }));
    assert.throws(
      () => assertPriorUnchanged({ path: priorPath, beforeDigest: before, afterDigest: digestFile(priorPath) }),
      /RFC-ROOT-Dirs-Tree\.json/,
    );
  } finally {
    tree.dispose();
  }
});

test('C002 UT-16: no prior partition is a state of its own, never an empty difference', () => {
  const tree = createSyntheticTree({ 'src/lib.rs': 'pub fn f() {}\n' });
  try {
    const prior = readPriorPartition(join(tree.root, 'RFC-ROOT-Dirs-Tree.json'));
    assert.equal(prior.present, false);
    assert.deepEqual(prior.paths, []);
    assert.match(prior.reason, /no prior partition/);

    const seam = buildLayerStructureSeam({
      oldPartition: prior,
      newPartition: makePartition('measured manifest', ['src']),
      measurement: ONE_MEASUREMENT,
    });
    assert.equal(seam.priorPresent, false);
    assert.equal(seam.difference, null, 'there is no difference to take against nothing');

    const rendered = renderLayerStructureSeam(seam);
    assert.match(rendered, /no prior partition existed/);
    assert.doesNotMatch(rendered, /unchanged/, 'the absent case must not read as agreement');
  } finally {
    tree.dispose();
  }
});

test('C002 UT-17: over twenty generated pairs the new partition is measured, never adopted', () => {
  for (let seed = 0; seed < 20; seed += 1) {
    const { oldPaths, newPaths } = generateDifferingPartitions(seed);
    const seam = buildLayerStructureSeam({
      oldPartition: makePartition('prior', oldPaths),
      newPartition: makePartition('measured manifest', newPaths),
      measurement: ONE_MEASUREMENT,
    });

    assert.equal(seam.priorPresent, true, `seed ${seed}`);
    assert.notDeepEqual(
      [...seam.newPartition.paths].sort(),
      [...seam.oldPartition.paths].sort(),
      `seed ${seed}: the new partition is measured, never copied from the prior`,
    );
    assert.ok(seam.mismatches.length > 0, `seed ${seed}: a difference exists and is recorded`);

    const union = new Set([...seam.oldPartition.paths, ...seam.newPartition.paths]);
    assert.equal(
      Object.values(seam.counts).reduce((sum, count) => sum + count, 0),
      union.size,
      `seed ${seed}: every path in the union is classified exactly once`,
    );

    const classified = SEAM_DIFFERENCE_CLASSES.flatMap((kind) => seam.difference[kind]);
    assert.equal(new Set(classified).size, classified.length, `seed ${seed}: no path is classified twice`);
    assert.deepEqual([...classified].sort(), [...union].sort(), `seed ${seed}: no path is unclassified`);
  }
});

test('C002 UT-18: the record is deterministic, and the merge is idempotent', () => {
  const seam = buildLayerStructureSeam({
    oldPartition: makePartition('prior', ['src', 'src/b']),
    newPartition: makePartition('measured manifest', ['src', 'src/a']),
    measurement: ONE_MEASUREMENT,
  });
  const authored = { mismatches: [{ kind: 'extra', path: 'src/x' }] };
  const buildDelta = () => JSON.stringify(mergeSeamIntoDelta(authored, seam), null, 2);

  assert.equal(buildDelta(), buildDelta());

  const dir = mkdtempSync(join(tmpdir(), 'p23-9-determinism-'));
  try {
    const deltaPath = join(dir, ARCHITECTURE_DELTA_FILE_NAME);
    writeFileSync(deltaPath, buildDelta());
    const first = readFileSync(deltaPath);
    writeFileSync(deltaPath, buildDelta());
    assert.deepEqual(readFileSync(deltaPath), first, 'two runs write the same bytes');

    const parsed = JSON.parse(first.toString('utf8'));
    assert.equal(parsed.mismatches.length, 1 + seam.mismatches.length, 'the operator\'s record is kept and the seam is added');
    assert.ok(
      parsed.mismatches.some((mismatch) => mismatch.kind === 'extra' && mismatch.path === 'src/x'),
      'the authored mismatch is still there',
    );
    assert.ok(parsed.layerStructureChange, 'and the seam is published beside it');

    // Re-merging the record that already carries the seam adds nothing.
    const recounted = mergeSeamIntoDelta(parsed, seam);
    assert.equal(recounted.mismatches.length, parsed.mismatches.length);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C003 UT-20: every mismatch the seam produced is in the document T5 reads', () => {
  const seam = buildLayerStructureSeam({
    oldPartition: makePartition('prior', ['src', 'src/b']),
    newPartition: makePartition('measured manifest', ['src', 'src/a']),
    measurement: ONE_MEASUREMENT,
  });
  assert.ok(seam.mismatches.length > 0, 'this pair differs, so the assertion below is not vacuous');

  const dir = mkdtempSync(join(tmpdir(), 'p23-9-t5-'));
  try {
    const deltaPath = join(dir, ARCHITECTURE_DELTA_FILE_NAME);
    writeFileSync(deltaPath, JSON.stringify(mergeSeamIntoDelta({ mismatches: [] }, seam), null, 2));

    const loaded = loadArchitectureDelta(deltaPath);
    const record = assertDeltaRecorded({
      differences: seam.mismatches,
      recorded: loaded.mismatches,
      deltaFileExists: loaded.exists,
    });

    // T5 passes on the disagreement being recorded, never on the two partitions agreeing.
    assert.equal(record.status, 'PASS', record.reasons.join('; '));
    assert.equal(record.counts.differences, seam.mismatches.length);
    assert.equal(record.counts.unrecorded, 0);
    for (const mismatch of seam.mismatches) {
      assert.ok(SEAM_DIFFERENCE_CLASSES.includes(mismatch.kind), 'the kind is the seam vocabulary');
      assert.ok(
        loaded.mismatches.some((entry) => entry.kind === mismatch.kind && entry.path === mismatch.path),
        `${mismatch.kind}:${mismatch.path} is in the document the gate read`,
      );
    }

    // The gate still refuses a document that omits the seam, so the PASS above is not vacuous.
    assert.equal(assertDeltaRecorded({ differences: seam.mismatches, recorded: [], deltaFileExists: true }).status, 'FAIL');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C003 UT-21: over twenty generated pairs the recorded count is the derived count', () => {
  for (let seed = 0; seed < 20; seed += 1) {
    const { oldPaths, newPaths } = generateDifferingPartitions(seed);
    const seam = buildLayerStructureSeam({
      oldPartition: makePartition('prior', oldPaths),
      newPartition: makePartition('measured manifest', newPaths),
      measurement: ONE_MEASUREMENT,
    });

    const derived = seam.difference.split.length + seam.difference.merged.length
      + seam.difference.new.length + seam.difference.disappeared.length;
    assert.equal(seam.mismatches.length, derived, `seed ${seed}: the record and the difference are one count`);

    const record = assertDeltaRecorded({
      differences: seam.mismatches,
      recorded: [...seam.mismatches],
      deltaFileExists: true,
    });
    assert.equal(record.status, 'PASS', `seed ${seed}`);
    assert.equal(record.counts.differences, derived, `seed ${seed}`);
    assert.equal(record.counts.unrecorded, 0, `seed ${seed}`);
  }
});

test('C002/C003 IT-22: the seam reaches T5 through the gate runner, and the wiring is additive', () => {
  const seam = buildLayerStructureSeam({
    oldPartition: makePartition('prior', ['src', 'src/b']),
    newPartition: makePartition('measured manifest', ['src', 'src/a']),
    measurement: ONE_MEASUREMENT,
  });
  const mismatches = [...seam.mismatches];
  assert.ok(mismatches.length > 0, 'this pair differs, so the assertion below is not vacuous');

  const packages = [{ id: 'pkg-src', path: 'src' }];
  const base = {
    mode: 'reverse',
    manifest: { workspace: { packages }, dependencies: { dag: { implementation_order: [] } } },
    measured: { directories: ['src'], sourceFiles: ['src/lib.rs'], edges: [] },
    delta: { exists: true, mismatches },
    reverseProvenance: { sidecar_bundle_hash: 'a'.repeat(64) },
    sidecarFiles: [],
  };

  const withSeam = runReverseGates({ ...base, seam: { mismatches } });
  const withoutSeam = runReverseGates({ ...base, seam: undefined, delta: { exists: true, mismatches: [] } });

  assert.equal(withSeam.length, 6, 'T1 to T6 are all judged either way');
  const t5 = withSeam.find((record) => record.gateId === 'T5');
  const t5Without = withoutSeam.find((record) => record.gateId === 'T5');
  assert.equal(t5.status, 'PASS', t5.reasons.join('; '));
  assert.equal(t5.counts.differences, mismatches.length, 'the seam is judged alongside the parity differences');
  assert.equal(t5Without.counts.differences, 0);

  // Every other gate answers exactly what it answered before this ticket.
  for (const record of withoutSeam) {
    if (record.gateId === 'T5') continue;
    const counterpart = withSeam.find((entry) => entry.gateId === record.gateId);
    assert.equal(counterpart.status, record.status, `${record.gateId} is unchanged by the seam`);
  }
});

test('C002 IT-23: a reverse run over a subject with no prior partition records that there was none', () => {
  const decisions = JSON.parse(readFileSync(join(FIXTURES, 'decisions-complete.json'), 'utf8'));
  const packagePath = decisions.workspace[0].path;
  const dir = mkdtempSync(join(tmpdir(), 'p23-9-seam-cli-'));
  try {
    const measuredRoot = join(dir, 'measured');
    const sourcePath = join(packagePath, 'mod.rs');
    writeFileSync(join(dir, 'measured-edges.json'), JSON.stringify({ edges: [] }, null, 2));
    writeFileSync(
      join(dir, 'graph.json'),
      `${JSON.stringify({ sourceFile: 'RFC-ROOT.md', nodes: [{ id: 'N0001', title: 'Purpose', file: sourcePath }] }, null, 2)}\n`,
    );
    const outDir = join(dir, 'out');
    const deltaPath = join(outDir, ARCHITECTURE_DELTA_FILE_NAME);
    mkdirSync(outDir, { recursive: true });

    const runOnce = (extraArgs) => {
      writeFileSync(deltaPath, `${JSON.stringify({ mismatches: [] }, null, 2)}\n`);
      return spawnSync(process.execPath, [
        RUN_SCRIPT, 'reverse',
        `--spec=${join(FIXTURES, 'objects-table.md')}`,
        `--decisions=${join(FIXTURES, 'decisions-complete.json')}`,
        `--root=${measuredRoot}`,
        `--graph=${join(dir, 'graph.json')}`,
        `--measured=${join(dir, 'measured-edges.json')}`,
        `--sidecars=${join(dir, 'sidecars')}`,
        `--delta=${deltaPath}`,
        `--out=${outDir}`,
        ...extraArgs,
      ], { cwd: PROJECT_ROOT, encoding: 'utf8' });
    };

    // The fixture tree the reverse run measures: one source file in the declared package.
    mkdirSync(join(measuredRoot, packagePath), { recursive: true });
    writeFileSync(join(measuredRoot, sourcePath), 'pub fn call() {}\n');
    const sidecarDir = join(dir, 'sidecars');
    mkdirSync(sidecarDir, { recursive: true });
    writeFileSync(join(sidecarDir, 'ANALYSIS-SCOPE.json'), '{\n  "scope": "the fixture project"\n}\n');

    const withoutPrior = runOnce([]);
    assert.doesNotMatch(readFileSync(deltaPath, 'utf8'), /layerStructureChange/, 'no flag, no seam');

    // The subject carries no Dirs-Tree, which is why the record says no prior existed.
    const priorPath = join(measuredRoot, 'RFC-ROOT-Dirs-Tree.json');
    const withPrior = runOnce([`--prior-partition=${priorPath}`]);

    assert.equal(withPrior.status, withoutPrior.status, 'the flag is opt-in and changes no verdict');
    const deltaText = readFileSync(deltaPath, 'utf8');
    const delta = JSON.parse(deltaText);
    assert.equal(delta.layerStructureChange.priorPresent, false);
    assert.equal(delta.layerStructureChange.difference, null);
    assert.match(deltaText, /no prior partition existed/);
    assert.ok(Array.isArray(delta.mismatches), 'the document keeps the shape T5 reads');

    // The operator reads the record, so the seam reaches the report and not only the file:
    // an array of class names is not a sentence about what the act redrew.
    assert.match(withPrior.stdout, /## Layer-structure change — ARCHITECTURE-DELTA\.json/);
    assert.match(withPrior.stdout, /no prior partition existed/);
    assert.doesNotMatch(withoutPrior.stdout, /## Layer-structure change/, 'no flag, no section to read');

    // And with a prior that really differs, the report names the partitions and the classes.
    writeFileSync(priorPath, `${JSON.stringify(PRIOR_DOCUMENT, null, 2)}\n`);
    const withRealPrior = runOnce([`--prior-partition=${priorPath}`]);
    assert.match(withRealPrior.stdout, /old partition, the prior/);
    assert.match(withRealPrior.stdout, /new partition, measured/);
    assert.match(withRealPrior.stdout, /never the answer/);
    assert.match(withRealPrior.stdout, /disappeared: \d+/);
    assert.match(withRealPrior.stdout, /discontinuity/);

    const realDelta = JSON.parse(readFileSync(deltaPath, 'utf8'));
    assert.equal(realDelta.layerStructureChange.priorPresent, true);
    assert.ok(realDelta.layerStructureChange.mismatches.length > 0, 'the real prior differs from the measured partition');
    assert.equal(
      realDelta.mismatches.length,
      realDelta.layerStructureChange.mismatches.length,
      'the seam\'s mismatches are in the list T5 reads',
    );
    assert.equal(assertDeltaRecorded({
      differences: realDelta.layerStructureChange.mismatches,
      recorded: realDelta.mismatches,
      deltaFileExists: true,
    }).status, 'PASS', 'T5 passes over the recorded document');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
