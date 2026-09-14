// @verifies C001
// @verifies C002
// @verifies C003
/**
 * The isolated environment, with no project baked into it.
 *
 * The sandbox was built for one experiment, and named it: a module-level constant
 * listed the two paired trees to guard, a two-entry priority list named the only
 * ecosystems a start plan could come from, and a two-entry kind list named the
 * only databases that could be declared. A module like that can only measure the
 * project it was written for, so R2.5's dynamic half could never generalise.
 *
 * Three claims are held apart here.
 *
 * The first is that the subject and the guard come from the caller. The guard is
 * the caller's declaration unioned with the subject root, and the experiment's
 * own guard is recovered by declaring its two trees — computed from the call site
 * rather than read from a constant, which the digest-equality case proves.
 *
 * The second is that adding an ecosystem is adding a registry row. The detector
 * receives the registry it iterates, so a synthetic row is found with no code
 * change, and no branch anywhere names an ecosystem identifier.
 *
 * The third is that detection is an act of reading. A start plan is matched
 * against the same artefact walk the rest of the analysis uses, and the database
 * kinds are read out of the manifests that name them — with no process spawned
 * and no socket opened, asserted by running the detection in a child process
 * whose process and socket modules throw on use.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  DATABASE_INDICATORS,
  DEFAULT_GUARDED_PATHS,
  START_PLAN_ECOSYSTEMS,
  START_PLAN_EXECUTABLES,
  START_PLAN_NETWORK_VERBS,
  SandboxError,
  assertSubjectUntouched,
  createSandbox,
  detectStartPlan,
  discoverDatabaseKinds,
  discoverStartPlans,
  disposeSandbox,
  resetSandbox,
  resolveGuardedPaths,
  runTransition,
} from '../../../.claude/scripts/workspacify-reverse/lib/sandbox.mjs';
import { listArtefacts } from '../../../.claude/scripts/workspacify-reverse/lib/analysis-tech.mjs';
import { digestTree } from '../../../.claude/scripts/workspacify-reverse/lib/holdout-ledger.mjs';
import { createSyntheticTree, hashTree } from '../helpers/scratch.mjs';

/** The conver repository this suite belongs to, derived from this file rather than from the cwd. */
const CONVER_ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const SANDBOX_MODULE = join(CONVER_ROOT, '.claude/scripts/workspacify-reverse/lib/sandbox.mjs');
const ISOLATION_MODULE = join(CONVER_ROOT, '.claude/scripts/workspacify-reverse/lib/worktree-isolation.mjs');

/** A subject that is not the experiment: a Rust crate with a nested source directory. */
const NON_SIPRS_TARGET = Object.freeze({
  'Cargo.toml': '[package]\nname = "pingable"\nversion = "0.1.0"\nedition = "2021"\n',
  'src/lib.rs': 'pub fn ping() -> bool {\n    true\n}\n',
});

/** A Cargo manifest that names its database, so discovery has something to find. */
const SQLITE_CARGO_MANIFEST = '[package]\nname = "pingable"\nversion = "0.1.0"\n\n[dependencies]\nrusqlite = "0.31"\n';

/** The one declared shape a Cargo manifest produces, so the assertion names it once. */
const CARGO_SHAPE_ARGS = Object.freeze(['metadata', '--no-deps', '--format-version', '1', '--offline']);

/**
 * A module-customization hook that turns process and socket modules into throws.
 *
 * Detection is a read: it may open a file, and it may not spawn a process or open
 * a socket. Replacing those modules with stubs that throw makes the claim
 * falsifiable — a detection that reached for one fails rather than passes, which
 * a test asserting "it returned the right kinds" could never tell apart.
 */
