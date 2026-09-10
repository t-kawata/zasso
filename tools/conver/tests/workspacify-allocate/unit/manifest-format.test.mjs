// [::TICKET::] PX-189 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-189 --for-spec --no-implementation-order`.
// PX-189 @verifies C001
// The entry gate must reject a manifest that is not in the stage-1 format and say
// so in natural English, before any stage-2 work starts. Format means shape and
// value domain (types, enums, arrays) — not tree/ownership consistency, which is
// the plan gate's job.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkAllocateEntryGate } from '../../../.claude/scripts/workspacify-allocate/lib/tree-manifest-input.mjs';
import { MANIFEST_FORMAT_LEAD } from '../../../.claude/scripts/workspacify-allocate/lib/manifest-format.mjs';
import { buildValidManifest, materializeSeedFixture } from '../helpers/build-valid-manifest.mjs';

const RUN = fileURLToPath(new URL('../../../.claude/scripts/workspacify-allocate/run.mjs', import.meta.url));

function clone(manifest) {
  return JSON.parse(JSON.stringify(manifest));
}

/** A format-valid manifest that carries a real package, tree leaf and ownership entry. */
function fullManifest() {
  return buildValidManifest({
    workspace: {
      tree: [{ name: 'crates', path: 'crates', kind: 'dir', children: [] }],
      packages: [
        { id: 'pkg-a', name: 'alpha', path: 'crates', layer: 'protocol', kind: 'production-library', seed_required: true, owns: { objects: ['obj-000001'] } },
      ],
      ownership: {
        entries: [{ inventory_ref: 'obj-000001', canonical_name: 'obj-000001', category: 'object', owner_package: 'pkg-a' }],
        packages: ['pkg-a'],
      },
    },
    inventory: {
      objects: [{ id: 'obj-000001' }], claims: [], invariants: [], state_machines: [], error_codes: [],
      required_tests: [], terms: [], normalization_decisions: [], unresolved_candidates: [],
    },
  }).manifest;
}

function isFormatFailure(gate) {
  return !gate.ok && gate.errors[0] === MANIFEST_FORMAT_LEAD;
}

test('C001 a package layer outside the stage-1 layer set is a format failure', () => {
  const manifest = fullManifest();
  manifest.workspace.packages[0].layer = 'nonsense-layer';
  const gate = checkAllocateEntryGate(manifest, process.cwd());
  assert.ok(isFormatFailure(gate), JSON.stringify(gate.errors));
  assert.ok(gate.errors.some((err) => err.includes('workspace.packages[0].layer')));
  assert.ok(gate.errors.some((err) => err.includes('nonsense-layer')));
});

test('C001 a package path that is not a string is a format failure', () => {
  const manifest = fullManifest();
  manifest.workspace.packages[0].path = 42;
  const gate = checkAllocateEntryGate(manifest, process.cwd());
  assert.ok(isFormatFailure(gate), JSON.stringify(gate.errors));
  assert.ok(gate.errors.some((err) => err.includes('workspace.packages[0].path')));
});

test('C001 a missing section is a format failure that names the section', () => {
  const manifest = fullManifest();
  delete manifest.workspace;
  const gate = checkAllocateEntryGate(manifest, process.cwd());
  assert.ok(isFormatFailure(gate), JSON.stringify(gate.errors));
  assert.ok(gate.errors.some((err) => err.includes('workspace')));
});

test('C001 a non-array inventory category is a format failure', () => {
  const manifest = fullManifest();
  manifest.inventory.objects = { 'obj-000001': true };
  const gate = checkAllocateEntryGate(manifest, process.cwd());
  assert.ok(isFormatFailure(gate), JSON.stringify(gate.errors));
  assert.ok(gate.errors.some((err) => err.includes('inventory.objects')));
});

test('C001 format failures short-circuit: no downstream gate reason is reported', () => {
  const manifest = fullManifest();
  manifest.workspace.packages[0].kind = 'not-a-package-kind';
  manifest.integrity.manifest_hash = '0'.repeat(64); // also breaks the self-hash
  const gate = checkAllocateEntryGate(manifest, process.cwd());
  assert.ok(isFormatFailure(gate), JSON.stringify(gate.errors));
  assert.ok(!gate.errors.some((err) => err.includes('self-hash')));
});

