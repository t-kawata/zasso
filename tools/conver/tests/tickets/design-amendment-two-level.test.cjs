'use strict';

/**
 * PX-405 — two-level artifact resolution and digest-chain verification.
 *
 * The workspace SPEC and the package artifacts live at different levels. One
 * transaction must resolve both, and a root-only invocation must not promote a
 * design change it cannot verify.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  ARTIFACT_KINDS,
  ARTIFACT_STATES,
  resolveArtifactState,
  resolveArtifactStates,
} = require('../../.claude/scripts/tickets/lib/design-amendment-state.js');
const { runAmendment } = require('../../.claude/scripts/tickets/design-amendment.js');
const {
  rebuildDesignHashes,
  verifyAllocateChain,
  verifyFormulaDigest,
} = require('../../.claude/scripts/tickets/rebuild-design-hashes.js');

const BASE_CLAIM = {
  target: { kind: 'clause', id: '§1.1' },
  predicate: 'the clause exists in the design',
  requiredTest: 'UT: clause exists',
  title: 'Missing clause',
  text: 'The clause states the missing constraint.',
};

const CLEAN_RUNNER = () => ({ findings: [], unverifiable: [] });

// [::TICKET::] PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-405 --for-spec --no-implementation-order`.
function tempWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'px405-two-level-'));
  const pkg = path.join(root, 'pkg');
  fs.mkdirSync(pkg, { recursive: true });
  fs.writeFileSync(path.join(root, 'DESIGN.md'), '# Design\n');
  fs.writeFileSync(path.join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), JSON.stringify({
    input: { spec_path: 'DESIGN.md' },
    integrity: {},
  }, null, 2));
  fs.writeFileSync(path.join(pkg, 'RFC.md'), '# RFC\n');
  fs.writeFileSync(path.join(pkg, 'RFC-GRAPH.json'), '{"nodes":[]}\n');
  fs.writeFileSync(path.join(pkg, 'RFC-Dirs-Tree.json'), '{"trees":[]}\n');
  fs.writeFileSync(path.join(pkg, 'Tickets.json'), '{"phases":[]}\n');
  execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
  return { root, pkg };
}

// @verifies C001
test('C001: a package resolves the workspace SPEC through the git root', () => {
  const { root, pkg } = tempWorkspace();

  const state = resolveArtifactState({ kind: ARTIFACT_KINDS.SPEC, cwd: pkg });

  assert.equal(state.state, ARTIFACT_STATES.PRESENT);
  assert.equal(state.path, path.join(fs.realpathSync(root), 'DESIGN.md'));
});

// @verifies C001
test('C001: a directory outside a git workspace reports SPEC absent', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'px405-no-manifest-'));
  fs.writeFileSync(path.join(directory, 'DESIGN.md'), '# Design\n');

  const state = resolveArtifactState({ kind: ARTIFACT_KINDS.SPEC, cwd: directory });

  assert.equal(state.state, ARTIFACT_STATES.ABSENT);
});

// @verifies C001
test('C001: an unreadable workspace manifest is an accurate error, not absent', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'px405-bad-manifest-'));
  fs.writeFileSync(path.join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), '{not json');
  const pkg = path.join(root, 'pkg');
  fs.mkdirSync(pkg);
  execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });

  const state = resolveArtifactState({ kind: ARTIFACT_KINDS.SPEC, cwd: pkg });

  assert.equal(state.state, ARTIFACT_STATES.UNREADABLE);
  assert.equal(state.code, 'UNREADABLE_ARTIFACT');
});

// @verifies C002
test('C002: one transaction resolves the workspace SPEC and the package artifacts', () => {
  const { root, pkg } = tempWorkspace();

  const states = resolveArtifactStates({ cwd: pkg });

  assert.equal(states.find((entry) => entry.kind === ARTIFACT_KINDS.SPEC).state, ARTIFACT_STATES.PRESENT);
  assert.equal(states.find((entry) => entry.kind === ARTIFACT_KINDS.RFC).state, ARTIFACT_STATES.PRESENT);
  assert.equal(states.find((entry) => entry.kind === ARTIFACT_KINDS.GRAPH).state, ARTIFACT_STATES.PRESENT);
  assert.equal(states.find((entry) => entry.kind === ARTIFACT_KINDS.DIRS_TREE).state, ARTIFACT_STATES.PRESENT);
  assert.equal(states.find((entry) => entry.kind === ARTIFACT_KINDS.TICKETS).state, ARTIFACT_STATES.PRESENT);
});

// @verifies C002
test('C002: a SPEC dry-run leaves both levels byte-identical', async () => {
  const { root, pkg } = tempWorkspace();
  const before = fs.readFileSync(path.join(root, 'DESIGN.md'));

  const result = await runAmendment({
    cwd: pkg,
    ticketKey: 'PX-405',
    artifact: 'spec',
    claim: BASE_CLAIM,
    dryRun: true,
    gateRunner: CLEAN_RUNNER,
  });

  assert.equal(result.outcome, 'dry-run');
  assert.ok(fs.readFileSync(path.join(root, 'DESIGN.md')).equals(before));
});

// @verifies C002
test('C002: a root-only SPEC apply cannot promote an unverifiable change', async () => {
  const { root } = tempWorkspace();
  const before = fs.readFileSync(path.join(root, 'DESIGN.md'));

  const result = await runAmendment({
    cwd: root,
    ticketKey: 'PX-405',
    artifact: 'spec',
    claim: BASE_CLAIM,
    dryRun: false,
    gateRunner: () => ({ findings: [], unverifiable: [{ name: 'chain', reason: 'missing:graph,dirs-tree,tickets' }] }),
  });

  assert.notEqual(result.outcome, 'promoted');
  assert.equal(result.findings.some((finding) => finding.code === 'GATE_UNVERIFIABLE'), true);
  assert.ok(fs.readFileSync(path.join(root, 'DESIGN.md')).equals(before));
});

// @verifies C004
test('C004: the digest chain rebuild is idempotent and the tree self-hash survives reload', async () => {
  const { root, pkg } = tempWorkspace();
  const { computeSelfHash } = await import('../../.claude/scripts/workspacify-tree/lib/render.mjs');

  const first = await rebuildDesignHashes({ cwd: pkg });
  const second = await rebuildDesignHashes({ cwd: pkg });

  assert.equal(first.digest, second.digest);
  const tree = JSON.parse(fs.readFileSync(path.join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), 'utf8'));
  assert.equal(tree.integrity.manifest_hash, computeSelfHash(tree));
});

// @verifies C004
test('C004: an allocate chain and a formula digest that agree report no finding', async () => {
  const { root, pkg } = tempWorkspace();
  const { computeAllocateSelfHash } = await import('../../.claude/scripts/workspacify-allocate/lib/allocate-manifest.mjs');
  const { computeRfcDigest } = await import('../../.claude/scripts/spec-formula/ledger.mjs');
  const { createHash } = require('node:crypto');

  await rebuildDesignHashes({ cwd: pkg });
  const tree = JSON.parse(fs.readFileSync(path.join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), 'utf8'));

  const seedPath = path.join(pkg, 'RFC-SEED.md');
  const seedText = '# Seed\n\n```json\n' + JSON.stringify({
    stage1_manifest: { path: 'WORKSPACIFY-TREE-MANIFEST.json', hash: tree.integrity.manifest_hash },
  }) + '\n```\n';
  fs.writeFileSync(seedPath, seedText);
  const seedHash = createHash('sha256').update(fs.readFileSync(seedPath)).digest('hex');

  const allocate = {
    artifact_kind: 'workspacify-allocate-manifest',
    input_tree_manifest: {
      path: 'WORKSPACIFY-TREE-MANIFEST.json',
      hash: tree.integrity.manifest_hash,
      spec: { path: 'DESIGN.md', sha256: tree.input.source_hash },
    },
    seed_index: [{ package: 'pkg', path: 'pkg/RFC-SEED.md', sha256: seedHash }],
    integrity: { canonicalization: 'workspacify-allocate-json-v1', manifest_hash: '', reload_validation: 'READY' },
  };
  allocate.integrity.manifest_hash = computeAllocateSelfHash(allocate);
  fs.writeFileSync(path.join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), JSON.stringify(allocate, null, 2) + '\n');

  const rfcPath = path.join(pkg, 'RFC.md');
  fs.writeFileSync(path.join(pkg, 'RFC-FORMULAS.json'), JSON.stringify({
    version: 1,
    rfcDigest: computeRfcDigest(fs.readFileSync(rfcPath, 'utf8')),
    formulas: [],
  }, null, 2) + '\n');

  assert.deepEqual((await verifyAllocateChain({ workspaceRoot: root })).findings, []);
  assert.deepEqual((await verifyFormulaDigest({ packageDir: pkg, rfcPath })).findings, []);
});

// @verifies C004
test('C004: a stale allocate chain and a stale formula digest are named findings', async () => {
  const { root, pkg } = tempWorkspace();
  const { computeAllocateSelfHash } = await import('../../.claude/scripts/workspacify-allocate/lib/allocate-manifest.mjs');

  await rebuildDesignHashes({ cwd: pkg });
  const tree = JSON.parse(fs.readFileSync(path.join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), 'utf8'));
  const seedPath = path.join(pkg, 'RFC-SEED.md');
  fs.writeFileSync(seedPath, '# Seed\n\n```json\n' + JSON.stringify({
    stage1_manifest: { path: 'WORKSPACIFY-TREE-MANIFEST.json', hash: 'stale' },
  }) + '\n```\n');
  const { createHash } = require('node:crypto');
  const seedHash = createHash('sha256').update(fs.readFileSync(seedPath)).digest('hex');

  const allocate = {
    artifact_kind: 'workspacify-allocate-manifest',
    input_tree_manifest: {
      path: 'WORKSPACIFY-TREE-MANIFEST.json',
      hash: 'stale',
      spec: { path: 'DESIGN.md', sha256: tree.input.source_hash },
    },
    seed_index: [{ package: 'pkg', path: 'pkg/RFC-SEED.md', sha256: seedHash }],
    integrity: { canonicalization: 'workspacify-allocate-json-v1', manifest_hash: '', reload_validation: 'READY' },
  };
  allocate.integrity.manifest_hash = computeAllocateSelfHash(allocate);
  fs.writeFileSync(path.join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), JSON.stringify(allocate, null, 2) + '\n');

  const rfcPath = path.join(pkg, 'RFC.md');
  fs.writeFileSync(path.join(pkg, 'RFC-FORMULAS.json'), JSON.stringify({
    version: 1,
    rfcDigest: 'stale',
    formulas: [],
  }, null, 2) + '\n');

  const allocateFindings = (await verifyAllocateChain({ workspaceRoot: root })).findings;
  const formulaFindings = (await verifyFormulaDigest({ packageDir: pkg, rfcPath })).findings;

  assert.equal(allocateFindings.some((finding) => finding.code === 'ALLOCATE_CHAIN_STALE'), true);
  assert.equal(allocateFindings.some((finding) => finding.code === 'ALLOCATE_SEED_REFERENCE_STALE'), true);
  assert.equal(formulaFindings.some((finding) => finding.code === 'FORMULA_DIGEST_STALE'), true);
});
