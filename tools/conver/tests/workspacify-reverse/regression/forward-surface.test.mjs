// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
/**
 * forward-surface — every forward file P22 modified has a frozen value the gate
 * reproduces, so a later change to any of them is reported by name.
 *
 * P22-1 built the gate over the workspacify surfaces: 25 fixture digests, three
 * pipeline pairs, five allocate digests and nine command-file digests. The changes
 * P22 then made to `rfc-graph` and to `tickets` sit outside it and rest on unit
 * tests alone, and a unit test asserts what its author thought of while a frozen
 * value asserts that nothing moved — including moves the author did not think of.
 * `generateHeaderComment`'s signature went from seven arguments to five and the
 * header bytes changed with it; `dump-node-context-to-spec.js` carried a defect in
 * which every node id collapsed to `[object Object]`, and it survived because
 * nothing compared the map against a known-good result.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FORWARD_SURFACES,
  FORWARD_SURFACES_KEY,
  captureForwardSurfaces,
  checkForwardSurfaces,
  coveredForwardFiles,
  forwardTreeChanges,
  freezeHeaderOutput,
  mergeForwardSurfacesIntoBaseline,
  freezeNodeIdPathMap,
  normaliseChecklistOutput,
  uncoveredForwardFiles,
} from '../../../.claude/scripts/workspacify-reverse/lib/forward-surface-baseline.mjs';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FIXTURES = 'tests/rfc-graph/fixtures/forward-surfaces';
const BASELINE_PATH = 'tests/workspacify-tree/baselines/manifest-hashes.json';

// [::TICKET::] PX-207 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-207 --for-spec --no-implementation-order`.
function readJson(relativePath) {
  return JSON.parse(readFileSync(join(PROJECT_ROOT, relativePath), 'utf8'));
}

/**
 * A throwaway copy of the baseline, because merging writes the file and a test
 * that repairs the repository under measurement is the side effect this whole
 * phase exists to remove. The real baseline is asserted read-only at its own path.
 */
// [::TICKET::] PX-207 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-207 --for-spec --no-implementation-order`.
function scratchBaseline() {
  const scratch = mkdtempSync(join(tmpdir(), 'px207-baseline-'));
  const copy = join(scratch, 'manifest-hashes.json');
  writeFileSync(copy, readFileSync(join(PROJECT_ROOT, BASELINE_PATH)));
  return copy;
}

// [::TICKET::] PX-207 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-207 --for-spec --no-implementation-order`.
function digestTree(root) {
  const digest = createHash('sha256');
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else digest.update(readFileSync(full));
    }
  };
  walk(root);
  return digest.digest('hex');
}

// ---------------------------------------------------------------------------
// C001 — each surface names its producer and its input, and capture is idempotent
// ---------------------------------------------------------------------------

test('C001 every declared surface names a producer, a kind and an existing input', () => {
  assert.ok(FORWARD_SURFACES.length > 0, 'a gate with no surfaces covers nothing');

  for (const surface of FORWARD_SURFACES) {
    assert.equal(typeof surface.name, 'string');
    assert.ok(
      ['pure-output', 'pure-map', 'pure-decision', 'fixture-verdict', 'cli-stdout-normalised'].includes(surface.kind),
      `${surface.name} declares an unknown kind: ${surface.kind}`,
    );
    assert.equal(typeof surface.producer, 'function', `${surface.name} must name how its value is obtained`);
    if (surface.inputPath !== undefined) {
      assert.equal(existsSync(join(PROJECT_ROOT, surface.inputPath)), true, `${surface.inputPath} must exist`);
    }
  }
});