const THROWING_STUB_LOADER_SOURCE = `
import { register } from 'node:module';

/** Importing one of these is already a failure, so the module body throws. */
const FORBIDDEN_ON_IMPORT = ['node:net', 'node:http', 'node:https', 'node:dns', 'node:worker_threads'];

/** These load, because the module graph imports them, but every use throws. */
const THROWING_NAMES = ['spawnSync', 'spawn', 'execSync', 'exec', 'execFileSync', 'execFile', 'fork'];

const loaderSource = \`
const FORBIDDEN_ON_IMPORT = \${JSON.stringify(FORBIDDEN_ON_IMPORT)};
const THROWING_NAMES = \${JSON.stringify(THROWING_NAMES)};

export async function resolve(specifier, context, next) {
  if (FORBIDDEN_ON_IMPORT.includes(specifier)) {
    const source = 'throw new Error("FORBIDDEN MODULE IMPORTED: ' + specifier + '");';
    return { url: 'data:text/javascript,' + encodeURIComponent(source), shortCircuit: true };
  }
  if (specifier === 'node:child_process') {
    const source =
      THROWING_NAMES.map(
        (name) => 'export function ' + name + '() { throw new Error("FORBIDDEN PROCESS STARTED: ' + name + '"); }',
      ).join('\\\\n') + '\\\\nexport default {};\\\\n';
    return { url: 'data:text/javascript,' + encodeURIComponent(source), shortCircuit: true };
  }
  return next(specifier, context);
}
\`;

register('data:text/javascript,' + encodeURIComponent(loaderSource));
`;

/**
 * Run both detection paths in a child process where every process and socket
 * module throws, and report what the child printed.
 *
 * The probe is written to a scratch tree rather than inlined with `--eval`,
 * because an inline string would need the module path quoted twice and a quoting
 * mistake would be a test that passes by never running the detection at all.
 *
 * Both paths are exercised, not only the database one: a start plan is matched
 * against the same walk, and "the plan is produced without starting anything" is
 * a claim about the module rather than about one of its functions.
 */
// [::TICKET::] P23-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-5 --for-spec --no-implementation-order`.
function runDetectionWithThrowingStubs(subjectRoot) {
  const loader = createSyntheticTree({ 'throwing-stubs.mjs': THROWING_STUB_LOADER_SOURCE }, { prefix: 'wsp-p23-5-loader-' });
  const probe = createSyntheticTree(
    {
      'probe.mjs': [
        `import { detectStartPlan, discoverDatabaseKinds } from ${JSON.stringify(SANDBOX_MODULE)};`,
        'const startPlan = detectStartPlan(process.argv[2]);',
        'const databaseKinds = discoverDatabaseKinds(process.argv[2]);',
        'process.stdout.write(',
        '  JSON.stringify({ planKind: startPlan.plan?.kind ?? null, kinds: databaseKinds.kinds, found: databaseKinds.found }),',
        ');',
        '',
      ].join('\n'),
    },
    { prefix: 'wsp-p23-5-probe-' },
  );
  try {
    return spawnSync(
      process.execPath,
      [
        '--import',
        pathToFileURL(join(loader.root, 'throwing-stubs.mjs')).href,
        join(probe.root, 'probe.mjs'),
        subjectRoot,
      ],
      { encoding: 'utf8' },
    );
  } finally {
    loader.dispose();
    probe.dispose();
  }
}

// ---------------------------------------------------------------------------
// C001 — the subject root and the guard come from the caller
// ---------------------------------------------------------------------------

test('UT-C001-pre createSandbox takes the subject root and the caller-declared guard', () => {
  const target = createSyntheticTree(NON_SIPRS_TARGET, { prefix: 'wsp-p23-5-subject-' });
  const scratch = createSyntheticTree({}, { prefix: 'wsp-p23-5-scratch-' });
  const handle = createSandbox(target.root, { scratchRoot: scratch.root, guardedPaths: ['src'] });
  try {
    assert.equal(handle.targetRoot, target.root);
    assert.deepEqual(
      [...handle.guardedPaths].sort(),
      [target.root, join(target.root, 'src')].sort(),
      'the guarded set is the caller declaration unioned with the subject root itself',
    );
  } finally {
    disposeSandbox(handle);
    target.dispose();
    scratch.dispose();
  }
});

