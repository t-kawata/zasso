// [::TICKET::] PX-208 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-208 --for-spec --no-implementation-order`.
// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
/**
 * layer-direction — the forward rotation does not depend on the reverse tree.
 *
 * P22-10 introduced `forward-extensions.mjs`, the single declaration of the
 * reverse-only field vocabulary, and filed it inside `.claude/scripts/workspacify-reverse/`.
 * Two files that existed before that ticket then had to import it:
 * `tickets/update-ticket.js` and `workspacify-allocate/lib/seed-render.mjs`. That
 * is the wrong way round — a new layer may depend on the existing ones, not the
 * reverse — and it created a directory-level cycle, `workspacify-allocate` to
 * `workspacify-reverse` and back, that did not exist before.
 *
 * Measured 2026-09-11, nothing inside the reverse tree imports that module: it is a
 * forward module that happened to be filed in the reverse tree, so the repair is a
 * move rather than an inversion. The assertion here is what keeps it moved.
 *
 * The three files that legitimately import the reverse tree are ones this branch
 * created, and each is a reverse-mode entry point. They are named in an allowlist
 * rather than inferred, because "is this file a reverse entry point" is a fact
 * about its purpose and not something derivable from its contents.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  ALLOWLISTED_REVERSE_ENTRY_POINTS,
  FORWARD_EXTENSIONS_PATH,
  OLD_FORWARD_EXTENSIONS_PATH,
  REVERSE_TREE,
  SCRIPT_ROOT,
  assertLayersOneWay,
  collectImportersOf,
  collectReverseImporters,
  importerPathOf,
  isRealImport,
} from '../../../tests/lib/layer-direction.mjs';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
// [::TICKET::] PX-207 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-207 --for-spec --no-implementation-order`.
// [::TICKET::] PX-206 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-206 --for-spec --no-implementation-order`.
// [::TICKET::] PX-207 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-207 --for-spec --no-implementation-order`.
const require$cjs = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// C001 — the importer set is computed from the tree, and prose is not an import
// ---------------------------------------------------------------------------

test('C001 the scanned roots exist and the reverse tree is resolvable', () => {
  assert.equal(existsSync(join(PROJECT_ROOT, SCRIPT_ROOT)), true);
  assert.equal(existsSync(join(PROJECT_ROOT, REVERSE_TREE)), true, 'the tree being depended on must exist to resolve specifiers');
});

test('C001 the importer set is exactly the allowlisted reverse entry points', () => {
  const importers = collectReverseImporters(join(PROJECT_ROOT, SCRIPT_ROOT));

  assert.deepEqual(
    [...new Set(importers.map((entry) => importerPathOf(entry.importingPath)))].sort(),
    ALLOWLISTED_REVERSE_ENTRY_POINTS.map((entry) => entry.path).sort(),
  );
  for (const entry of importers) {
    assert.ok(entry.importedPath.includes('workspacify-reverse'), `${entry.importingPath} must import the reverse tree`);
  }
});

test('C001 a prose mention is not an import', () => {
  assert.equal(isRealImport('// see workspacify-reverse/lib/forward-extensions.mjs', 'x.mjs'), false);
  assert.equal(isRealImport(' * `workspacify-reverse/lib/forward-extensions.mjs` names the field', 'x.js'), false);
  assert.equal(isRealImport("import { a } from '../workspacify-reverse/lib/a.mjs';", join('scripts', 'x.mjs')), true);
  assert.equal(isRealImport("const loaded = require('../workspacify-reverse/lib/a.mjs');", join('scripts', 'x.js')), true);
  assert.equal(
    isRealImport("path.join(PROJECT_ROOT, '.claude/scripts/workspacify-reverse/lib/a.mjs')", join('scripts', 'x.js')),
    true,
    'a dynamic import built from a literal path is still an import',
  );
});

// ---------------------------------------------------------------------------
// C002 — set equality, and a permission nobody uses is a failure
// ---------------------------------------------------------------------------

test('C002 the allowlist names the ticket that created each entry', () => {
  assert.ok(ALLOWLISTED_REVERSE_ENTRY_POINTS.length > 0);
  for (const entry of ALLOWLISTED_REVERSE_ENTRY_POINTS) {
    assert.match(entry.ticket, /^P\d+-\d+$/, `${entry.path} must name the ticket that created it`);
    assert.ok(
      /reverse|red-reconstruction|normative-decision/.test(entry.path),
      `${entry.path} must be marked as a reverse entry point by its name`,
    );
  }
});

test('C002 assertLayersOneWay reports violations and stale permissions', () => {
  const allowlist = [{ path: 'conver/red-reconstruction.js', ticket: 'P22-19' }];
  const importer = (importingPath) => ({ importingPath, importedPath: '../workspacify-reverse/lib/x.mjs' });

  const clean = assertLayersOneWay({ importers: [importer('conver/red-reconstruction.js')], allowlist });
  assert.equal(clean.ok, true);
  assert.deepEqual(clean.violations, []);
  assert.deepEqual(clean.stale, []);

  const violating = assertLayersOneWay({
    importers: [importer('conver/red-reconstruction.js'), importer('rfc-graph/crud.js')],
    allowlist,
  });
  assert.equal(violating.ok, false);
  assert.deepEqual(violating.violations.map((entry) => entry.importingPath), ['rfc-graph/crud.js']);

  const stale = assertLayersOneWay({ importers: [], allowlist });
  assert.equal(stale.ok, false, 'a permission nobody uses must fail rather than pass silently');
  assert.deepEqual(stale.stale, ['conver/red-reconstruction.js']);
});

test('C002 the comparison is set equality, not containment', () => {
  const allowlist = [
    { path: 'a.js', ticket: 'P22-19' },
    { path: 'b.js', ticket: 'P22-13' },
  ];
  const importer = (importingPath) => ({ importingPath, importedPath: '../workspacify-reverse/lib/x.mjs' });

  assert.equal(assertLayersOneWay({ importers: [importer('a.js')], allowlist }).ok, false, 'a missing entry fails');
  assert.equal(
    assertLayersOneWay({ importers: [importer('a.js'), importer('b.js'), importer('c.js')], allowlist }).ok,
    false,
    'an extra entry fails',
  );
  assert.equal(
    assertLayersOneWay({ importers: [importer('b.js'), importer('a.js')], allowlist }).ok,
    true,
    'order is not part of the comparison',
  );
});

// ---------------------------------------------------------------------------
// C003 — forward mode returns the artefact itself
// ---------------------------------------------------------------------------

test('C003 the artefact kind and the modes are declared', () => {
  const module = require$cjs(join(PROJECT_ROOT, FORWARD_EXTENSIONS_PATH));
  assert.equal(module.FORWARD_ARTIFACT_KINDS.RFC_SEED, 'rfc_seed');
  assert.deepEqual(Object.values(module.MODE).sort(), ['forward', 'reverse']);
});

test('C003 forward mode returns the identical reference; reverse mode extends', () => {
  const { FORWARD_ARTIFACT_KINDS, MODE, assertReverseAdditions, extendForwardArtifacts } = require$cjs(
    join(PROJECT_ROOT, FORWARD_EXTENSIONS_PATH),
  );
  const artefact = { package: 'alpha' };

  const forwarded = extendForwardArtifacts(artefact, { kind: FORWARD_ARTIFACT_KINDS.RFC_SEED, mode: MODE.FORWARD });
  assert.equal(forwarded, artefact, 'reference identity is the contract, not deep equality');

  const reversed = extendForwardArtifacts(artefact, {
    kind: FORWARD_ARTIFACT_KINDS.RFC_SEED,
    mode: MODE.REVERSE,
    reverseFields: { reverse_index: [{ claim_id: 'clm-1' }], sidecar_reference: { bundle_hash: 'sha256:abc' } },
  });
  assert.notEqual(reversed, artefact);
  assert.deepEqual(reversed.reverse_index, [{ claim_id: 'clm-1' }]);
  assert.equal(reversed.sidecar_reference.bundle_hash, 'sha256:abc');
  assert.doesNotThrow(() => assertReverseAdditions(reversed, FORWARD_ARTIFACT_KINDS.RFC_SEED));
});

test('C003 the forward artefact is unchanged by the call', () => {
  const { FORWARD_ARTIFACT_KINDS, MODE, extendForwardArtifacts } = require$cjs(
    join(PROJECT_ROOT, FORWARD_EXTENSIONS_PATH),
  );
  const artefact = { package: 'alpha', nested: { deep: [1, 2, 3] } };
  const before = JSON.stringify(artefact);

  const result = extendForwardArtifacts(artefact, { kind: FORWARD_ARTIFACT_KINDS.RESIDUAL, mode: MODE.FORWARD });

  assert.equal(JSON.stringify(result), before);
  assert.equal(JSON.stringify(artefact), before);
});

// ---------------------------------------------------------------------------
// C004 — the move is complete: one declaration, one destination
// ---------------------------------------------------------------------------

test('C004 exactly one declaration of the reverse field vocabulary exists', () => {
  assert.equal(existsSync(join(PROJECT_ROOT, FORWARD_EXTENSIONS_PATH)), true, FORWARD_EXTENSIONS_PATH + ' must exist');
  assert.equal(
    existsSync(join(PROJECT_ROOT, OLD_FORWARD_EXTENSIONS_PATH)),
    false,
    'a leftover copy would be a second, silently drifting declaration',
  );
});

test('C004 every importer resolves to that one destination', async () => {
  const importers = collectImportersOf(join(PROJECT_ROOT, SCRIPT_ROOT), 'forward-extensions.mjs');
  const destinations = new Set(importers.map((entry) => entry.resolvedPath));
  assert.deepEqual(
    [...destinations],
    [join(PROJECT_ROOT, FORWARD_EXTENSIONS_PATH)],
    'every specifier must resolve to the one declaration, whatever it is spelled from',
  );

  const module = await import(pathToFileURL(join(PROJECT_ROOT, FORWARD_EXTENSIONS_PATH)).href);
  assert.equal(typeof module.extendForwardArtifacts, 'function');
});

test('C004 the forward writer still loads after the move', () => {
  const updateTicket = require$cjs(join(PROJECT_ROOT, '.claude/scripts/tickets/update-ticket.js'));
  assert.equal(typeof updateTicket, 'object', 'update-ticket.js must still load: it is the writer the loop uses on every ticket');
});

test('C004 the exported surface survived the move', () => {
  const module = require$cjs(join(PROJECT_ROOT, FORWARD_EXTENSIONS_PATH));
  for (const name of [
    'REVERSE_EXTENSION_GATE_ID',
    'FORWARD_ARTIFACT_KINDS',
    'MODE',
    'TICKET_ORIGIN_KINDS',
    'FORWARD_ORIGIN_KIND',
    'REVERSE_FIELD_NAMES',
    'reverseModeOf',
    'declaredReverseFieldNames',
    'detectReverseContamination',
    'extendForwardArtifacts',
    'assertReverseAdditions',
    'assertForwardByteIdentity',
    'sidecarReference',
    'headingCount',
  ]) {
    assert.ok(name in module, `${name} must survive the move`);
  }
});

// ---------------------------------------------------------------------------
// The scan is recomputed, not remembered
// ---------------------------------------------------------------------------

test('C001 a new importer appears in a re-scan with no stored list changing', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'px206-layer-'));
  try {
    mkdirSync(join(scratch, 'newcomer'), { recursive: true });
    writeFileSync(join(scratch, 'newcomer', 'a.js'), "require('../workspacify-reverse/lib/x.mjs');\n");

    const first = collectReverseImporters(scratch);
    assert.equal(first.length, 1, 'a new importer must appear without any stored list being edited');

    writeFileSync(join(scratch, 'newcomer', 'b.js'), "import x from '../workspacify-reverse/lib/y.mjs';\n");
    assert.equal(collectReverseImporters(scratch).length, 2);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test('C001 the reverse tree is not reported for importing itself', () => {
  const importers = collectReverseImporters(join(PROJECT_ROOT, SCRIPT_ROOT));
  for (const entry of importers) {
    assert.equal(
      entry.importingPath.startsWith(join(PROJECT_ROOT, REVERSE_TREE)),
      false,
      `${entry.importingPath} is inside the reverse tree and must not be reported`,
    );
  }
});

test('C001 the scan reports a missing tree rather than an empty set', () => {
  assert.throws(
    () => collectReverseImporters(join(tmpdir(), 'px206-does-not-exist-' + Date.now())),
    /not found|does not exist|absent/i,
  );
});