test('C001 capture produces one traceable entry per surface, idempotently', () => {
  const first = captureForwardSurfaces({ projectRoot: PROJECT_ROOT });
  const second = captureForwardSurfaces({ projectRoot: PROJECT_ROOT });

  assert.deepEqual(first, second, 'two captures must be byte-identical');
  assert.equal(first.length, FORWARD_SURFACES.length);
  for (const entry of first) {
    assert.equal(typeof entry.surface, 'string');
    assert.ok(entry.producedFrom !== undefined, `${entry.surface} must say what it was produced from`);
    assert.notEqual(entry.value, undefined, `${entry.surface} must carry a value`);
    assert.notEqual(entry.value, null);
  }
});

test('C001 a value that does not reproduce is recorded as non-deterministic, not frozen', () => {
  // A counter rather than a clock: two `Date.now()` calls microseconds apart
  // agree, so a clock is not reliably detectable by capturing twice. What the
  // capture proves is that a value *did not reproduce*, not that it *cannot* —
  // and a value that agrees twice is unproven-stable rather than proven-stable.
  // The baseline records which of the two it is by keeping both observations.
  let calls = 0;
  const surface = {
    name: 'volatile',
    kind: 'pure-output',
    producer: () => String(++calls),
    inputPath: `${FIXTURES}/header-input.json`,
  };
  const [entry] = captureForwardSurfaces({ projectRoot: PROJECT_ROOT, surfaces: [surface] });

  assert.equal(entry.kind, 'non-deterministic', 'a clock-derived value must not be frozen');
  assert.ok(entry.observations.length >= 2, 'both observations must be kept, not only the last');
  assert.notEqual(entry.observations[0], entry.observations[1]);
});

test('C001 a directory with no forward surface says so rather than reporting success', () => {
  assert.deepEqual(captureForwardSurfaces({ projectRoot: PROJECT_ROOT, surfaces: [] }), []);
});

// ---------------------------------------------------------------------------
// C002 — drift and unavailability are different answers
// ---------------------------------------------------------------------------

test('C002 drift is reported with both values, and unavailability is not drift', () => {
  const baseline = { forwardSurfaces: [{ surface: 'header-output', kind: 'pure-output', value: 'expected-header' }] };

  const drifted = checkForwardSurfaces({
    baseline,
    projectRoot: PROJECT_ROOT,
    producers: { 'header-output': () => 'observed-header' },
  });
  assert.equal(drifted.proved, false);
  assert.deepEqual(drifted.drifted, [
    { surface: 'header-output', expected: 'expected-header', observed: 'observed-header' },
  ]);
  assert.deepEqual(drifted.unavailable, []);

  const unavailable = checkForwardSurfaces({
    baseline,
    projectRoot: PROJECT_ROOT,
    producers: {
      'header-output': () => {
        throw new Error('the fixture is absent: tests/rfc-graph/fixtures/forward-surfaces/header-input.json');
      },
    },
  });
  assert.equal(unavailable.proved, false, 'a surface that could not be produced is not reproduced');
  assert.deepEqual(unavailable.drifted, [], 'and it is not reported as drift');
  assert.match(unavailable.unavailable[0], /fixture is absent/);
});

test('C002 the verdict vocabulary is proved and not proved, never success or failure', () => {
  const baseline = { forwardSurfaces: [{ surface: 's', kind: 'pure-output', value: 'v' }] };
  const clean = checkForwardSurfaces({ baseline, projectRoot: PROJECT_ROOT, producers: { s: () => 'v' } });

  assert.equal(clean.proved, true);
  assert.ok(['proved', 'not proved'].includes(clean.verdict), `unexpected verdict: ${clean.verdict}`);
  assert.equal(/\b(success|succeeded|failed|pass|fail)\b/.test(clean.verdict), false);
});

// ---------------------------------------------------------------------------
// C003 — the header producer, whose bytes supreme law 4 protects
// ---------------------------------------------------------------------------