test('UT-C001-post neither isolation module keeps a project name in a default position', async () => {
  const sandbox = await import(SANDBOX_MODULE);
  const isolation = await import(ISOLATION_MODULE);

  for (const projectName of ['siprs-with-4layers', 'siprs-for-reverse']) {
    assert.equal(
      readFileSync(SANDBOX_MODULE, 'utf8').includes(projectName),
      false,
      `sandbox.mjs must not name ${projectName}: the caller declares it`,
    );
    assert.equal(
      readFileSync(ISOLATION_MODULE, 'utf8').includes(projectName),
      false,
      `worktree-isolation.mjs must not name ${projectName}`,
    );
    // A later ticket could re-add a default as an export rather than as source
    // text, so the exported values are searched too and not only the module body.
    // An exported callable is read as its source, because that is where a literal
    // default would sit; an exported value is read as its JSON.
    for (const [name, value] of [...Object.entries(sandbox), ...Object.entries(isolation)]) {
      const searchable = typeof value === 'function' ? String(value) : (JSON.stringify(value ?? null) ?? '');
      assert.equal(
        searchable.includes(projectName),
        false,
        `the export ${name} must not carry ${projectName} as a default`,
      );
    }
  }

  assert.equal('PRODUCTION_PATHS' in sandbox, false, 'the constant is removed, not deprecated');
  assert.equal(
    'assertProductionUntouched' in sandbox,
    false,
    'the old name is not kept as an alias, which would leave a caller believing it still guards the experiment',
  );
  assert.equal(typeof sandbox.assertSubjectUntouched, 'function');
  assert.equal(typeof sandbox.resolveGuardedPaths, 'function');
});

test('UT-C001-bound an empty declaration yields exactly the subject root', () => {
  assert.deepEqual(DEFAULT_GUARDED_PATHS, [], 'the declared default is the empty set, not a project list');
  assert.deepEqual(resolveGuardedPaths({ subjectRoot: '/tmp/subject' }), ['/tmp/subject']);
  assert.deepEqual(resolveGuardedPaths({ subjectRoot: '/tmp/subject', declared: [] }), ['/tmp/subject']);
});

test('UT-C001-bound a subject root named as its own guard is not double-counted', () => {
  assert.deepEqual(resolveGuardedPaths({ subjectRoot: '/tmp/subject', declared: ['.'] }), ['/tmp/subject']);
});

test('UT-C001-err a guard that points outside the subject is refused by name', () => {
  assert.throws(
    () => resolveGuardedPaths({ subjectRoot: '/tmp/subject', declared: ['../../elsewhere'] }),
    (error) => {
      assert.equal(error instanceof SandboxError, true);
      assert.equal(error.reason, 'guarded-path-outside-subject');
      assert.ok(error.message.includes('../../elsewhere'), 'the refusal names the offending declaration');
      return true;
    },
    'a guard that points outside the subject cannot be checked by digesting the subject',
  );
});

test('UT-C001-err a root that does not exist is refused, naming it', () => {
  const missing = join(tmpdir(), 'wsp-p23-5-absent-root');
  assert.throws(
    () => createSandbox(missing, { guardedPaths: [] }),
    (error) => {
      assert.equal(error.reason, 'root-missing');
      assert.ok(error.message.includes(missing));
      return true;
    },
  );
});

test('UT-C001-err a fabricated handle is still refused by resetSandbox and runTransition', () => {
  const forged = {
    sandboxId: 'forged',
    sandboxRoot: '/tmp',
    sandboxUsable: true,
    transitions: [],
    guardedPaths: [],
    guardedDigest: {},
  };
  const operations = [
    () => resetSandbox(forged),
    () => runTransition(forged, { name: 'touch', command: 'true', args: [] }),
  ];
  for (const operate of operations) {
    assert.throws(operate, (error) => error.reason === 'sandbox-not-observed');
  }
});

// ---------------------------------------------------------------------------
// C002 — the start plan comes from a declared registry, not from branches
// ---------------------------------------------------------------------------

test('UT-C002-pre every declared ecosystem row carries an identifier, manifests and a shape', () => {
  const required = ['cargo', 'node', 'go', 'python', 'cmake', 'make', 'compose'];
  const declared = START_PLAN_ECOSYSTEMS.map((row) => row.id);
  for (const id of required) {
    assert.ok(declared.includes(id), `the registry must declare ${id}`);
  }

  const priorities = START_PLAN_ECOSYSTEMS.map((row) => row.priority);
  assert.equal(new Set(priorities).size, priorities.length, 'priorities are total orders, not ties');

  for (const row of START_PLAN_ECOSYSTEMS) {
    assert.equal(typeof row.id, 'string');
    assert.equal(typeof row.priority, 'number');
    assert.ok(row.manifestNames.length > 0, `${row.id} is recognised by at least one manifest name`);
    assert.equal(typeof row.commandShape.command, 'string');
    assert.ok(row.commandShape.args.length > 0, `${row.id} declares a command shape`);
    assert.ok(row.offlineReason.length > 0, `${row.id} states why its shape cannot reach the network`);
  }
});

