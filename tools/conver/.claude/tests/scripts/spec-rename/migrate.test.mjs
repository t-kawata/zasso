import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

import { computeSelfHash } from '../../../scripts/workspacify-tree/lib/render.mjs';
import {
  computeAllocateSelfHash,
  resealAllocateManifest,
} from '../../../scripts/workspacify-allocate/lib/allocate-manifest.mjs';
import {
  classify,
  apply,
  verify,
  assertWritable,
  migrateEduceIdentity,
} from '../../../scripts/spec-rename/migrate.mjs';

const require = createRequire(import.meta.url);
const { verifyAllocateChain } = require('../../../scripts/tickets/rebuild-design-hashes.js');

const OLD_SPEC = 'GaiaSekkeiShiyousho_v32.md';
const NEW_SPEC = 'SYSTEM-DESIGN.md';
const OLD_SEQ_JSON = 'GaiaSekkeiShiyousho_v32-sequences.json';
const NEW_SEQ_JSON = 'SYSTEM-DESIGN-sequences.json';
const OLD_SEQ_MD = 'GaiaSekkeiShiyousho_v32-sequences.md';
const NEW_SEQ_MD = 'SYSTEM-DESIGN-sequences.md';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

// [::TICKET::] PX-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-1 --for-spec --no-implementation-order`.
function buildFixture() {
  const root = mkdtempSync(join(tmpdir(), 'spec-rename-'));
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test');

  const specBytes = Buffer.from('# Gaia design specification v32\n');
  const specSha = sha256(specBytes);
  writeFileSync(join(root, OLD_SPEC), specBytes);
  writeFileSync(join(root, OLD_SEQ_JSON), JSON.stringify({ spec: { path: OLD_SPEC, sha256: specSha, lines: 1 }, sequences: [] }, null, 2));
  writeFileSync(join(root, OLD_SEQ_MD), `# ${OLD_SPEC} — sequences\n`);

  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src/ref.md'), `see ${OLD_SPEC}\n`);
  mkdirSync(join(root, 'regeneration/archive/x'), { recursive: true });
  writeFileSync(join(root, 'regeneration/archive/x/old.md'), `${OLD_SPEC}\n`);

  const tree = {
    input: {
      spec_path: OLD_SPEC,
      source_hash: specSha,
      source_bytes: specBytes.length,
      source_characters: 1,
      source_lines: 1,
    },
    workspace: {
      packages: [
        { id: 'pkg-0001', name: 'x', path: 'crates/x', layer: 'protocol', kind: 'production-library', responsibilities: ['owns x'] },
      ],
    },
    integrity: { manifest_hash: '' },
  };
  tree.integrity.manifest_hash = computeSelfHash(tree);
  writeFileSync(join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), JSON.stringify(tree, null, 2));

  mkdirSync(join(root, 'crates/x'), { recursive: true });
  const seed = [
    '# RFC Seed: x',
    '',
    '```json',
    JSON.stringify({
      package: tree.workspace.packages[0],
      source_spec: { path: OLD_SPEC, sha256: specSha },
      stage1_manifest: { path: 'WORKSPACIFY-TREE-MANIFEST.json', hash: tree.integrity.manifest_hash },
      implementation_order: { before: [], after: [], parallel_with: [], serial_index: 0, wave: 0 },
      contract_refs: [],
      source_segments: [],
    }, null, 2),
    '```',
    '',
  ].join('\n');
  writeFileSync(join(root, 'crates/x/RFC-SEED.md'), seed);

  const allocate = {
    input_tree_manifest: {
      path: 'WORKSPACIFY-TREE-MANIFEST.json',
      hash: tree.integrity.manifest_hash,
      spec: { path: OLD_SPEC, sha256: specSha },
    },
    seed_index: [{ package: 'pkg-0001', path: 'crates/x/RFC-SEED.md', sha256: sha256(Buffer.from(seed)) }],
    integrity: { manifest_hash: '' },
  };
  allocate.integrity.manifest_hash = computeAllocateSelfHash(allocate);
  writeFileSync(join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), JSON.stringify(allocate, null, 2));

  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'fixture');
  return { root, specSha, treeHash: tree.integrity.manifest_hash };
}

test('C001 precondition: one sequences artifact and a live/frozen partition', async () => {
  const { root, specSha } = buildFixture();
  const report = await classify({ root });
  assert.equal(report.ok, true);
  assert.deepEqual(report.renames.map((r) => r.from).sort(), [OLD_SPEC, OLD_SEQ_JSON, OLD_SEQ_MD].sort());
  assert.equal(report.sequencesArtifacts.length, 1);
  assert.equal(report.renames.find((r) => r.from === OLD_SPEC).sha256, specSha);
  assert.ok(report.live.some((f) => f.path === 'src/ref.md' && f.occurrences === 1));
  assert.ok(report.frozen.some((f) => f.path === 'regeneration/archive/x/old.md'));
});

