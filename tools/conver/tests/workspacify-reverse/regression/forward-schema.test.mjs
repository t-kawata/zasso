// [::TICKET::] P22-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-10 --for-spec --no-implementation-order`.
// P22-10 @verifies C001 C002 C003
/**
 * The forward schemas, extended for the reverse rotation without moving a byte.
 *
 * The reverse rotation has to carry uncertainty downstream. ABOUT-REVERSE 6.12.2
 * settled where: the canonical record stays in a sidecar, and each forward
 * artefact gains only the minimum optional reference it actually needs. This
 * suite proves the two halves of that ruling at once — that the reverse fields
 * appear when the run is in reverse mode, and that a forward run is byte for
 * byte what it was before.
 *
 * The second half is not proven by inspection. `checkBaselines` reproduces the
 * values P22-1 froze before any of this existed, and a disagreement is named
 * rather than judged. That gate is also what catches the failure this ticket
 * exists to prevent: a reverse field that leaked into a forward output.
 *
 * Layer C — `*-GRAPH.json` and `*-Dirs-Tree.json` — gains nothing at all. Those
 * artefacts are consumed outside this phase, so the module declares no kind for
 * them and the extension path cannot reach them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

import {
  ALLOCATE_FIXTURES_RELATIVE_DIR,
  BASELINE_RELATIVE_PATH,
  COMMANDS_RELATIVE_DIR,
  TREE_FIXTURES_RELATIVE_DIR,
  captureBaselines,
  checkBaselines,
  readFixtureDigests,
} from '../../../.claude/scripts/workspacify-reverse/lib/regression-gate.mjs';
import {
  FORWARD_ARTIFACT_KINDS,
  MODE,
  REVERSE_FIELD_NAMES,
  assertForwardByteIdentity,
  assertReverseAdditions,
  detectReverseContamination,
  extendForwardArtifacts,
  headingCount,
  reverseModeOf,
  sidecarReference,
} from '../../../.claude/scripts/workspacify-reverse/lib/forward-extensions.mjs';
import { renderSeed } from '../../../.claude/scripts/workspacify-allocate/lib/seed-render.mjs';
import { parseSeed } from '../../../.claude/scripts/workspacify-allocate/lib/seed-parse.mjs';
import {
  SEED_AUTHORING_SECTION_INDEXES,
  SEED_REQUIRED_SECTIONS,
} from '../../../.claude/scripts/workspacify-allocate/lib/seed-model.mjs';
import { buildValidManifest, baseAiSections } from '../../workspacify-allocate/helpers/build-valid-manifest.mjs';

const PROJECT_ROOT = process.cwd();
const BASELINE_PATH = join(PROJECT_ROOT, BASELINE_RELATIVE_PATH);

/** A throwaway project holding copies of the fixtures and command files under test. */
// [::TICKET::] P22-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-10 --for-spec --no-implementation-order`.
function makeTempProject() {
  const root = mkdtempSync(join(tmpdir(), 'p22-10-gate-'));
  for (const dir of [TREE_FIXTURES_RELATIVE_DIR, ALLOCATE_FIXTURES_RELATIVE_DIR, COMMANDS_RELATIVE_DIR]) {
    cpSync(join(PROJECT_ROOT, dir), join(root, dir), { recursive: true });
  }
  return root;
}

/** The stage-2 fixture manifest, the one artefact whose bytes this ticket must not move. */
// [::TICKET::] P22-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-10 --for-spec --no-implementation-order`.
function allocateFixtureManifestPath(root) {
  return join(root, ALLOCATE_FIXTURES_RELATIVE_DIR, 'sample-tree', 'WORKSPACIFY-TREE-MANIFEST.json');
}

// ---------------------------------------------------------------------------
// C001 — forward fixtures exist; every output byte-identical; the path unmodified
// ---------------------------------------------------------------------------

test('C001 precondition: the forward fixtures and their frozen baseline exist', () => {
  assert.ok(existsSync(join(PROJECT_ROOT, TREE_FIXTURES_RELATIVE_DIR)), 'the stage-1 fixtures must exist');
  assert.ok(existsSync(join(PROJECT_ROOT, ALLOCATE_FIXTURES_RELATIVE_DIR)), 'the stage-2 fixtures must exist');
  assert.ok(existsSync(BASELINE_PATH), 'P22-1 must have frozen the baseline before this ticket ran');

  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  assert.ok(baseline.fixtures.length > 0, 'the baseline must name the fixtures it froze');
  assert.ok(
    Object.keys(baseline.manifestHashes).length >= baseline.fixtures.length,
    'every frozen fixture must carry a hash',
  );
});

