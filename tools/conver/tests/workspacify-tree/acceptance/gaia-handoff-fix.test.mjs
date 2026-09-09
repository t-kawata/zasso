// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
// @verifies C005
// [::TICKET::] PX-185: workspacify-tree gaia handoff fix acceptance.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-185 --for-spec --no-implementation-order`

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { checkTreeEntryGate } from '../../../.claude/scripts/workspacify-tree/lib/entry-parity.mjs';

const CONVER_ROOT = process.cwd();
const RUN_SCRIPT = join(CONVER_ROOT, '.claude/scripts/workspacify-tree/run.mjs');

function run(args, cwd) {
  return spawnSync(process.execPath, [RUN_SCRIPT, ...args], { cwd, encoding: 'utf8' });
}

test('fix C001/C002 [@verifies C001][@verifies C002]: invariant and error owners appear and parity passes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wst-fix-'));
  const specPath = join(dir, 'spec.md');
  const decisionsPath = join(dir, 'dec.json');
  writeFileSync(
    specPath,
    '# S\n\n## Object Catalog\n\n| object | kind |\n|--------|------|\n| RuleRecord | record |\n\n## Rules\n\n不変条件: balance >= 0.\nエラーコード E1.\n検査対象: ledger.\n'
  );
  writeFileSync(
    decisionsPath,
    JSON.stringify({
      workspace: [
        {
          id: 'pkg-rules', name: 'rules', path: 'crates/protocol/rules', layer: 'protocol', kind: 'production-library',
          responsibilities: ['own rules'], seed_required: true,
          owns: { objects: ['obj-000001'], claims: [], invariants: ['req-000001'], state_machines: [], error_codes: ['req-000002'], required_tests: ['req-000003'] },
        },
      ],
      tree: [
        { name: 'crates', path: 'crates', kind: 'dir', children: [
          { name: 'protocol', path: 'crates/protocol', kind: 'dir', children: [
            { name: 'rules', path: 'crates/protocol/rules', kind: 'dir', children: [] },
          ] },
        ] },
      ],
      ownership: [{ objectId: 'obj-000001', packageId: 'pkg-rules' }],
      dependencies: [],
      adapters: { ports: [], databasePolicy: { applicable: false } },
      approvals: [],
    })
  );
  const result = run(['finalize', `--spec=${specPath}`, `--decisions=${decisionsPath}`], dir);
  assert.equal(result.status, 0, result.stdout);
  const manifest = JSON.parse(readFileSync(join(dir, 'WORKSPACIFY-TREE-MANIFEST.json'), 'utf8'));
  const categories = manifest.workspace.ownership.entries.map((entry) => `${entry.category}:${entry.inventory_ref}`);
  assert.ok(categories.includes('invariant:req-000001'), 'invariant owner present');
  assert.ok(categories.includes('error_code:req-000002'), 'error code owner present');
  assert.ok(categories.includes('required_test:req-000003'), 'required test owner present');
  const gate = checkTreeEntryGate(manifest, specPath);
  assert.equal(gate.ok, true, JSON.stringify(gate.errors));
});

test('fix C004 [@verifies C004]: multi-package edge without a boundary fails and complete coverage completes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wst-fix-'));
  const specPath = join(dir, 'multi.md');
  const fullPath = join(dir, 'full.json');
  const brokenPath = join(dir, 'broken.json');
  writeFileSync(
    specPath,
    '# M\n\n## Alpha\n\n| object | kind |\n|--------|------|\n| AlphaRecord | record |\n\n## Beta\n\n| object | kind |\n|--------|------|\n| BetaRecord | record |\n'
  );
  const packages = [
    { id: 'pkgA', name: 'a', path: 'crates/protocol/a', layer: 'protocol', kind: 'production-library', responsibilities: ['a'], seed_required: true, owns: { objects: ['obj-000001'], claims: [], invariants: [], state_machines: [], error_codes: [], required_tests: [] } },
    { id: 'pkgB', name: 'b', path: 'crates/protocol/b', layer: 'protocol', kind: 'production-library', responsibilities: ['b'], seed_required: true, owns: { objects: ['obj-000002'], claims: [], invariants: [], state_machines: [], error_codes: [], required_tests: [] } },
  ];
  const tree = [
    { name: 'crates', path: 'crates', kind: 'dir', children: [
      { name: 'protocol', path: 'crates/protocol', kind: 'dir', children: [
        { name: 'a', path: 'crates/protocol/a', kind: 'dir', children: [] },
        { name: 'b', path: 'crates/protocol/b', kind: 'dir', children: [] },
      ] },
    ] },
  ];
  const edge = [{ from: 'pkgA', to: 'pkgB', kind: 'normal', reasonCode: 'port-contract', reason: 'consumer obligation' }];
  writeFileSync(
    fullPath,
    JSON.stringify({
      workspace: packages,
      tree,
      ownership: [
        { objectId: 'obj-000001', packageId: 'pkgA' },
        { objectId: 'obj-000002', packageId: 'pkgB' },
      ],
      dependencies: edge,
      boundaries: [{ consumer: 'pkgA', provider: 'pkgB' }],
      adapters: { ports: [], databasePolicy: { applicable: false } },
      approvals: [],
    })
  );
  writeFileSync(
    brokenPath,
    JSON.stringify({
      workspace: packages,
      tree,
      ownership: [
        { objectId: 'obj-000001', packageId: 'pkgA' },
        { objectId: 'obj-000002', packageId: 'pkgB' },
      ],
      dependencies: edge,
      boundaries: [],
      adapters: { ports: [], databasePolicy: { applicable: false } },
      approvals: [],
    })
  );

  const broken = run(['gate', `--spec=${specPath}`, `--decisions=${brokenPath}`], dir);
  assert.notEqual(broken.status, 0, 'edge without boundary fails');

  const result = run(['finalize', `--spec=${specPath}`, `--decisions=${fullPath}`], dir);
  assert.equal(result.status, 0, result.stdout);
  const manifest = JSON.parse(readFileSync(join(dir, 'WORKSPACIFY-TREE-MANIFEST.json'), 'utf8'));
  assert.equal(manifest.status, 'COMPLETE');
  const gate = checkTreeEntryGate(manifest, specPath);
  assert.equal(gate.ok, true, JSON.stringify(gate.errors));
});
