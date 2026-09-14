/**
 * forward-surface-baseline — a frozen value for every forward surface P22 modified.
 *
 * P22-1 built the regression gate over the workspacify surfaces. The changes P22
 * then made to `rfc-graph` and to `tickets` sit outside it and rest on unit tests
 * alone, and the difference matters: a unit test asserts what its author thought
 * of, while a frozen value asserts that nothing moved — including moves the author
 * did not think of. `generateHeaderComment`'s signature went from seven arguments
 * to five and the header bytes changed with it; `dump-node-context-to-spec.js`
 * carried a defect in which every node id collapsed to the string `[object Object]`
 * and it survived because nothing compared the map against a known-good result.
 *
 * Three rules shape this module, and each was learned from P22-1's own experience:
 *
 *   - A value is frozen only after proving it reproduces. P22-1 found that
 *     `manifest_hash` differed on every run because `assembleManifest` hashes
 *     `run.generated_at`, `run.run_id` and `run.generator`. A surface whose two
 *     captures disagree is therefore recorded as `non-deterministic` with both
 *     observations, never frozen to whichever value came last.
 *   - A surface that cannot be produced is reported as unavailable, distinctly from
 *     drift. A broken instrument and a moved subject call for different responses,
 *     and an unavailable prerequisite reported as drift makes the check cry wolf.
 *   - The existing three baseline keys are left byte-identical. Re-capturing them
 *     would erase the evidence that the surfaces P22-1 froze are still intact.
 *
 * This module lives in the reverse tree because it is a reverse-rotation
 * instrument. It reads forward trees, which is the direction the layer rule permits.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalSerialize } from '../../workspacify-tree/lib/canonical-json.mjs';

const require$cjs = createRequire(import.meta.url);

/** Where this module's own project root is, for the default case. */
export const MODULE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

/** The baseline every later ticket reads. */
export const BASELINE_RELATIVE_PATH = 'tests/workspacify-tree/baselines/manifest-hashes.json';

/** The key the forward surfaces are published under. Nothing existing is touched. */
export const FORWARD_SURFACES_KEY = 'forwardSurfaces';

/** The fixtures this baseline's values are produced from. */
export const FORWARD_SURFACE_FIXTURES = 'tests/rfc-graph/fixtures/forward-surfaces';

/** Recorded for a value that did not reproduce, so it is never mistaken for frozen. */
export const NON_DETERMINISTIC_KIND = 'non-deterministic';

/** The one field the checklist normalisation removes, named so a reader can see it. */
export const CHECKLIST_TIMESTAMP_FIELD = 'timestamp';

/** The replacement the normalisation substitutes, so two runs compare equal. */
export const CHECKLIST_TIMESTAMP_PLACEHOLDER = '<generated-at>';

/** The forward trees whose diff defines the population the gate must cover. */
const FORWARD_TREE_PREFIXES = Object.freeze([
  '.claude/scripts/rfc-graph/',
  '.claude/scripts/tickets/',
  '.claude/scripts/drill-rfc-down/',
  '.claude/scripts/grill-me-for-rfc/',
  '.claude/scripts/lib/',
  '.claude/scripts/conver/',
  '.claude/scripts/workspacify-tree/',
  '.claude/scripts/workspacify-allocate/',
]);

/** Files created by the reverse rotation, which the layer rule permits to exist. */
const REVERSE_ONLY_FILE_PATTERN = /(reverse-mode|structure-parity|architecture-delta|return-refs|reverse-split|test-mapping|normative-decision|reverse-questions|grounding-check|contract-diff|reverse-boundify)/;

/**
 * The frozen surfaces, each naming how its value is obtained and what it covers.
 *
 * `covers` is the claim that this surface is what would notice a change to those
 * files. It is declared here rather than derived, because "which value would move
 * if this file moved" is a judgement, and the test asserts the claim is honoured.
 */