test('UT-1 C001 postcondition: every forward fixture reproduces its frozen manifest_hash', () => {
  const report = checkBaselines();
  assert.equal(report.verdict, 'proved');
  assert.deepEqual(report.driftedNames, [], 'no fixture and no pipeline run may drift');
  assert.equal(report.commandFileFindings.length, 0, 'no protected command-file section may move');
  assert.ok(report.fixtureCount > 0, 'a gate with nothing to compare proves nothing');
});

test('C001 invariant: a forward artefact that changed by one byte is refused', () => {
  const before = { run: { planned_directories: 3 }, integrity: { manifest_hash: 'ab' } };
  const identical = { run: { planned_directories: 3 }, integrity: { manifest_hash: 'ab' } };
  assert.doesNotThrow(() => assertForwardByteIdentity(before, identical, { label: 'allocate fixture' }));

  const changed = { run: { planned_directories: 4 }, integrity: { manifest_hash: 'ab' } };
  assert.throws(() => assertForwardByteIdentity(before, changed, { label: 'allocate fixture' }), /allocate fixture/);

  // Text artefacts are compared as bytes, not normalised: a trailing newline is a difference.
  assert.throws(() => assertForwardByteIdentity('a\n', 'a\n\n', { label: 'RFC-SEED.md' }), /RFC-SEED\.md/);
});

// ---------------------------------------------------------------------------
// C002 — reverse mode; the declared fields appear; optional and absent in forward mode
// ---------------------------------------------------------------------------

test('C002 precondition: reverse mode is read from the artefact, never assumed', () => {
  assert.equal(reverseModeOf({}), MODE.FORWARD, 'no mode field means forward');
  assert.equal(reverseModeOf({ mode: 'forward' }), MODE.FORWARD);
  assert.equal(reverseModeOf({ mode: 'reverse' }), MODE.REVERSE);

  // A ticket declares its origin with origin_kind; only "forward" is the plain rotation.
  assert.equal(reverseModeOf({ origin_kind: 'forward' }), MODE.FORWARD);
  assert.equal(reverseModeOf({ origin_kind: 'reverse' }), MODE.REVERSE);
  assert.equal(reverseModeOf({ origin_kind: 'evolution' }), MODE.REVERSE);
  assert.equal(reverseModeOf({ origin_kind: 'omission' }), MODE.REVERSE);
  assert.equal(reverseModeOf({ origin_kind: 'residue' }), MODE.REVERSE);
});

/** One representative value per artefact kind, shaped as ABOUT-REVERSE 6.12.3 declares it. */
const REVERSE_CASES = [
  [FORWARD_ARTIFACT_KINDS.RESIDUAL, {
    normative_context: { sidecar_bundle_hash: 'sha256:aa', authority: 'security-domain-steward' },
    incomplete_for_scope: ['authorization'],
  }],
  [FORWARD_ARTIFACT_KINDS.RFC_SEED, {
    reverse_index: [{ claim_id: 'clm-1', residual_id: 'residual-000001', scope_ref: 'SCOPE-BOUNDARY.json', risk_class: 'security' }],
    sidecar_reference: sidecarReference({ bundleHash: 'sha256:aa', counts: { claims: 1 } }),
  }],
  [FORWARD_ARTIFACT_KINDS.OMISSION, {
    affected_claim_ids: ['clm-1'],
    origin_residual_ids: ['residual-000001'],
    scope_ref: 'SCOPE-BOUNDARY.json',
    oracle_gap_ref: 'ORACLE-GAP.json',
  }],
  [FORWARD_ARTIFACT_KINDS.RESIDUE, {
    affected_claim_ids: ['clm-1'],
    origin_residual_ids: ['residual-000001'],
    scenario_ref: 'COUNTEREXAMPLE-PLAN.json',
    next_route: 'grill',
  }],
  [FORWARD_ARTIFACT_KINDS.TICKET, {
    driving_claim_ids: ['clm-1'],
    driving_residual_ids: ['residual-000001'],
    counterexample_plan_ids: [],
    origin_kind: 'reverse',
    staleness_ref: 'STALENESS-INDEX.json',
  }],
];

