// [::TICKET::] P22-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-1 --for-spec --no-implementation-order`.
/**
 * The forward-rotation regression gate.
 *
 * "Never break the forward rotation" has been asserted since the reverse
 * rotation was designed, and never executable, because no golden manifest was
 * ever saved and the allocate side had no fixtures at all. This module makes
 * the assertion executable: it freezes what the forward rotation produces
 * today and reproduces those values later.
 *
 * Two kinds of value are frozen, because either alone would be blind:
 *
 *   - every fixture's own bytes, so an edit to an input is caught by name;
 *   - every COMPLETE pipeline run's normalised manifest digest, so a change to
 *     the forward implementation that alters its output is caught even though
 *     no fixture moved.
 *
 * The manifest digest is normalised because the raw `manifest_hash` is not
 * reproducible: `assembleManifest` hashes the whole manifest, and the forward
 * runner stamps `run.generated_at`, `run.run_id` and `run.generator` into it on
 * every invocation. Normalising those away is what makes a frozen baseline
 * mean anything at all.
 *
 * Nothing here writes to a fixture, a command file or a spec. Pipeline runs are
 * executed against a copy in a temporary directory and the copy is removed.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalSerialize } from '../../workspacify-tree/lib/canonical-json.mjs';
import { COMMAND_FILE_NAMES, COMMANDS_RELATIVE_DIR, compareDigests, digestCommandFiles } from './command-file-digest.mjs';
// [::TICKET::] PX-207 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-207 --for-spec --no-implementation-order`.
import { FORWARD_SURFACES_KEY, captureForwardSurfaces, checkForwardSurfaces } from './forward-surface-baseline.mjs';

// Callers of the gate need the command-file vocabulary too; re-exporting it here
// keeps one import site for everything the regression predicate depends on.
export { COMMAND_FILE_NAMES, COMMANDS_RELATIVE_DIR };

/** The repository this gate belongs to: `.claude/scripts/workspacify-reverse/lib` walked back to the root. */
export const MODULE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

export const TREE_FIXTURES_RELATIVE_DIR = 'tests/workspacify-tree/fixtures';
export const ALLOCATE_FIXTURES_RELATIVE_DIR = 'tests/workspacify-allocate/fixtures';
export const BASELINE_RELATIVE_PATH = 'tests/workspacify-tree/baselines/manifest-hashes.json';

const TREE_RUN_SCRIPT_RELATIVE_PATH = '.claude/scripts/workspacify-tree/run.mjs';
const ALLOCATE_RUN_SCRIPT_RELATIVE_PATH = '.claude/scripts/workspacify-allocate/run.mjs';
const TREE_MANIFEST_FILE_NAME = 'WORKSPACIFY-TREE-MANIFEST.json';
const ALLOCATE_MANIFEST_FILE_NAME = 'WORKSPACIFY-ALLOCATE-MANIFEST.json';

/**
 * Manifest fields that describe how a tool was invoked rather than what it
 * produced. They differ on every run, so freezing them would make the gate
 * fail on every run and destroy its authority.
 */
const VOLATILE_RUN_FIELDS = ['generated_at', 'run_id', 'generator'];

/**
 * The three (spec, decisions) pairs that reach COMPLETE, measured on
 * 2026-09-10. Exactly three of the sixty possible combinations pass every
 * gate; the rest fail deterministically and so produce no manifest to freeze.
 */
export const TREE_PIPELINE_PAIRS = [
  { spec: 'long-spec.md', decisions: 'decisions-long-ok.json' },
  { spec: 'gaia-like-spec.md', decisions: 'gaia-decisions.json' },
  { spec: 'objects-table.md', decisions: 'decisions-complete.json' },
];

/** The allocate-side fixtures, which did not exist before this ticket. */
export const ALLOCATE_FIXTURES = [
  { id: 'sample-tree', spec: 'spec.md', manifest: TREE_MANIFEST_FILE_NAME, decisions: 'decisions.json' },
];

export function pairBaselineKey(pair) {
  return `pair:${pair.spec}+${pair.decisions}`;
}