test('C001 postcondition: rename, live rewrite, frozen untouched', async () => {
  const { root } = buildFixture();
  const frozenBefore = sha256(readFileSync(join(root, 'regeneration/archive/x/old.md')));
  await apply({ root, ticketPaths: [] });
  assert.equal(existsSync(join(root, NEW_SPEC)), true);
  assert.equal(existsSync(join(root, NEW_SEQ_JSON)), true);
  assert.equal(existsSync(join(root, NEW_SEQ_MD)), true);
  assert.equal(existsSync(join(root, OLD_SPEC)), false);
  assert.match(git(root, 'status', '--porcelain'), /^R\s+GaiaSekkeiShiyousho_v32\.md -> SYSTEM-DESIGN\.md/m);
  assert.equal(readFileSync(join(root, 'src/ref.md'), 'utf8').includes('GaiaSekkeiShiyousho_v32'), false);
  assert.equal(readFileSync(join(root, 'regeneration/archive/x/old.md'), 'utf8').includes('GaiaSekkeiShiyousho_v32'), true);
  assert.equal(sha256(readFileSync(join(root, 'regeneration/archive/x/old.md'))), frozenBefore);
});

test('C001 invariant: spec bytes stay identical', async () => {
  const { root } = buildFixture();
  const before = sha256(readFileSync(join(root, OLD_SPEC)));
  await apply({ root, ticketPaths: [] });
  assert.equal(sha256(readFileSync(join(root, NEW_SPEC))), before);

  const second = buildFixture();
  await assert.rejects(
    () => apply({ root: second.root, expectedSpecSha256: '0'.repeat(64), ticketPaths: [] }),
    /SPEC_BYTES_WOULD_CHANGE/,
  );
  assert.equal(existsSync(join(second.root, OLD_SPEC)), true);
});

test('C001 errors: idempotence, ambiguity, frozen refusal, atomicity', async () => {
  const first = buildFixture();
  await apply({ root: first.root, ticketPaths: [] });
  await assert.rejects(() => apply({ root: first.root, ticketPaths: [] }), /ALREADY_MIGRATED/);

  const two = buildFixture();
  writeFileSync(join(two.root, 'OTHER-sequences.json'), '{}');
  const ambiguous = await classify({ root: two.root });
  assert.equal(ambiguous.ok, false);
  assert.ok(ambiguous.findings.some((finding) => finding.code === 'AMBIGUOUS_SEQUENCES_ARTIFACT'));
  await assert.rejects(() => apply({ root: two.root, ticketPaths: [] }), /AMBIGUOUS_SEQUENCES_ARTIFACT/);

  const frozen = buildFixture();
  assert.throws(() => assertWritable(frozen.root, 'regeneration/archive/x/old.md'), /FROZEN_PATH_WRITE_REFUSED/);

  const ro = buildFixture();
  chmodSync(join(ro.root, 'src'), 0o555);
  const before = sha256(readFileSync(join(ro.root, 'src/ref.md')));
  await assert.rejects(() => apply({ root: ro.root, ticketPaths: [] }), /EACCES|EPERM|LIVE_REWRITE_FAILED/);
  assert.equal(sha256(readFileSync(join(ro.root, 'src/ref.md'))), before);
  chmodSync(join(ro.root, 'src'), 0o755);
});

test('C002 tree reseal uses the owner hash', async () => {
  const { root, specSha } = buildFixture();
  await apply({ root, ticketPaths: [] });
  const manifest = readJson(join(root, 'WORKSPACIFY-TREE-MANIFEST.json'));
  assert.equal(manifest.input.spec_path, NEW_SPEC);
  assert.equal(manifest.input.source_hash, specSha);
  assert.equal(computeSelfHash(manifest), manifest.integrity.manifest_hash);
});