export const FORWARD_SURFACES = Object.freeze([
  {
    name: 'header-output',
    kind: 'pure-output',
    inputPath: `${FORWARD_SURFACE_FIXTURES}/header-input.json`,
    covers: ['.claude/scripts/rfc-graph/boundify-helpers.js'],
    producer: ({ projectRoot, input }) => freezeHeaderOutput({ projectRoot, input }),
  },
  {
    name: 'node-id-path-map',
    kind: 'pure-map',
    inputPath: `${FORWARD_SURFACE_FIXTURES}/dirs-tree.json`,
    covers: ['.claude/scripts/rfc-graph/dump-node-context-to-spec.js'],
    producer: ({ projectRoot, input }) => freezeNodeIdPathMap({ projectRoot, dirsTree: input }),
  },
  {
    name: 'ticket-guard',
    kind: 'pure-decision',
    covers: ['.claude/scripts/tickets/update-ticket.js'],
    producer: ({ projectRoot }) => freezeTicketGuard({ projectRoot }),
  },
  {
    name: 'marker-rewrite',
    kind: 'fixture-verdict',
    inputPath: `${FORWARD_SURFACE_FIXTURES}/marker-rewrite`,
    covers: ['.claude/scripts/rfc-graph/phasify-omissions.js'],
    producer: ({ projectRoot, input }) => ({
      conforming: freezeMarkerRewrite({ projectRoot, fixture: input }),
      violating: freezeMarkerRewriteViolation({ projectRoot, fixture: input }),
    }),
  },
  {
    name: 'checklist-output',
    kind: 'cli-stdout-normalised',
    inputPath: `${FORWARD_SURFACE_FIXTURES}/checklist-graph.json`,
    covers: ['.claude/scripts/grill-me-for-rfc/generate-checklist.js'],
    normalisation: `the generation ${CHECKLIST_TIMESTAMP_FIELD} is replaced with ${CHECKLIST_TIMESTAMP_PLACEHOLDER}`,
    producer: ({ projectRoot, input }) => freezeChecklistOutput({ projectRoot, graph: input }),
  },
]);

/**
 * The header a fixed five-argument input produces.
 *
 * `generateHeaderComment` is pure and performs no I/O, and its output carries the
 * `Initial Design Artifact` marker that supreme law 4 forbids altering. That makes
 * it the highest-value frozen value in this ticket: the bytes every generated file
 * begins with are the ones no test previously compared against anything.
 *
 * @param {{ projectRoot: string, input?: object }} args
 * @returns {string}
 */
export function freezeHeaderOutput({ projectRoot, input = readFixtureJson(projectRoot, 'header-input.json') }) {
  const { generateHeaderComment } = require$cjs(join(projectRoot, '.claude/scripts/rfc-graph/boundify-helpers.js'));
  return generateHeaderComment(
    input.headerPaths,
    input.mappedNodeIds,
    input.crossRefs ?? [],
    input.sourceBasename,
    input.lang,
  );
}

/**
 * The node-id-to-path map a fixed Dirs-Tree produces.
 *
 * The fixture carries both entry shapes the repository emits — `{ nodeId, title }`
 * objects and bare id strings — because reading only one of them is the defect
 * P22-14 repaired: every id collapsed onto a single `[object Object]` key and every
 * node appeared to declare no path.
 *
 * @param {{ projectRoot: string, dirsTree?: object }} args
 * @returns {Record<string, string>}
 */
export function freezeNodeIdPathMap({ projectRoot, dirsTree = readFixtureJson(projectRoot, 'dirs-tree.json') }) {
  const { buildNodeIdToPathMap } = require$cjs(join(projectRoot, '.claude/scripts/rfc-graph/dump-node-context-to-spec.js'));
  return buildNodeIdToPathMap(dirsTree);
}

/**
 * The guard's decision for each of its four cases.
 *
 * @param {{ projectRoot: string }} args
 * @returns {Array<{ case: string, leaked: string[]|null }>}
 */
export function freezeTicketGuard({ projectRoot }) {
  const { firstReverseFieldOnForwardTicket } = require$cjs(join(projectRoot, '.claude/scripts/tickets/update-ticket.js'));
  const reverseTicket = { origin_kind: 'reverse' };
  const forwardTicket = {};

  return [
    { case: 'no reverse field', leaked: firstReverseFieldOnForwardTicket(forwardTicket, { status: 'done' }) },
    { case: 'reverse field, reverse origin', leaked: firstReverseFieldOnForwardTicket(reverseTicket, { driving_claim_ids: ['clm-1'] }) },
    { case: 'reverse field, forward origin', leaked: firstReverseFieldOnForwardTicket(forwardTicket, { driving_claim_ids: ['clm-1'] }) },
    { case: 'empty update', leaked: firstReverseFieldOnForwardTicket(forwardTicket, {}) },
  ];
}

