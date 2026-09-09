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
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
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

test('review C005 [@verifies C005]: ambiguous normative terms require approvals to finalize', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wst-review-'));
  const specPath = join(dir, 'amb.md');
  const decisionsPath = join(dir, 'amb.json');
  writeFileSync(specPath, '# T\n\n## Rules\n\nMUST NOT 禁止\n');
  const base = { workspace: [], tree: [], ownership: [], dependencies: [], boundaries: [], adapters: { ports: [], databasePolicy: { applicable: false } } };
  writeFileSync(decisionsPath, JSON.stringify({ ...base, approvals: [] }));
  const blocked = run(['finalize', `--spec=${specPath}`, `--decisions=${decisionsPath}`], dir);
  assert.notEqual(blocked.status, 0, 'ambiguous terms without approvals must be blocked');
  assert.equal(existsSync(join(dir, 'WORKSPACIFY-TREE-MANIFEST.json')), false, 'no manifest on blocked run');

  const approvedPath = join(dir, 'approved.json');
  writeFileSync(approvedPath, JSON.stringify({ ...base, approvals: [
    { decisionId: 'MUST NOT', rationale: 'explicitly normative', approver: 'ai' },
    { decisionId: '禁止', rationale: 'explicitly normative', approver: 'ai' },
  ] }));
  const ok = run(['finalize', `--spec=${specPath}`, `--decisions=${approvedPath}`], dir);
  assert.equal(ok.status, 0, ok.stdout);
});

test('claim C005 [@verifies C005]: claim candidates require approval and owner to complete', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wst-claim-'));
  const specPath = join(dir, 'claims.md');
  writeFileSync(specPath, '# T\n\n## Claims\n\n```text\nclaim_order_validity\nStateProofEnvelope\n```\n');
  const base = { tree: [], ownership: [], dependencies: [], boundaries: [], adapters: { ports: [], databasePolicy: { applicable: false } } };
  writeFileSync(join(dir, 'unapproved.json'), JSON.stringify({ ...base, workspace: [], approvals: [] }));
  const blocked = run(['finalize', `--spec=${specPath}`, `--decisions=${join(dir, 'unapproved.json')}`], dir);
  assert.notEqual(blocked.status, 0, 'claims without approvals must be blocked');

  const pkg = { id: 'pkg-p', name: 'p', path: 'crates/protocol/p', layer: 'protocol', kind: 'production-library', responsibilities: ['own'], seed_required: true, owns: { objects: [], claims: ['claim-000001', 'claim-000002'], invariants: [], state_machines: [], error_codes: [], required_tests: [] } };
  const tree = [{ name: 'crates', path: 'crates', kind: 'dir', children: [{ name: 'protocol', path: 'crates/protocol', kind: 'dir', children: [{ name: 'p', path: 'crates/protocol/p', kind: 'dir', children: [] }] }] }];
  writeFileSync(join(dir, 'approved.json'), JSON.stringify({ ...base, workspace: [pkg], tree, approvals: [
    { decisionId: 'claim_order_validity', rationale: 'explicit claim', approver: 'ai' },
    { decisionId: 'StateProofEnvelope', rationale: 'explicit proof', approver: 'ai' },
  ] }));
  const ok = run(['finalize', `--spec=${specPath}`, `--decisions=${join(dir, 'approved.json')}`], dir);
  assert.equal(ok.status, 0, ok.stdout);
});