test('UT-C002-post a Cargo manifest yields a plan naming the ecosystem, the manifest and the shape', () => {
  const target = createSyntheticTree(NON_SIPRS_TARGET, { prefix: 'wsp-p23-5-plan-' });
  try {
    const result = detectStartPlan(target.root);
    assert.equal(result.plan.kind, 'cargo');
    assert.equal(result.plan.manifest, 'Cargo.toml');
    assert.equal(result.plan.command, 'cargo');
    assert.deepEqual(result.plan.args, CARGO_SHAPE_ARGS);
    assert.equal(result.plan.matchedFrom, 'Cargo.toml');
    assert.deepEqual(result.plan.alsoMatched, []);
    assert.deepEqual(
      result.searchedEcosystems.map((row) => row.id),
      START_PLAN_ECOSYSTEMS.map((row) => row.id),
      'the result names every ecosystem it looked for',
    );
  } finally {
    target.dispose();
  }
});

test('UT-C002-post a Node lock file names the package manager the plan starts with', () => {
  const target = createSyntheticTree(
    { 'package.json': '{"name":"pingable"}', 'pnpm-lock.yaml': 'lockfileVersion: 9\n' },
    { prefix: 'wsp-p23-5-node-' },
  );
  try {
    const { plan } = detectStartPlan(target.root);
    assert.equal(plan.kind, 'node');
    assert.equal(plan.manifest, 'package.json');
    assert.equal(plan.command, 'pnpm');
    assert.equal(plan.namedBy, 'pnpm-lock.yaml', 'the artefact that selected the package manager is reported');
  } finally {
    target.dispose();
  }
});

test('UT-C002-post a service definition leads a build manifest', () => {
  const target = createSyntheticTree(
    {
      'docker-compose.yml': 'services:\n  api:\n    image: pingable\n',
      'Cargo.toml': '[package]\nname = "ping"\n',
    },
    { prefix: 'wsp-p23-5-compose-' },
  );
  try {
    const plans = discoverStartPlans(target.root);
    assert.deepEqual(plans.map((plan) => plan.kind), ['compose', 'cargo']);
    assert.deepEqual(plans[0].args, ['compose', '-f', 'docker-compose.yml', 'config', '--quiet']);
  } finally {
    target.dispose();
  }
});

test('UT-C002-inv a synthetic ecosystem row is found with no code change', () => {
  const synthetic = Object.freeze({
    id: 'bazel',
    priority: 99,
    manifestNames: Object.freeze(['MODULE.bazel']),
    commandShape: Object.freeze({ command: 'bazel', args: Object.freeze(['mod', 'graph']), environment: Object.freeze({}) }),
    offlineReason: 'bazel mod graph reads the local module graph and resolves nothing remotely',
  });
  const target = createSyntheticTree({ 'MODULE.bazel': 'module(name = "pingable")\n' }, { prefix: 'wsp-p23-5-row-' });
  try {
    const { plan } = detectStartPlan(target.root, { ecosystems: [...START_PLAN_ECOSYSTEMS, synthetic] });
    assert.equal(plan.kind, 'bazel');
    assert.equal(plan.manifest, 'MODULE.bazel');
    assert.equal(
      START_PLAN_ECOSYSTEMS.some((row) => row.id === 'bazel'),
      false,
      'the shipped registry did not change: the detector iterates what it is given rather than branching on known ids',
    );
  } finally {
    target.dispose();
  }
});

test('UT-C002-inv every declared command shape is bounded and names an allow-listed executable', () => {
  const shapes = START_PLAN_ECOSYSTEMS.flatMap((row) => [
    row.commandShape,
    ...(row.shapeSelectors ?? []).map((selector) => selector.commandShape),
  ]);
  assert.ok(shapes.length > 0);

  for (const shape of shapes) {
    assert.ok(
      START_PLAN_EXECUTABLES.includes(shape.command),
      `${shape.command} is not in the declared executable allow-list`,
    );
    for (const verb of START_PLAN_NETWORK_VERBS) {
      assert.equal(
        shape.args.includes(verb),
        false,
        `a declared shape cannot introduce a fetch by being added to the table: ${verb}`,
      );
    }
  }
});