test('C002 allocate reseal corrects a stale seed index', () => {
  const { root } = buildFixture();
  const treePath = join(root, 'WORKSPACIFY-TREE-MANIFEST.json');
  const tree = readJson(treePath);
  tree.input.spec_path = NEW_SPEC;
  tree.integrity.manifest_hash = computeSelfHash(tree);
  writeFileSync(treePath, JSON.stringify(tree, null, 2));
  const allocate = readJson(join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'));
  allocate.seed_index[0].sha256 = 'stale';
  const resealed = resealAllocateManifest(allocate, { workspaceRoot: root });
  const seedBytes = readFileSync(join(root, resealed.seed_index[0].path));
  assert.equal(resealed.seed_index[0].sha256, sha256(seedBytes));
  assert.equal(resealed.input_tree_manifest.spec.path, NEW_SPEC);
  assert.equal(computeAllocateSelfHash(resealed), resealed.integrity.manifest_hash);
  assert.notEqual(resealed.integrity.manifest_hash, allocate.integrity.manifest_hash);
});

test('C002 seed reference block and chain verification', async () => {
  const { root } = buildFixture();
  await apply({ root, ticketPaths: [] });
  const seedText = readFileSync(join(root, 'crates/x/RFC-SEED.md'), 'utf8');
  assert.match(seedText, /"path": "SYSTEM-DESIGN\.md"/);
  const tree = readJson(join(root, 'WORKSPACIFY-TREE-MANIFEST.json'));
  assert.match(seedText, new RegExp(`"hash": "${tree.integrity.manifest_hash}"`));
  assert.deepEqual((await verifyAllocateChain({ workspaceRoot: root })).findings, []);
});

test('C003 educe identity switch', async () => {
  const { root, specSha } = buildFixture();
  await apply({ root, ticketPaths: [] });
  const educeDir = join(root, 'educe-sequences');
  mkdirSync(educeDir, { recursive: true });
  writeFileSync(join(educeDir, 'status.json'), JSON.stringify({ spec: { path: OLD_SPEC, sha256: specSha, lines: 1 }, generation: 17 }));
  const spec = { sha256: specSha, lineCount: 1 };
  const { openRun } = await import('../../../scripts/educe-sequences/rail/run-state.mjs');
  const before = openRun({ specPath: join(root, NEW_SPEC), spec });
  assert.equal(before.kind, 'another-specification');
  migrateEduceIdentity({ educeDir, from: OLD_SPEC, to: NEW_SPEC });
  const after = openRun({ specPath: join(root, NEW_SPEC), spec });
  assert.equal(after.resumed, true);
  assert.notEqual(after.kind, 'another-specification');
});

test('C003 evidence identity rebind preserves readings and receipts', async () => {
  const { root, specSha } = buildFixture();
  const oldDigest = sha256(readFileSync(join(root, OLD_SEQ_JSON)));
  const readings = `${JSON.stringify({ subject: 's1', artifactDigest: oldDigest, path: OLD_SPEC })}\n`;
  mkdirSync(join(root, 'educe-sequences'), { recursive: true });
  writeFileSync(join(root, 'educe-sequences/readings-inquest.jsonl'), readings);
  const readingsDigest = sha256(Buffer.from(readings));
  const manifest = {
    spec: { path: OLD_SPEC, sha256: specSha },
    artifact: { path: join(root, OLD_SEQ_JSON), sha256: oldDigest },
    receipts: [{ phase: 1, inputs: { spec: specSha, artifact: oldDigest } }],
    writeReceipts: [{ kind: 'readings-inquest', path: 'educe-sequences/readings-inquest.jsonl', sha256: readingsDigest }],
  };
  writeFileSync(join(root, 'educe-sequences/EVIDENCE-MANIFEST.json'), JSON.stringify(manifest, null, 2));
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'evidence');

  await apply({ root, ticketPaths: [] });

  const newDigest = sha256(readFileSync(join(root, NEW_SEQ_JSON)));
  assert.equal(readJson(join(root, NEW_SEQ_JSON)).spec.path, NEW_SPEC);
  assert.notEqual(newDigest, oldDigest);
  const reboundReadings = readFileSync(join(root, 'educe-sequences/readings-inquest.jsonl'), 'utf8');
  assert.equal(reboundReadings.includes(oldDigest), false);
  assert.equal(reboundReadings.includes(newDigest), true);
  const reboundManifest = readJson(join(root, 'educe-sequences/EVIDENCE-MANIFEST.json'));
  assert.equal(reboundManifest.artifact.sha256, newDigest);
  assert.equal(reboundManifest.spec.path, NEW_SPEC);
  assert.equal(reboundManifest.receipts[0].inputs.artifact, newDigest);
  assert.equal(
    reboundManifest.writeReceipts[0].sha256,
    sha256(readFileSync(join(root, 'educe-sequences/readings-inquest.jsonl'))),
  );
  assert.equal(reboundManifest.identityMigration.fromArtifactSha256, oldDigest);
  assert.equal(reboundManifest.identityMigration.toArtifactSha256, newDigest);
});

test('frozen zone table refuses every documented pattern', () => {
  const { root } = buildFixture();
  for (const path of [
    'regeneration/archive/x/old.md',
    'crates/x/Tickets.pre-2026.json',
    'crates/x/Status.json.bak-1',
    'progress-gif/a.html',
    'educe-sequences/archive/x.jsonl',
    'archive/a.md',
    'docs/archive/a.md',
  ]) {
    assert.throws(() => assertWritable(root, path), /FROZEN_PATH_WRITE_REFUSED/, path);
  }
});

test('verify reports zero live references after apply', async () => {
  const { root } = buildFixture();
  await apply({ root, ticketPaths: [] });
  const result = await verify({ root });
  assert.equal(result.ok, true, JSON.stringify(result.findings));
});