test('UT-2 C002 postcondition: every artefact kind gains its declared reverse fields', () => {
  for (const [kind, reverseFields] of REVERSE_CASES) {
    const extended = extendForwardArtifacts({ id: 'base' }, { kind, mode: MODE.REVERSE, reverseFields });
    assert.equal(extended.id, 'base', 'the forward keys survive untouched');
    for (const field of REVERSE_FIELD_NAMES[kind]) {
      assert.ok(field in extended, `${kind} is missing ${field}`);
    }
    assert.doesNotThrow(() => assertReverseAdditions(extended, kind));
  }
});

test('C002 postcondition: a declared field the caller omitted is reported, not invented', () => {
  assert.throws(
    () => assertReverseAdditions({ normative_context: {} }, FORWARD_ARTIFACT_KINDS.RESIDUAL),
    (error) => error.message.includes('incomplete_for_scope'),
  );
  assert.throws(
    () => extendForwardArtifacts({ id: 'base' }, {
      kind: FORWARD_ARTIFACT_KINDS.OMISSION,
      mode: MODE.REVERSE,
      reverseFields: { not_a_declared_field: 1 },
    }),
    (error) => error.message.includes('not_a_declared_field'),
  );
});

test('UT-7 C002 invariant: no declared field appears on a forward artefact', () => {
  const forward = { id: 'base', package: 'pkg-a' };
  for (const kind of Object.values(FORWARD_ARTIFACT_KINDS)) {
    const returned = extendForwardArtifacts(forward, { kind, mode: MODE.FORWARD, reverseFields: {} });
    assert.equal(returned, forward, 'forward mode returns the artefact itself, so the bytes cannot move');
    assert.deepEqual(detectReverseContamination(returned, kind), []);
    for (const field of REVERSE_FIELD_NAMES[kind]) {
      assert.equal(field in returned, false, `${kind} leaked ${field} into forward mode`);
    }
  }
});

// ---------------------------------------------------------------------------
// C003 — the seed is generated; 14 headings carrying the reverse index; the check unchanged
// ---------------------------------------------------------------------------

// [::TICKET::] P22-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-10 --for-spec --no-implementation-order`.
function seedFixture() {
  const { manifest } = buildValidManifest();
  const pkg = manifest.workspace.packages[0];
  const referenceBlock = {
    package: { id: pkg.id, name: pkg.name, path: pkg.path },
    source_spec: { path: 'spec.md', sha256: manifest.input.source_hash },
    stage1_manifest: { path: 'WORKSPACIFY-TREE-MANIFEST.json', hash: manifest.integrity.manifest_hash },
  };
  return { manifest, pkg, referenceBlock, expectedAllocation: [] };
}

/** A seed in reverse mode, so the reverse index is machine input rather than AI prose. */
// [::TICKET::] P22-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-10 --for-spec --no-implementation-order`.
function renderReverseSeed(reverseIndex) {
  const { manifest, pkg, referenceBlock, expectedAllocation } = seedFixture();
  return renderSeed({
    package: pkg,
    machine: {
      manifest,
      expectedAllocation,
      referenceBlock,
      contractEdges: [],
      mode: 'reverse',
      reverseIndex,
      sidecarReference: sidecarReference({ bundleHash: 'sha256:aa', counts: { claims: 1 } }),
    },
    aiSections: baseAiSections(),
  });
}

test('C003 precondition: section 1 is machine-injected, so the reverse index is never AI prose', () => {
  const { manifest, pkg, referenceBlock, expectedAllocation } = seedFixture();
  assert.equal(SEED_AUTHORING_SECTION_INDEXES.includes(1), false, 'section 1 is not an authoring section');
  assert.throws(
    () => renderSeed({
      package: pkg,
      machine: { manifest, expectedAllocation, referenceBlock, contractEdges: [] },
      aiSections: { ...baseAiSections(), 1: 'the AI wrote the reverse index' },
    }),
    (error) => error.gateId === 'G3.6',
  );
});