/**
 * The marker-rewrite check's verdict over a fixture tree.
 *
 * @param {{ projectRoot: string, fixture?: string }} args
 * @returns {{ ok: boolean, failures: string[] }}
 */
export function freezeMarkerRewrite({ projectRoot, fixture = join(FORWARD_SURFACE_FIXTURES, 'marker-rewrite') }) {
  const { verifyMarkerRewrites } = require$cjs(join(projectRoot, '.claude/scripts/rfc-graph/phasify-omissions.js'));
  const stubPath = join(projectRoot, fixture, 'PX-1-sample.js');

  // The stub's line is found rather than asserted as a literal. It moved once
  // already, when a provenance annotation was injected above it, and a surface
  // that then read the annotation instead of the stub would report `ok` for a
  // reason that had nothing to do with the check it claims to be freezing.
  const stubLine = readFileSync(stubPath, 'utf8')
    .split('\n')
    .findIndex((line) => line.includes('[::STUB::]'));
  if (stubLine < 0) {
    throw new Error(`the marker-rewrite fixture carries no [::STUB::] line to check: ${fixture}/PX-1-sample.js`);
  }

  return verifyMarkerRewrites({
    phases: [
      {
        tickets: [
          {
            phaseId: 1,
            id: 1,
            stubs: [{ file: stubPath, line: stubLine + 1, content: 'PX-1: the sample stub the rewrite check reads' }],
          },
        ],
      },
    ],
  });
}

/**
 * The same check against a stub that still carries its old key, so the surface is
 * known to be able to fail.
 *
 * Without this, freezing `{ ok: true, failures: [] }` would be indistinguishable
 * from freezing a check that had stopped looking — the failure mode the whole
 * surface exists to catch.
 *
 * @param {{ projectRoot: string, fixture?: string }} args
 * @returns {{ ok: boolean, failures: string[] }}
 */
export function freezeMarkerRewriteViolation({ projectRoot, fixture = join(FORWARD_SURFACE_FIXTURES, 'marker-rewrite') }) {
  const { verifyMarkerRewrites } = require$cjs(join(projectRoot, '.claude/scripts/rfc-graph/phasify-omissions.js'));
  const stubPath = join(projectRoot, fixture, 'PX-1-sample.js');
  const stubLine = readFileSync(stubPath, 'utf8')
    .split('\n')
    .findIndex((line) => line.includes('[::STUB::]'));

  return verifyMarkerRewrites({
    phases: [
      {
        tickets: [
          {
            phaseId: 99,
            id: 99,
            stubs: [{ file: stubPath, line: stubLine + 1, content: 'PX-99: a key the file does not carry' }],
          },
        ],
      },
    ],
  });
}

/**
 * The checklist CLI's normalised output for a fixed graph.
 *
 * @param {{ projectRoot: string, graph?: object }} args
 * @returns {string}
 */