test('UT-C002-err an unmatched subject names every ecosystem searched rather than an empty plan', () => {
  const target = createSyntheticTree({ 'notes.txt': 'nothing buildable here\n' }, { prefix: 'wsp-p23-5-unmatched-' });
  try {
    const result = detectStartPlan(target.root);
    assert.equal(result.plan, null);
    assert.equal(result.searchedEcosystems.length, START_PLAN_ECOSYSTEMS.length);
    for (const row of START_PLAN_ECOSYSTEMS) {
      assert.ok(result.reason.includes(row.id), `the refusal names ${row.id}`);
    }
    assert.ok(result.reason.length > 0, 'an unstartable subject is reported, never rendered as an empty plan');
  } finally {
    target.dispose();
  }
});

test('UT-C002-bound two manifests of one ecosystem yield the shallower, and say so', () => {
  const target = createSyntheticTree(
    { 'package.json': '{"name":"outer"}', 'nested/package.json': '{"name":"inner"}' },
    { prefix: 'wsp-p23-5-depth-' },
  );
  try {
    const { plan } = detectStartPlan(target.root);
    assert.equal(plan.kind, 'node');
    assert.equal(plan.manifest, 'package.json');
    assert.equal(plan.matchedFrom, 'package.json');
    assert.deepEqual(plan.alsoMatched, ['nested/package.json'], 'the choice is stated rather than silently taken');
  } finally {
    target.dispose();
  }
});

// ---------------------------------------------------------------------------
// C003 — the database kinds are discovered, and detection only reads
// ---------------------------------------------------------------------------

test('UT-C003-post a manifest naming sqlite reports the kind and the artefact it was read from', () => {
  const target = createSyntheticTree({ 'Cargo.toml': SQLITE_CARGO_MANIFEST }, { prefix: 'wsp-p23-5-db-' });
  try {
    const result = discoverDatabaseKinds(target.root);
    assert.equal(result.found, true);
    assert.deepEqual(result.kinds, [{ id: 'sqlite', readFrom: 'Cargo.toml', marker: 'rusqlite' }]);
  } finally {
    target.dispose();
  }
});

test('UT-C003-bound a subject carrying no indicator says so and names what was searched', () => {
  const target = createSyntheticTree(NON_SIPRS_TARGET, { prefix: 'wsp-p23-5-nodb-' });
  try {
    const result = discoverDatabaseKinds(target.root);
    assert.deepEqual(result.kinds, []);
    assert.equal(result.found, false);
    assert.equal(
      result.searched.length,
      DATABASE_INDICATORS.length,
      '"none found" never renders as "not looked for"',
    );
    for (const indicator of DATABASE_INDICATORS) {
      assert.ok(result.reason.includes(indicator.id), `the answer names the indicator ${indicator.id}`);
    }
  } finally {
    target.dispose();
  }
});

test('UT-C003-inv detection starts no process and opens no socket, asserted with throwing stubs', () => {
  const target = createSyntheticTree({ 'Cargo.toml': SQLITE_CARGO_MANIFEST }, { prefix: 'wsp-p23-5-stub-' });
  try {
    const child = runDetectionWithThrowingStubs(target.root);
    assert.equal(child.status, 0, `detection must not touch a forbidden module: ${child.stderr}`);
    const detected = JSON.parse(child.stdout);
    assert.equal(detected.planKind, 'cargo', 'the plan was produced without starting anything');
    assert.deepEqual(detected.kinds, [{ id: 'sqlite', readFrom: 'Cargo.toml', marker: 'rusqlite' }]);
  } finally {
    target.dispose();
  }
});

test('UT-C003-inv detection leaves the subject byte-identical', () => {
  const target = createSyntheticTree(NON_SIPRS_TARGET, { prefix: 'wsp-p23-5-readonly-' });
  try {
    const before = digestTree(target.root);
    discoverDatabaseKinds(target.root);
    detectStartPlan(target.root);
    assert.deepEqual(digestTree(target.root), before, 'the subject tree is byte-identical afterwards');
  } finally {
    target.dispose();
  }
});

/**
 * Twenty configuration artefact sets the detection has never seen.
 *
 * Generated rather than listed, so the population is visibly open: each set
 * combines a declared ecosystem with a declared indicator by index, so no set is
 * hand-picked to be convenient and the twentieth is not a variation of the first.
 * The generation is deterministic — a property that held only on a random draw
 * would not be reproducible, and a Red that cannot be reproduced is not evidence.
 */
