/**
 * The workspace root is a package, and it is not a directory to publish.
 *
 * A tree manifest may name the workspace root as the package `.`. The root already
 * exists, so it belongs to no directory plan, and a seed destined for the root is a
 * root-level file rather than a child of a `.` directory. These cases pin both halves:
 * the plan excludes the root, and every seed path is spelled without a `./` prefix.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildDirectoryPlan } from '../../../.claude/scripts/workspacify-allocate/lib/directory-plan.mjs';
import {
  packageFilePath,
  normalizePackagePath,
} from '../../../.claude/scripts/workspacify-allocate/lib/path-safety.mjs';
import {
  publishedTopLevelNames,
  verifyStagedWorkspace,
} from '../../../.claude/scripts/workspacify-allocate/publish-allocate-manifest.mjs';
import { publishStagedTree } from '../../../.claude/scripts/workspacify-allocate/lib/tree-staging.mjs';
import { buildAllocateManifest } from '../../../.claude/scripts/workspacify-allocate/lib/allocate-manifest.mjs';

const SEED = 'RFC-SEED.md';

test('root package spellings normalize to one path', () => {
  assert.equal(normalizePackagePath('.'), '.');
  assert.equal(normalizePackagePath('./'), '.');
  assert.equal(normalizePackagePath(''), '.');
  assert.equal(normalizePackagePath('./crates/alpha'), 'crates/alpha');
});

test('a root package seed is a root-level file, not a child of dot', () => {
  assert.equal(packageFilePath('.', SEED), SEED);
  assert.equal(packageFilePath('./crates/alpha', SEED), `crates/alpha/${SEED}`);
});

test('the directory plan never plans the workspace root', () => {
  const tree = [{ name: '.', path: '.', kind: 'dir', children: [{ name: 'crates', path: 'crates', kind: 'dir' }] }];
  const packages = [{ id: 'pkg-root', path: '.', layer: 'foundation', kind: 'production-library', seed_required: true, name: 'root', owns: {} }];

  const plan = buildDirectoryPlan({ tree, packages });

  assert.deepEqual(plan.relativeDirs, ['crates']);
});

test('publishedTopLevelNames names the root seed file rather than dot', () => {
  const rendered = new Map([['pkg-root', { package: { path: '.' } }]]);

  assert.deepEqual(
    publishedTopLevelNames({ plan: { relativeDirs: ['crates'] }, renderedByPackage: rendered }),
    [SEED, 'WORKSPACIFY-ALLOCATE-MANIFEST.json', 'crates'],
  );
});

test('staging verification accepts a root seed at the root of the staged tree', () => {
  const staging = mkdtempSync(join(tmpdir(), 'root-seed-stage-'));
  try {
    mkdirSync(join(staging, 'crates'));
    writeFileSync(join(staging, SEED), '# seed\n');
    writeFileSync(join(staging, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), '{}\n');

    const report = verifyStagedWorkspace({
      stagingRoot: staging,
      plan: { relativeDirs: ['crates'] },
      seedRelPaths: [packageFilePath('.', SEED)],
    });

    assert.equal(report.ok, true, JSON.stringify(report));
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
});

test('the root seed is published beside the planned directories', () => {
  const staging = mkdtempSync(join(tmpdir(), 'root-seed-publish-'));
  const root = mkdtempSync(join(tmpdir(), 'root-seed-workspace-'));
  try {
    mkdirSync(join(staging, 'crates'));
    writeFileSync(join(staging, SEED), '# seed\n');
    writeFileSync(join(staging, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), '{}\n');

    const result = publishStagedTree(staging, root, [SEED, 'WORKSPACIFY-ALLOCATE-MANIFEST.json', 'crates']);

    assert.equal(result.published, true, result.reason);
    assert.equal(readFileSync(join(root, SEED), 'utf8'), '# seed\n');
    assert.equal(existsSync(join(root, 'crates')), true);
  } finally {
    rmSync(staging, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
});

test('the allocate manifest records the root seed without a dot prefix', () => {
  const manifest = {
    integrity: { manifest_hash: 'tree-hash' },
    input: {},
    workspace: {
      packages: [{ id: 'pkg-root', path: '.', seed_required: true }],
      tree: [],
    },
  };
  const rendered = new Map([['pkg-root', { seedText: '# seed\n' }]]);

  const allocateManifest = buildAllocateManifest({
    manifestRef: { manifest, manifestPath: '/tmp/tree.json', manifestDir: '/tmp' },
    plan: { relativeDirs: [] },
    renderedByPackage: rendered,
    proof: {
      parsedByPackage: new Map(),
      contractIndex: new Map(),
      graph: null,
      violations: null,
      order: null,
      coverageProof: null,
    },
    review: {},
  });

  assert.equal(allocateManifest.seed_index[0].path, SEED);
});