test('UT-3 C003 postcondition: a reverse seed keeps 14 headings and carries the reverse index in section 1', () => {
  const reverseIndex = [
    { claim_id: 'clm-1', residual_id: 'residual-000001', scope_ref: 'SCOPE-BOUNDARY.json', risk_class: 'security' },
  ];
  const { seedText } = renderReverseSeed(reverseIndex);

  const parsed = parseSeed(seedText);
  assert.equal(parsed.headings.length, SEED_REQUIRED_SECTIONS.length);
  assert.equal(parsed.headings.length, 14, 'section 1 is extended; a fifteenth heading would break the forward rotation');
  assert.equal(parsed.headings.some((heading) => heading.index === 15), false);
  assert.deepEqual(parsed.referenceBlock.reverse_index, reverseIndex);
  assert.equal(parsed.referenceBlock.sidecar_reference.sidecar_bundle_hash, 'sha256:aa');
  assert.deepEqual(parsed.referenceBlock.package, { id: 'pkg-a', name: 'alpha', path: 'crates/protocol/alpha' });
});

test('UT-8 C003 boundary: a seed with exactly 14 headings and an empty reverse index is valid', () => {
  const parsed = parseSeed(renderReverseSeed([]).seedText);
  assert.equal(parsed.headings.length, 14);
  assert.deepEqual(parsed.referenceBlock.reverse_index, []);
});

test('UT-12 C003 invariant: the heading count is imported, and the check still compares against it', () => {
  assert.equal(headingCount, SEED_REQUIRED_SECTIONS.length, 'the count is read from the model, never written twice');
  assert.equal(SEED_REQUIRED_SECTIONS.length, 14);
  assert.equal(parseSeed(renderReverseSeed([]).seedText).headings.length, SEED_REQUIRED_SECTIONS.length);
});