export function allocateBaselineKey(fixture) {
  return `allocate:${fixture.id}`;
}

// Exported so staleness propagation hashes an input exactly as this gate does.
// Two mechanisms that hash the same file two ways can disagree about whether it
// changed, and the disagreement would surface as a claim that is silently stale.
// [::TICKET::] P22-21 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-21 --for-spec --no-implementation-order`.
export function sha256Hex(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * A digest that survives being computed twice.
 *
 * Volatile run provenance and the self-referential hash field are removed
 * before canonical serialisation. Everything else — including non-volatile
 * `run` fields such as the allocate manifest's planned directory count — is
 * kept, because it is output rather than provenance.
 *
 * @param {object} manifest
 * @returns {string} lowercase hex digest
 */
export function stableManifestDigest(manifest) {
  const run = { ...(manifest.run ?? {}) };
  for (const field of VOLATILE_RUN_FIELDS) {
    delete run[field];
  }
  const normalised = {
    ...manifest,
    run,
    integrity: { ...(manifest.integrity ?? {}), manifest_hash: '' },
  };
  return sha256Hex(Buffer.from(canonicalSerialize(normalised), 'utf8'));
}

/** Every file beneath a directory, depth first and name-sorted, as absolute paths. */
// [::TICKET::] PX-207 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-207 --for-spec --no-implementation-order`.
function listFilesRecursively(dir) {
  if (!existsSync(dir)) {
    return [];
  }
  const files = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      files.push(...listFilesRecursively(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

/**
 * Digest every fixture. Tree fixtures keep their bare relative path; allocate
 * fixtures are namespaced so the two roots cannot collide.
 *
 * @param {string} projectRoot
 * @returns {Record<string, string>} baseline key → SHA-256, sorted by key
 */
export function readFixtureDigests(projectRoot) {
  const digests = {};
  const treeRoot = join(projectRoot, TREE_FIXTURES_RELATIVE_DIR);
  for (const full of listFilesRecursively(treeRoot)) {
    digests[relative(treeRoot, full)] = sha256Hex(readFileSync(full));
  }
  const allocateRoot = join(projectRoot, ALLOCATE_FIXTURES_RELATIVE_DIR);
  for (const full of listFilesRecursively(allocateRoot)) {
    digests[join('allocate', relative(allocateRoot, full))] = sha256Hex(readFileSync(full));
  }
  return sortKeys(digests);
}

function sortKeys(record) {
  const sorted = {};
  for (const key of Object.keys(record).sort()) {
    sorted[key] = record[key];
  }
  return sorted;
}

/**
 * Run one forward pipeline pair against a copy and return its normalised
 * manifest digest. The copy is what makes this read-only.
 *
 * @param {object} params
 * @param {{spec: string, decisions: string}} params.pair
 * @param {string} params.projectRoot - project supplying the fixtures
 * @returns {string} normalised manifest digest
 */
export function runTreePair({ pair, projectRoot }) {
  const fixtureRoot = join(projectRoot, TREE_FIXTURES_RELATIVE_DIR);
  const workDir = mkdtempSync(join(tmpdir(), 'p22-1-tree-pair-'));
  try {
    const specPath = join(workDir, pair.spec);
    const decisionsPath = join(workDir, pair.decisions);
    cpSync(join(fixtureRoot, pair.spec), specPath);
    cpSync(join(fixtureRoot, pair.decisions), decisionsPath);

    const result = spawnSync(
      process.execPath,
      [join(MODULE_ROOT, TREE_RUN_SCRIPT_RELATIVE_PATH), 'finalize', `--spec=${specPath}`, `--decisions=${decisionsPath}`],
      { cwd: workDir, encoding: 'utf8' },
    );
    const manifestPath = join(workDir, TREE_MANIFEST_FILE_NAME);
    if (result.status !== 0 || !existsSync(manifestPath)) {
      throw new Error(
        `the forward pipeline did not publish a manifest for ${pairBaselineKey(pair)} (exit ${result.status}): ${(result.stdout ?? '').trim()}`,
      );
    }
    return stableManifestDigest(JSON.parse(readFileSync(manifestPath, 'utf8')));
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

/**
 * Run one allocate fixture against a copy and return its normalised manifest
 * digest.
 *
 * @param {object} params
 * @param {{id: string, manifest: string, decisions: string}} params.fixture
 * @param {string} params.projectRoot
 * @returns {string} normalised manifest digest
 */
export function runAllocateFixture({ fixture, projectRoot }) {
  const fixtureDir = join(projectRoot, ALLOCATE_FIXTURES_RELATIVE_DIR, fixture.id);
  const workDir = mkdtempSync(join(tmpdir(), 'p22-1-allocate-'));
  try {
    cpSync(fixtureDir, workDir, { recursive: true });

    const result = spawnSync(
      process.execPath,
      [
        join(MODULE_ROOT, ALLOCATE_RUN_SCRIPT_RELATIVE_PATH),
        'finalize',
        join(workDir, fixture.manifest),
        `--decisions=${join(workDir, fixture.decisions)}`,
      ],
      { cwd: workDir, encoding: 'utf8' },
    );
    const manifestPath = join(workDir, ALLOCATE_MANIFEST_FILE_NAME);
    if (result.status !== 0 || !existsSync(manifestPath)) {
      throw new Error(
        `the allocate pipeline did not publish a manifest for ${allocateBaselineKey(fixture)} (exit ${result.status}): ${(result.stdout ?? '').trim()}`,
      );
    }
    return stableManifestDigest(JSON.parse(readFileSync(manifestPath, 'utf8')));
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

/**
 * Freeze the forward rotation as it behaves now.
 *
 * This must run before any P22 change: a baseline taken afterwards cannot
 * distinguish a pre-existing value from a regression.
 *
 * @param {object} [params]
 * @param {string} [params.projectRoot] - project to measure (defaults to this gate's own)
 * @param {Array} [params.pipelinePairs] - tree pairs to run
 * @param {Array} [params.allocateFixtures] - allocate fixtures to run
 * @returns {object} the baseline that was written
 */
export function captureBaselines({
  projectRoot = MODULE_ROOT,
  pipelinePairs = TREE_PIPELINE_PAIRS,
  allocateFixtures = ALLOCATE_FIXTURES,
} = {}) {
  const manifestHashes = { ...readFixtureDigests(projectRoot) };
  const fixtures = Object.keys(manifestHashes).sort();

  for (const pair of pipelinePairs) {
    manifestHashes[pairBaselineKey(pair)] = runTreePair({ pair, projectRoot });
  }
  for (const fixture of allocateFixtures) {
    manifestHashes[allocateBaselineKey(fixture)] = runAllocateFixture({ fixture, projectRoot });
  }

  const baseline = {
    fixtures,
    manifestHashes: sortKeys(manifestHashes),
    commandFileDigests: sortKeys(digestCommandFiles(projectRoot)),
    // The forward surfaces P22 modified are captured by delegation, under a key of
    // their own. The three above are written exactly as they were: re-capturing
    // them would erase the evidence that the surfaces P22-1 froze are still intact.
    // [::TICKET::] PX-207 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-207 --for-spec --no-implementation-order`.
    [FORWARD_SURFACES_KEY]: captureForwardSurfaces({ projectRoot }),
  };

  const baselinePath = join(projectRoot, BASELINE_RELATIVE_PATH);
  mkdirSync(dirname(baselinePath), { recursive: true });
  writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
  return baseline;
}

/**
 * Reproduce the frozen values and report every disagreement by name.
 *
 * The verdict is `proved` or `not proved`. It is never a judgement about
 * whether reverse engineering worked: classifying a disagreement is a human's
 * work, and a machine that emits a boolean success verdict is wrong by
 * construction.
 *
 * @param {object} [params]
 * @returns {{verdict: 'proved'|'not proved', driftedNames: string[], pairFindings: Array, commandFileFindings: Array, nothingToCheck: boolean, fixtureCount: number}}
 */
export function checkBaselines({
  projectRoot = MODULE_ROOT,
  pipelinePairs = TREE_PIPELINE_PAIRS,
  allocateFixtures = ALLOCATE_FIXTURES,
} = {}) {
  const baselinePath = join(projectRoot, BASELINE_RELATIVE_PATH);
  if (!existsSync(baselinePath)) {
    throw new Error(`no baseline is frozen at ${BASELINE_RELATIVE_PATH} — run "regression capture" first`);
  }
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));

  const driftedNames = [];
  const fixtureFindings = [];
  const observedFixtures = readFixtureDigests(projectRoot);
  for (const [key, expected] of Object.entries(baseline.manifestHashes)) {
    if (key.startsWith('pair:') || key.startsWith('allocate:')) {
      continue;
    }
    if (observedFixtures[key] !== expected) {
      driftedNames.push(key);
      fixtureFindings.push({ key, expected, observed: observedFixtures[key] ?? '(absent)' });
    }
  }
  for (const key of Object.keys(observedFixtures)) {
    if (!(key in baseline.manifestHashes)) {
      driftedNames.push(key);
      fixtureFindings.push({ key, expected: '(not in the baseline)', observed: observedFixtures[key] });
    }
  }

  // A pipeline that now refuses to publish is a disagreement, not an exception:
  // the gate's vocabulary is proved / not proved, and one broken pair must not
  // stop the remaining pairs and fixtures from being compared.
  const observePair = (run) => {
    try {
      return run();
    } catch (error) {
      return `unavailable: ${error.message}`;
    }
  };

  const pairFindings = [];
  for (const pair of pipelinePairs) {
    const key = pairBaselineKey(pair);
    if (!(key in baseline.manifestHashes)) {
      continue;
    }
    const observed = observePair(() => runTreePair({ pair, projectRoot }));
    if (observed !== baseline.manifestHashes[key]) {
      pairFindings.push({ key, expected: baseline.manifestHashes[key], observed });
    }
  }
  for (const fixture of allocateFixtures) {
    const key = allocateBaselineKey(fixture);
    if (!(key in baseline.manifestHashes)) {
      continue;
    }
    const observed = observePair(() => runAllocateFixture({ fixture, projectRoot }));
    if (observed !== baseline.manifestHashes[key]) {
      pairFindings.push({ key, expected: baseline.manifestHashes[key], observed });
    }
  }

  const commandFileFindings = compareDigests(baseline.commandFileDigests ?? {}, digestCommandFiles(projectRoot));

  // The forward surfaces are checked by delegation and folded into the same
  // verdict. A drifted header and a drifted manifest are the same kind of
  // observation; only the report separates them.
  // [::TICKET::] PX-207 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-207 --for-spec --no-implementation-order`.
  // A tree that carries none of this section's fixtures has nothing to compare,
  // which is P22-1's own `nothingToCheck` state rather than a disagreement. The
  // distinction is stated rather than assumed: the report names every surface it
  // could not produce, and the test that runs against this repository asserts all
  // five are available, so a fixture set that vanished from the real tree fails
  // there rather than passing quietly here.
  // [::TICKET::] PX-207 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-207 --for-spec --no-implementation-order`.
  const forwardFindings =
    baseline[FORWARD_SURFACES_KEY] === undefined
      ? { proved: true, verdict: 'proved', drifted: [], unavailable: [], evaluated: false }
      : (() => {
          const findings = checkForwardSurfaces({ baseline, projectRoot });
          const frozen = baseline[FORWARD_SURFACES_KEY].length;
          const evaluated = findings.unavailable.length < frozen;
          return { ...findings, evaluated };
        })();

  const proved =
    driftedNames.length === 0 &&
    pairFindings.length === 0 &&
    commandFileFindings.length === 0 &&
    (forwardFindings.proved || forwardFindings.evaluated === false);
  const fixtureCount = Object.keys(observedFixtures).length;

  return {
    verdict: proved ? 'proved' : 'not proved',
    driftedNames: [...new Set(driftedNames)].sort(),
    fixtureFindings,
    pairFindings,
    commandFileFindings,
    forwardFindings,
    nothingToCheck: fixtureCount === 0 && pairFindings.length === 0,
    fixtureCount,
  };
}

/** Render a check result as the Markdown a human reads. */
export function renderCheckReport(result) {
  if (result.nothingToCheck) {
    return [
      '## Forward-rotation regression gate',
      '',
      '**Nothing to check.** No fixture is present under either fixture root, so there is no forward-rotation behaviour to compare against a baseline.',
      '',
    ].join('\n');
  }

  const lines = [
    '## Forward-rotation regression gate',
    '',
    `**${result.verdict}** — ${result.fixtureCount} fixture(s) compared, ${result.pairFindings.length} pipeline run(s) disagreed, ${result.commandFileFindings.length} command-file loss(es), ${result.forwardFindings?.drifted.length ?? 0} forward-surface disagreement(s).`,
    '',
  ];

  // Reported before the verdict branches, because the declared-baseline case
  // returns early and a frozen value nobody lists is one a reader cannot audit.
  // [::TICKET::] PX-207 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-207 --for-spec --no-implementation-order`.
  if (result.forwardFindings !== undefined) {
    lines.push('### Forward surfaces', '');
    for (const drift of result.forwardFindings.drifted) {
      lines.push(
        `- **${drift.surface}** drifted: expected ${canonicalSerialize(drift.expected).slice(0, 120)}, observed ${canonicalSerialize(drift.observed).slice(0, 120)}`,
      );
    }
    for (const entry of result.forwardFindings.unavailable) lines.push(`- unavailable: ${entry}`);
    if (result.forwardFindings.drifted.length === 0 && result.forwardFindings.unavailable.length === 0) {
      lines.push('Every forward surface was reproduced.');
    }
    lines.push('');
  }

  if (result.verdict === 'proved') {
    lines.push('Every frozen value was reproduced. No forward-rotation behaviour has changed.');
    lines.push('');
    return lines.join('\n');
  }

  if (result.fixtureFindings.length > 0) {
    lines.push('### Fixtures whose bytes changed', '');
    for (const finding of result.fixtureFindings) {
      lines.push(`- \`${finding.key}\``);
      lines.push(`  - expected \`${finding.expected}\``);
      lines.push(`  - observed \`${finding.observed}\``);
    }
    lines.push('');
  }

  if (result.pairFindings.length > 0) {
    lines.push('### Pipeline runs whose manifest digest changed', '');
    for (const finding of result.pairFindings) {
      lines.push(`- \`${finding.key}\``);
      lines.push(`  - expected \`${finding.expected}\``);
      lines.push(`  - observed \`${finding.observed}\``);
    }
    lines.push('');
  }

  if (result.commandFileFindings.length > 0) {
    lines.push('### Command files that lost a protected section', '');
    for (const finding of result.commandFileFindings) {
      lines.push(`- \`${finding.file}\` — ${finding.detail}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/** Render a capture result as the Markdown a human reads. */
export function renderCaptureReport(baseline) {
  const pairKeys = Object.keys(baseline.manifestHashes).filter((key) => key.startsWith('pair:'));
  const allocateKeys = Object.keys(baseline.manifestHashes).filter((key) => key.startsWith('allocate:'));
  const fixtureCount = baseline.fixtures.length;

  if (fixtureCount === 0 && pairKeys.length === 0 && allocateKeys.length === 0) {
    return ['## Forward-rotation regression gate', '', '**Nothing to capture.** No fixture is present under either fixture root.', ''].join('\n');
  }

  return [
    '## Forward-rotation regression gate',
    '',
    `Baseline written to \`${BASELINE_RELATIVE_PATH}\`.`,
    '',
    `- ${fixtureCount} fixture(s) frozen by content digest`,
    `- ${pairKeys.length} forward pipeline run(s) frozen by normalised manifest digest`,
    `- ${allocateKeys.length} allocate fixture(s) frozen by normalised manifest digest`,
    `- ${Object.keys(baseline.commandFileDigests).length} of ${COMMAND_FILE_NAMES.length} command files digested`,
    '',
  ].join('\n');
}