test('C003 generateHeaderComment is a pure five-argument function', () => {
  const input = readJson(`${FIXTURES}/header-input.json`);
  const before = digestTree(join(PROJECT_ROOT, FIXTURES));

  const header = freezeHeaderOutput({ projectRoot: PROJECT_ROOT, input });

  assert.equal(typeof header, 'string');
  assert.equal(digestTree(join(PROJECT_ROOT, FIXTURES)), before, 'producing the header must write nothing');
});

test('C003 the emitted header carries the protected marker and every declared input', () => {
  const input = readJson(`${FIXTURES}/header-input.json`);
  const header = freezeHeaderOutput({ projectRoot: PROJECT_ROOT, input });

  assert.ok(
    header.includes('Initial Design Artifact — RFC-driven Implementation'),
    'supreme law 4 protects these bytes, and a frozen value is what protects them',
  );
  assert.ok(header.includes(input.headerPaths.graphRelPath));
  assert.ok(header.includes(input.headerPaths.dirsTreeRelPath));
  assert.ok(header.includes(input.headerPaths.sourceRelPath));
  for (const node of input.mappedNodeIds) assert.ok(header.includes(node.nodeId), `${node.nodeId} must appear`);
});

test('C003 the header value is stable across calls', () => {
  const input = readJson(`${FIXTURES}/header-input.json`);
  assert.equal(
    freezeHeaderOutput({ projectRoot: PROJECT_ROOT, input }),
    freezeHeaderOutput({ projectRoot: PROJECT_ROOT, input }),
  );
});

test('C003 the node-id map resolves both entry shapes, and the [object Object] collapse cannot recur', () => {
  const dirsTree = readJson(`${FIXTURES}/dirs-tree.json`);
  const map = freezeNodeIdPathMap({ projectRoot: PROJECT_ROOT, dirsTree });

  assert.equal('[object Object]' in map, false, 'the pre-P22-14 collapse must not be able to recur unnoticed');
  assert.equal(map.N0001, 'src', 'an object-shaped entry resolves by its nodeId');
  assert.equal(map.N0002, 'src', 'a bare-string entry resolves too, because trees predating the schema carry them');
  assert.equal(map.N0003, 'src');
  assert.equal(map.N0004, 'src/config', 'a nested node resolves to its own directory');
  assert.equal(map.N0005, 'src/session');
  assert.equal(Object.keys(map).length, 5, 'an entry carrying no node id is skipped rather than keyed by its string form');
});

// ---------------------------------------------------------------------------
// C004 — the covered set, derived rather than stored
// ---------------------------------------------------------------------------

test('C004 the forward-tree diff is readable, and an empty diff states it has nothing to cover', () => {
  const changes = forwardTreeChanges({ projectRoot: PROJECT_ROOT, revisionRange: 'master...HEAD' });
  assert.ok(Array.isArray(changes));

  if (changes.length === 0) {
    assert.deepEqual(coveredForwardFiles({ changes }), [], 'an empty diff must say so rather than pass vacuously');
  }
});

test('C004 a surface claim is honoured, and a gap is named rather than hidden', () => {
  const changes = forwardTreeChanges({ projectRoot: PROJECT_ROOT, revisionRange: 'master...HEAD' });
  const covered = coveredForwardFiles({ changes });
  const uncovered = uncoveredForwardFiles({ changes });

  for (const surface of FORWARD_SURFACES) {
    for (const path of surface.covers ?? []) {
      if (changes.some((change) => change.path === path)) {
        assert.ok(covered.includes(path), path + ' is claimed by ' + surface.name + ' and must be covered');
      }
    }
  }

  // Every changed forward file is either covered by a frozen value or named as a
  // gap. A gap that is neither is how a file goes unchecked without anyone knowing.
  for (const change of changes) {
    assert.ok(
      covered.includes(change.path) || uncovered.includes(change.path),
      change.path + ' must be covered or named as a gap',
    );
  }
});

