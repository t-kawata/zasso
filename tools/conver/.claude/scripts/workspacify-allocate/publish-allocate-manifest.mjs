// [::TICKET::] PX-195 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-195 --for-spec --no-implementation-order`.
// PX-195 @verifies C002
/**
 * Atomic publication of the three artefact families.
 *
 * The directory tree, the seeds and the allocate manifest are staged together and
 * moved into place with rollback, so the workspace never shows a partial state.
 * The published set is exactly those three; anything else the run created is
 * removed by the cleanup step.
 */
import { readdirSync, statSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';

import { createStagingRoot, materializeDirectories, publishStagedTree } from './lib/tree-staging.mjs';
import { ALLOCATE_MANIFEST_FILE_NAME, SEED_FILE_NAME } from './lib/seed-model.mjs';
import { renderAllocateManifest } from './lib/allocate-manifest.mjs';

/**
 * Verify the staged set before publication.
 *
 * The published set is exactly the planned directories, one seed per package and
 * the allocate manifest; anything else in staging would leak into the workspace.
 *
 * @param {{ stagingRoot: string, plan: object, seedRelPaths: string[] }} input
 * @returns {{ ok: boolean, missing: string[], unexpected: string[] }}
 */
export function verifyStagedWorkspace({ stagingRoot, plan, seedRelPaths }) {
  const expectedFiles = new Set([...seedRelPaths, ALLOCATE_MANIFEST_FILE_NAME].map((relPath) => relPath.split(path.sep).join('/')));
  const expectedDirs = new Set(expandPlannedDirectories(plan.relativeDirs ?? []));
  const observedDirs = [];
  const observedFiles = [];
  const walk = (relativeDir) => {
    for (const name of readdirSync(path.join(stagingRoot, relativeDir))) {
      const relativePath = relativeDir === '' ? name : `${relativeDir}/${name}`;
      if (statSync(path.join(stagingRoot, relativePath)).isDirectory()) {
        observedDirs.push(relativePath);
        walk(relativePath);
      } else {
        observedFiles.push(relativePath);
      }
    }
  };
  walk('');

  const missing = [...expectedDirs].filter((relativeDir) => !observedDirs.includes(relativeDir));
  const unexpectedDirs = observedDirs.filter((relativeDir) => !expectedDirs.has(relativeDir));
  const unexpectedFiles = observedFiles.filter((relativePath) => !expectedFiles.has(relativePath));
  const missingFiles = [...expectedFiles].filter((relativePath) => !observedFiles.includes(relativePath));
  return {
    ok: missing.length === 0 && unexpectedDirs.length === 0 && unexpectedFiles.length === 0 && missingFiles.length === 0,
    missing: [...missing, ...missingFiles.map((relativePath) => `file:${relativePath}`)],
    unexpected: [...unexpectedDirs, ...unexpectedFiles],
  };
}

/** Every planned directory plus its ancestors. */
function expandPlannedDirectories(relativeDirs) {
  const expanded = new Set();
  for (const relativeDir of relativeDirs) {
    const segments = relativeDir.split('/').filter((segment) => segment.length > 0);
    for (let index = 1; index <= segments.length; index += 1) {
      expanded.add(segments.slice(0, index).join('/'));
    }
  }
  return [...expanded];
}

/**
 * Stage and publish the tree, the seeds and the allocate manifest.
 *
 * @param {{ manifestDir: string, plan: object, renderedByPackage: Map<string, object>, allocateManifest: object }} input
 * @returns {{ published: boolean, reason?: string, stagingRoot: string|null }}
 */
export function publishWorkspace({ manifestDir, plan, renderedByPackage, allocateManifest }) {
  const staging = createStagingRoot(manifestDir);
  try {
    materializeDirectories(staging.path, plan.relativeDirs);
    for (const { package: pkg, seedText } of renderedByPackage.values()) {
      writeFileSync(path.join(staging.path, pkg.path, SEED_FILE_NAME), seedText, 'utf8');
    }
    writeFileSync(path.join(staging.path, ALLOCATE_MANIFEST_FILE_NAME), renderAllocateManifest(allocateManifest), 'utf8');

    const staged = verifyStagedWorkspace({
      stagingRoot: staging.path,
      plan,
      seedRelPaths: [...renderedByPackage.values()].map(({ package: pkg }) => `${pkg.path}/${SEED_FILE_NAME}`),
    });
    if (!staged.ok) {
      rmSync(staging.path, { recursive: true, force: true });
      return { published: false, reason: `staging verification failed: ${JSON.stringify(staged)}`, stagingRoot: null };
    }

    // The publish moves top-level entries; seeds and the manifest live inside the
    // tree, so planning their top-level names is enough to place them.
    const topLevelNames = [...new Set([
      ...plan.relativeDirs.map((relativeDir) => relativeDir.split('/')[0]),
      ...renderedByPackage.values().map(({ package: pkg }) => pkg.path.split('/')[0]),
      ALLOCATE_MANIFEST_FILE_NAME,
    ])].sort();
    const published = publishStagedTree(staging.path, manifestDir, topLevelNames);
    if (!published.published) {
      rmSync(staging.path, { recursive: true, force: true });
      return { published: false, reason: published.reason, stagingRoot: null };
    }
    return { published: true, stagingRoot: null };
  } catch (error) {
    rmSync(staging.path, { recursive: true, force: true });
    throw error;
  }
}