test('UT-5 C003 boundary: a seed with 15 headings is rejected by the unchanged exact-count check', () => {
  const { seedText } = renderReverseSeed([]);
  const withFifteenth = seedText.replace(/\n## 14\. /, '\n## 15. An invented heading\n\nbody\n\n## 14. ');
  assert.notEqual(withFifteenth, seedText, 'the fixture must really carry fifteen headings');
  assert.throws(
    () => parseSeed(withFifteenth),
    (error) => error.gateId === 'G3.6' && /15 headings, expected 14/.test(error.message),
  );
});

// ---------------------------------------------------------------------------
// UT-4 — a reverse-only field in forward mode is a schema error, never tolerated
// ---------------------------------------------------------------------------

test('UT-4 a forward run that encounters a reverse-only field reports a schema error', () => {
  for (const kind of Object.values(FORWARD_ARTIFACT_KINDS)) {
    const leaked = REVERSE_FIELD_NAMES[kind][0];
    assert.throws(
      () => extendForwardArtifacts({ id: 'base', [leaked]: 'leaked' }, { kind, mode: MODE.FORWARD, reverseFields: {} }),
      (error) => error.gateId === 'G3.6' && error.message.includes(leaked),
      `${kind} tolerated ${leaked} in forward mode`,
    );
    assert.throws(
      () => extendForwardArtifacts({ id: 'base' }, { kind, mode: MODE.FORWARD, reverseFields: { [leaked]: 'x' } }),
      (error) => error.gateId === 'G3.6' && error.message.includes(leaked),
    );
  }
});

test('UT-4 a seed asked to carry a reverse index while in forward mode is refused', () => {
  const { manifest, pkg, referenceBlock, expectedAllocation } = seedFixture();
  assert.throws(
    () => renderSeed({
      package: pkg,
      machine: { manifest, expectedAllocation, referenceBlock, contractEdges: [], mode: 'forward', reverseIndex: [] },
      aiSections: baseAiSections(),
    }),
    (error) => error.gateId === 'G3.6',
  );
});

// ---------------------------------------------------------------------------
// UT-6 — the gate is what notices a reverse field written into a forward output
// ---------------------------------------------------------------------------

test('UT-6 the regression gate reports a reverse field written into a forward fixture', () => {
  const root = makeTempProject();
  try {
    captureBaselines({ projectRoot: root });
    assert.equal(checkBaselines({ projectRoot: root }).verdict, 'proved');

    const manifestPath = allocateFixtureManifestPath(root);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    writeFileSync(manifestPath, `${JSON.stringify({ ...manifest, driving_claim_ids: ['clm-1'] }, null, 2)}\n`);

    const report = checkBaselines({ projectRoot: root });
    assert.equal(report.verdict, 'not proved');
    assert.ok(
      report.driftedNames.some((name) => name.includes('WORKSPACIFY-TREE-MANIFEST.json')),
      'the gate must name the drifted fixture',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// UT-9 — Tickets round-trips unchanged, and the writer refuses a leaked field
// ---------------------------------------------------------------------------

// [::TICKET::] P22-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-10 --for-spec --no-implementation-order`.
function makeTicketsCopy() {
  const dir = mkdtempSync(join(tmpdir(), 'p22-10-tickets-'));
  const ticketsPath = join(dir, 'Tickets.json');
  const document = {
    title: 'P22-10 fixture',
    round: 1,
    metadata: { source: 'forward-schema.test.mjs', generatedAt: '2026-09-11' },
    phases: [{
      id: 22,
      name: 'P22',
      tickets: [{
        id: 10,
        phaseId: 22,
        title: 'fixture',
        status: 'made',
        contracts: [{ id: 'C001', sourceEdge: 'N/A', precondition: 'p', postcondition: 'q', invariant: 'r' }],
      }],
    }],
  };
  writeFileSync(ticketsPath, `${JSON.stringify(document, null, 2)}\n`);
  return ticketsPath;
}

// [::TICKET::] P22-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-10 --for-spec --no-implementation-order`.
function updateTicket(ticketsPath, payload) {
  return spawnSync(
    process.execPath,
    ['.claude/scripts/tickets/update-ticket.js', ticketsPath, 'P22-10'],
    { cwd: PROJECT_ROOT, encoding: 'utf8', input: JSON.stringify(payload) },
  );
}

test('UT-9 a Tickets entry with no reverse fields round-trips unchanged', () => {
  const ticketsPath = makeTicketsCopy();
  try {
    const before = readFileSync(ticketsPath);
    const result = updateTicket(ticketsPath, {});
    assert.equal(result.status, 0);
    assert.deepEqual(readFileSync(ticketsPath), before, 'an update carrying no reverse field writes the same bytes');
  } finally {
    rmSync(join(ticketsPath, '..'), { recursive: true, force: true });
  }
});

test('UT-4 a reverse-only field on a forward ticket is refused by the writer', () => {
  const ticketsPath = makeTicketsCopy();
  try {
    const before = readFileSync(ticketsPath);
    const result = updateTicket(ticketsPath, { driving_claim_ids: ['clm-1'] });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /driving_claim_ids/);
    assert.deepEqual(readFileSync(ticketsPath), before, 'nothing may be written for a refused update');
  } finally {
    rmSync(join(ticketsPath, '..'), { recursive: true, force: true });
  }
});

test('C002 postcondition: a ticket that declares a reverse origin accepts the same field', () => {
  const ticketsPath = makeTicketsCopy();
  try {
    const result = updateTicket(ticketsPath, { origin_kind: 'reverse', driving_claim_ids: ['clm-1'] });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /driving_claim_ids/);
  } finally {
    rmSync(join(ticketsPath, '..'), { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// UT-11 — Layer C gains no field, because no module declares one for it
// ---------------------------------------------------------------------------

test('UT-11 the GRAPH and Dirs-Tree schemas gain no field', () => {
  assert.equal(Object.prototype.hasOwnProperty.call(REVERSE_FIELD_NAMES, 'graph'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(REVERSE_FIELD_NAMES, 'dirs_tree'), false);

  for (const kind of ['graph', 'dirs_tree']) {
    assert.throws(
      () => extendForwardArtifacts({ id: 'N0042' }, { kind, mode: MODE.REVERSE, reverseFields: { anything: 1 } }),
      (error) => error.message.includes(kind),
      'an undeclared artefact kind must not be extendable',
    );
    assert.throws(
      () => detectReverseContamination({ id: 'N0042' }, kind),
      (error) => error.message.includes(kind),
    );
  }

  // The gate's own view: the frozen bytes are the stage-1 and stage-2 fixtures only,
  // and this ticket introduced no GRAPH or Dirs-Tree artefact among them.
  const observed = readFixtureDigests(PROJECT_ROOT);
  assert.equal(
    Object.keys(observed).some((key) => /GRAPH\.json$|Dirs-Tree\.json$/.test(key)),
    false,
    'this ticket must not have introduced a GRAPH or Dirs-Tree fixture',
  );
});