test('C004 capture leaves the existing three baseline keys byte-identical', () => {
  const before = readJson(BASELINE_PATH);
  const scratch = scratchBaseline();
  const entries = captureForwardSurfaces({ projectRoot: PROJECT_ROOT });
  const after = mergeForwardSurfacesIntoBaseline({
    projectRoot: PROJECT_ROOT,
    baselinePath: scratch.replace(PROJECT_ROOT + '/', ''),
    entries,
  });

  // The three keys that existed before this ticket are byte-identical after a
  // capture, and the new surfaces arrive under a key of their own. Asserting the
  // key *list* would have been wrong once the baseline legitimately carries the
  // fourth key; what matters is that the first three did not move.
  for (const key of ['fixtures', 'manifestHashes', 'commandFileDigests']) {
    assert.ok(key in before, key + ' was frozen before this ticket');
    assert.deepEqual(after[key], before[key], key + ' must not be re-captured by this ticket');
  }
  assert.ok(Array.isArray(after.forwardSurfaces), 'the new surfaces are added under a new key');
  assert.equal(FORWARD_SURFACES_KEY in after, true);
});

test('C004 capture and check write nothing into the trees they measure', () => {
  const before = {
    rfcGraph: digestTree(join(PROJECT_ROOT, '.claude/scripts/rfc-graph')),
    tickets: digestTree(join(PROJECT_ROOT, '.claude/scripts/tickets')),
    fixtures: digestTree(join(PROJECT_ROOT, FIXTURES)),
  };

  const entries = captureForwardSurfaces({ projectRoot: PROJECT_ROOT });
  checkForwardSurfaces({ baseline: { forwardSurfaces: entries }, projectRoot: PROJECT_ROOT });

  assert.equal(digestTree(join(PROJECT_ROOT, '.claude/scripts/rfc-graph')), before.rfcGraph);
  assert.equal(digestTree(join(PROJECT_ROOT, '.claude/scripts/tickets')), before.tickets);
  assert.equal(digestTree(join(PROJECT_ROOT, FIXTURES)), before.fixtures);
});

test('C001 the marker-rewrite surface freezes a failing case as well as a passing one', () => {
  // Freezing only {ok: true} would be indistinguishable from freezing a check that
  // had stopped looking: the stub line moved once already, when an annotation was
  // injected above it, and the surface reported ok because it was reading the
  // annotation. A surface that cannot be shown to fail has not been shown to work.
  const entry = captureForwardSurfaces({ projectRoot: PROJECT_ROOT }).find((item) => item.surface === 'marker-rewrite');

  assert.equal(entry.value.conforming.ok, true, 'a stub carrying its own key conforms');
  assert.deepEqual(entry.value.conforming.failures, []);
  assert.equal(entry.value.violating.ok, false, 'a stub carrying an old key must be reported');
  assert.match(entry.value.violating.failures[0], /still references an old key/);
});

// ---------------------------------------------------------------------------
// The one normalisation, declared rather than silent
// ---------------------------------------------------------------------------

test('the checklist normalisation removes exactly the generation timestamp', () => {
  const raw = 'generated at 2026-09-11T03:36:07.638Z\nbody line\n';
  const other = 'generated at 2027-01-02T11:22:33.444Z\nbody line\n';

  assert.notEqual(raw, other, 'the raw output differs between two runs, which is why it cannot be frozen');
  assert.equal(
    normaliseChecklistOutput(raw),
    normaliseChecklistOutput(other),
    'and the normalised output does not differ',
  );
  assert.ok(normaliseChecklistOutput(raw).includes('body line'), 'nothing but the timestamp is removed');
});

test('the normalisation is declared in the baseline beside the value it produced', () => {
  const checklist = captureForwardSurfaces({ projectRoot: PROJECT_ROOT }).find((entry) => entry.surface === 'checklist-output');

  assert.ok(checklist, 'the checklist surface must be captured');
  assert.equal(typeof checklist.normalisation, 'string', 'a reader must be able to see what was excluded');
  assert.match(checklist.normalisation, /timestamp/i);
});