test('C001 a format-valid but tree-inconsistent manifest is not a format failure', () => {
  const manifest = fullManifest();
  manifest.workspace.packages.push({
    id: 'pkg-c', name: 'gamma', path: 'crates/protocol/gamma', layer: 'protocol',
    kind: 'production-library', seed_required: true, owns: {},
  });
  const gate = checkAllocateEntryGate(manifest, process.cwd());
  assert.equal(gate.errors[0] === MANIFEST_FORMAT_LEAD, false, JSON.stringify(gate.errors));
});

test('C001 wrong value kinds are format failures that name the offending path', () => {
  const cases = [
    { label: 'section is an array', mutate: (m) => { m.workspace = []; }, expected: 'workspace must be an object but is an array.' },
    { label: 'section is null', mutate: (m) => { m.input = null; }, expected: 'input must be an object but is null.' },
    { label: 'scalar is a boolean', mutate: (m) => { m.status = true; }, expected: 'status must be a string but is a boolean.' },
    { label: 'list is a string', mutate: (m) => { m.dependencies.normal_edges = 'none'; }, expected: 'dependencies.normal_edges must be an array but is a string.' },
    { label: 'seed_required is not a boolean', mutate: (m) => { m.workspace.packages[0].seed_required = 'yes'; }, expected: 'workspace.packages[0].seed_required must be a boolean but is a string.' },
    { label: 'owns is an array', mutate: (m) => { m.workspace.packages[0].owns = []; }, expected: 'workspace.packages[0].owns must be an object but is an array.' },
    { label: 'package is not an object', mutate: (m) => { m.workspace.packages[0] = 'pkg-a'; }, expected: 'workspace.packages[0] must be an object but is a string.' },
    { label: 'ownership entry field is missing', mutate: (m) => { delete m.workspace.ownership.entries[0].owner_package; }, expected: 'workspace.ownership.entries[0].owner_package must be a string but is missing.' },
    { label: 'ownership entry is not an object', mutate: (m) => { m.workspace.ownership.entries[0] = 'obj-000001'; }, expected: 'workspace.ownership.entries[0] must be an object but is a string.' },
  ];
  for (const item of cases) {
    const manifest = fullManifest();
    item.mutate(manifest);
    const gate = checkAllocateEntryGate(manifest, process.cwd());
    assert.ok(isFormatFailure(gate), `${item.label}: ${JSON.stringify(gate.errors)}`);
    assert.ok(gate.errors.includes(item.expected), `${item.label}: ${JSON.stringify(gate.errors)}`);
  }
});

test('C001 a value that is not a JSON object at all is a format failure', () => {
  const gate = checkAllocateEntryGate('not a manifest', process.cwd());
  assert.ok(isFormatFailure(gate), JSON.stringify(gate.errors));
  assert.ok(gate.errors[1].includes('must be a JSON object'));
});

test('C001 validate announces the interruption in English for a format-invalid manifest', () => {
  const { dir, manifestPath } = materializeSeedFixture();
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.workspace.packages[0].layer = 'nonsense-layer';
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const result = spawnSync(process.execPath, [RUN, 'validate', manifestPath], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.equal(JSON.parse(result.stdout).gateId, 'G0');
    assert.ok(result.stderr.includes('interrupted'), result.stderr);
    assert.ok(result.stderr.includes('stage-1'), result.stderr);
    assert.ok(result.stderr.includes('workspace.packages[0].layer'), result.stderr);
    // The reason must read as sentences, not as fragments glued with '; '.
    assert.ok(result.stderr.includes('stage-2 work. workspace.packages[0].layer'), result.stderr);
    assert.ok(!result.stderr.includes('..'), result.stderr);
    // …and it must tell the AI what to do next.
    assert.match(result.stderr, /re-run \/workspacify-tree/i, result.stderr);
    // The failure also carries kind advice: what happened, why, and how to fix it.
    assert.match(result.stderr, /What happened:/);
    assert.match(result.stderr, /Why this matters:/);
    assert.match(result.stderr, /How to fix it:/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