export function freezeChecklistOutput({ projectRoot, graph = readFixtureJson(projectRoot, 'checklist-graph.json') }) {
  const scratch = mkdtempSync(join(tmpdir(), 'px207-checklist-'));
  try {
    writeFileSync(join(scratch, 'DesignTree.json'), JSON.stringify(graph, null, 2));
    const result = spawnSync(
      process.execPath,
      [join(projectRoot, '.claude/scripts/grill-me-for-rfc/generate-checklist.js'), scratch],
      { cwd: scratch, encoding: 'utf8' },
    );
    return normaliseChecklistOutput(`${result.stdout ?? ''}${result.stderr ?? ''}`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * Replace the one field that differs between two runs.
 *
 * The checklist carries its generation time, so freezing the raw bytes would make
 * the gate fail on every invocation — the failure mode P22-1 named when
 * `manifest_hash` proved non-reproducible. The exclusion is declared in the
 * baseline beside the value rather than applied silently, because a normalisation
 * nobody can see is indistinguishable from a value that was never checked.
 *
 * @param {string} raw
 * @returns {string}
 */
export function normaliseChecklistOutput(raw) {
  return String(raw)
    .replace(/generated at [0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z/g, `generated at ${CHECKLIST_TIMESTAMP_PLACEHOLDER}`)
    .replace(/"generated_at"\s*:\s*"[^"]*"/g, `"generated_at": "${CHECKLIST_TIMESTAMP_PLACEHOLDER}"`);
}

/** Read one of this module's fixtures. */
// [::TICKET::] PX-207 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-207 --for-spec --no-implementation-order`.
function readFixtureJson(projectRoot, name) {
  return JSON.parse(readFileSync(join(projectRoot, FORWARD_SURFACE_FIXTURES, name), 'utf8'));
}

/**
 * Produce every surface's value, proving each reproduces before it is frozen.
 *
 * Pure: nothing is written. Publishing is `mergeForwardSurfacesIntoBaseline`, so a
 * caller can compare a capture against a baseline without touching the baseline.
 *
 * @param {{ projectRoot: string, surfaces?: readonly object[] }} args
 * @returns {Array<object>}
 */
export function captureForwardSurfaces({ projectRoot, surfaces = FORWARD_SURFACES }) {
  const entries = [];

  for (const surface of surfaces) {
    const producedFrom = surface.inputPath ?? '(no input)';

    let first;
    let second;
    try {
      // The fixture is read inside the guard, not before it. A caller measuring a
      // tree that does not carry this module's fixtures — a scratch project, for
      // instance — must see the surface reported as unavailable rather than an
      // exception thrown out of a capture that was asked about something else.
      const input = fixtureInputFor(projectRoot, surface);
      first = canonicalSerialize(surface.producer({ projectRoot, input, fixture: surface.inputPath }));
      // A second capture is what makes the value a fact rather than an observation.
      second = canonicalSerialize(surface.producer({ projectRoot, input, fixture: surface.inputPath }));
    } catch (error) {
      entries.push({ surface: surface.name, kind: surface.kind, producedFrom, unavailable: error.message });
      continue;
    }

    if (first !== second) {
      entries.push({ surface: surface.name, kind: NON_DETERMINISTIC_KIND, producedFrom, observations: [first, second] });
      continue;
    }

    const entry = { surface: surface.name, kind: surface.kind, producedFrom, value: JSON.parse(first) };
    if (surface.normalisation !== undefined) entry.normalisation = surface.normalisation;
    entries.push(entry);
  }

  return entries;
}

/**
 * Publish captured values beside the existing baseline keys without touching them.
 *
 * @param {{ projectRoot: string, baselinePath?: string, entries: Array<object> }} args
 * @returns {object} the merged baseline, as written
 */
export function mergeForwardSurfacesIntoBaseline({ projectRoot, baselinePath = BASELINE_RELATIVE_PATH, entries }) {
  // A caller may name the baseline relative to the tree or absolutely: a test that
  // must not write the tracked file has no relative name for its copy, and `join`
  // would concatenate an absolute path onto the root and find nothing.
  const absolutePath = isAbsolute(baselinePath) ? baselinePath : join(projectRoot, baselinePath);
  const existing = JSON.parse(readFileSync(absolutePath, 'utf8'));
  const merged = { ...existing, [FORWARD_SURFACES_KEY]: entries };
  writeFileSync(absolutePath, `${JSON.stringify(merged, null, 2)}\n`);
  return merged;
}

/**
 * Whether a baseline's forward surfaces still reproduce, and if not, why.
 *
 * @param {{ baseline: object, projectRoot: string, producers?: Record<string, Function> }} args
 * @returns {{ proved: boolean, verdict: string, drifted: Array<object>, unavailable: string[] }}
 */
export function checkForwardSurfaces({ baseline, projectRoot, producers }) {
  const entries = baseline[FORWARD_SURFACES_KEY] ?? [];
  const declared = new Map(FORWARD_SURFACES.map((surface) => [surface.name, surface]));
  const drifted = [];
  const unavailable = [];

  for (const entry of entries) {
    const surface = declared.get(entry.surface);
    let observed;
    try {
      observed =
        producers?.[entry.surface] !== undefined
          ? canonicalSerialize(producers[entry.surface]())
          : canonicalSerialize(surface.producer({ projectRoot, input: fixtureInputFor(projectRoot, surface), fixture: surface.inputPath }));
    } catch (error) {
      unavailable.push(`${entry.surface}: ${error.message}`);
      continue;
    }

    if (observed !== canonicalSerialize(entry.value)) {
      drifted.push({ surface: entry.surface, expected: entry.value, observed: JSON.parse(observed) });
    }
  }

  const proved = drifted.length === 0 && unavailable.length === 0;
  return { proved, verdict: proved ? 'proved' : 'not proved', drifted, unavailable };
}

/** The fixture a surface's producer takes, when it declares one. */
// [::TICKET::] PX-207 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-207 --for-spec --no-implementation-order`.
function fixtureInputFor(projectRoot, surface) {
  if (surface.inputPath === undefined || !surface.inputPath.endsWith('.json')) return undefined;
  return readFixtureJson(projectRoot, surface.inputPath.split('/').pop());
}

/**
 * The forward files a revision range touched.
 *
 * Derived from git rather than stored, so the population cannot go stale: a list
 * of files to cover that nobody updates is how a fourth surface goes unnoticed.
 *
 * @param {{ projectRoot: string, revisionRange?: string }} args
 * @returns {Array<{ path: string, added: number, removed: number }>}
 */
export function forwardTreeChanges({ projectRoot, revisionRange = 'master...HEAD' }) {
  const result = spawnSync('git', ['diff', '--numstat', revisionRange, '--', '.claude/scripts'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) return [];

  return result.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [added, removed, path] = line.split('\t');
      return { path: `tools/conver/${path}`, added: Number(added), removed: Number(removed), relativePath: path };
    })
    .filter((change) => FORWARD_TREE_PREFIXES.some((prefix) => change.relativePath.startsWith(prefix)))
    .filter((change) => !REVERSE_ONLY_FILE_PATTERN.test(change.relativePath) && !change.relativePath.includes('workspacify-reverse/'))
    .map(({ path, added, removed }) => ({ path, added, removed }));
}

/**
 * The forward files at least one declared surface claims to cover.
 *
 * @param {{ changes: Array<{ path: string }> }} args
 * @returns {string[]} sorted, de-duplicated
 */
export function coveredForwardFiles({ changes }) {
  const covered = new Set();
  for (const surface of FORWARD_SURFACES) {
    for (const path of surface.covers ?? []) {
      if (changes.some((change) => change.path === path)) covered.add(path);
    }
  }
  return [...covered].sort();
}

/**
 * The forward files the diff touched that no surface claims.
 *
 * Reported rather than swept up: not every change needs a frozen value — a
 * generated artefact is covered by the freshness check, and a pipeline driver by
 * the three pairs P22-1 froze — but a file that is neither covered nor named is
 * one nobody is watching, and "we found no gaps" must not be the same sentence as
 * "we did not look".
 *
 * @param {{ changes: Array<{ path: string }> }} args
 * @returns {string[]} sorted
 */
export function uncoveredForwardFiles({ changes }) {
  const covered = new Set(coveredForwardFiles({ changes }));
  return changes
    .map((change) => change.path)
    .filter((path) => !covered.has(path))
    .sort();
}

/**
 * Render the check as the report a person reads.
 *
 * @param {ReturnType<typeof checkForwardSurfaces>} result
 * @returns {string} Markdown
 */
export function renderForwardSurfaceReport(result) {
  const lines = ['## Forward surfaces', ''];
  for (const drift of result.drifted) {
    lines.push(`- **${drift.surface}** drifted`);
    lines.push(`  - expected: ${canonicalSerialize(drift.expected).slice(0, 200)}`);
    lines.push(`  - observed: ${canonicalSerialize(drift.observed).slice(0, 200)}`);
  }
  for (const entry of result.unavailable) lines.push(`- unavailable: ${entry}`);
  lines.push('', `**${result.verdict}**`);
  return lines.join('\n');
}