// [::TICKET::] P23-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-5 --for-spec --no-implementation-order`.
function generatedArtefactSets(count) {
  const sets = [];
  for (let index = 0; index < count; index += 1) {
    const ecosystem = START_PLAN_ECOSYSTEMS[index % START_PLAN_ECOSYSTEMS.length];
    const indicator = DATABASE_INDICATORS[index % DATABASE_INDICATORS.length];
    const marker = indicator.markers[index % indicator.markers.length];
    const manifest = ecosystem.manifestNames[0];

    const files = { 'README.md': `generated subject ${index}\n` };
    if (index % 2 === 0) files[manifest] = `# declared by ${ecosystem.id}\n`;
    if (index % 3 === 0) files[`nested/${manifest}`] = '# a second declaration at a different depth\n';
    if (index % 5 === 0) files[indicator.manifestNames[0]] = `dependencies:\n  ${marker}\n`;
    sets.push({ files, ecosystemId: ecosystem.id, marker });
  }
  return sets;
}

test('UT-C003-inv over twenty generated artefact sets, detection leaves each subject byte-identical', () => {
  const sets = generatedArtefactSets(20);
  assert.equal(sets.length, 20);

  const detected = [];
  for (const [index, generated] of sets.entries()) {
    const target = createSyntheticTree(generated.files, { prefix: `wsp-p23-5-prop-${index}-` });
    try {
      const before = digestTree(target.root);
      const startPlan = detectStartPlan(target.root);
      const databaseKinds = discoverDatabaseKinds(target.root);
      assert.deepEqual(
        digestTree(target.root),
        before,
        `generated set ${index} (${generated.ecosystemId}) must be byte-identical after detection`,
      );
      detected.push({ ecosystemId: generated.ecosystemId, hasPlan: startPlan.plan !== null, hasDatabaseKind: databaseKinds.found });
    } finally {
      target.dispose();
    }
  }

  // A byte-identical claim over sets that detected nothing is vacuous: it would
  // hold just as well if detection returned early for every subject. The
  // population has to be one the detection actually answered.
  assert.ok(
    detected.some((entry) => entry.hasPlan),
    'at least one generated subject must be startable, or the claim is about an empty population',
  );
  assert.ok(
    detected.some((entry) => entry.hasDatabaseKind),
    'at least one generated subject must name a database, or the claim is about an empty population',
  );
});

// ---------------------------------------------------------------------------
// IT — the generalised sandbox over a subject that is not the experiment
// ---------------------------------------------------------------------------

test('IT-1 a non-siprs subject completes create, transition, reset and dispose, unchanged', () => {
  const target = createSyntheticTree(NON_SIPRS_TARGET, { prefix: 'wsp-p23-5-cycle-' });
  const scratch = createSyntheticTree({}, { prefix: 'wsp-p23-5-cycle-scratch-' });
  const before = hashTree(target.root);
  const handle = createSandbox(target.root, { scratchRoot: scratch.root, guardedPaths: [] });
  try {
    runTransition(handle, {
      name: 'write-inside-only',
      command: process.execPath,
      args: ['--eval', 'require("node:fs").writeFileSync("inside.txt", "inside only\\n")'],
      destructive: true,
    });
    assert.equal(existsSync(join(handle.sandboxRoot, 'inside.txt')), true, 'the transition really did write');

    const reset = resetSandbox(handle);
    assert.equal(reset.restored, true);
    assert.equal(existsSync(join(handle.sandboxRoot, 'inside.txt')), false);
    assert.equal(assertSubjectUntouched(handle).untouched, true);
    assert.deepEqual(hashTree(target.root), before, 'the generalisation works outside the experiment');
  } finally {
    disposeSandbox(handle);
    target.dispose();
    scratch.dispose();
  }
});

test('IT-2 the plan and the database report agree with the artefact walk the analysis uses', () => {
  const target = createSyntheticTree(
    { 'Cargo.toml': SQLITE_CARGO_MANIFEST, 'src/lib.rs': 'pub fn ping() {}\n' },
    { prefix: 'wsp-p23-5-agree-' },
  );
  try {
    const artefacts = listArtefacts(target.root).map((artefact) => artefact.path);
    const { plan } = detectStartPlan(target.root);
    assert.ok(artefacts.includes(plan.manifest), 'the manifest the plan matched is in the same enumeration R0 reads');
    for (const kind of discoverDatabaseKinds(target.root).kinds) {
      assert.ok(artefacts.includes(kind.readFrom), 'the artefact a kind was read from is in the same enumeration');
    }
  } finally {
    target.dispose();
  }
});
