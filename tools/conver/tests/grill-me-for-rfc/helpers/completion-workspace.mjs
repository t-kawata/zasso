/**
 * A workspace the completion command can actually finish.
 *
 * `complete-run.js` now evaluates the STEP 8 gate list, so a package fixture that carries
 * only RFC/Status/DesignTree/CheckList can no longer reach DONE: the workspace gates read
 * the two manifests, the borrowed census, both package views and the package RFCs. This
 * helper composes the smooth-sequences workspace fixture (which already satisfies the four
 * workspace gates) with the package records the completion command and the per-package
 * gates require, so a test that changes one record changes exactly that record.
 *
 * The fixture deliberately keeps the clean workspace clean. Every override a test supplies
 * is a single defect, and every gate that is expected to pass still passes.
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  defaultViews,
  materializeSmoothWorkspace,
  minimalV2Artifact,
  minimalV3Artifact,
  rfcBody,
} from '../../smooth-sequences/helpers/workspace-fixture.mjs';

/** The provider package the completion fixture finishes. */
export const COMPLETION_PACKAGE_ID = 'pkg-0001';

/** The tree segment the formula gate resolves the seed against. */
export const TREE_SEGMENT_ID = 'seg-1';

const SPEC_FILENAME = 'spec.md';
const SEED_FILENAME = 'RFC-SEED.md';
const STATUS_FILENAME = 'Status.json';
const TREE_FILENAME = 'DesignTree.json';
const CHECKLIST_FILENAME = 'CheckList.md';
const RFC_FILENAME = 'RFC.md';

/** A v3 artifact whose borrowed census states both the operation and the sequence axis. */
export function cleanArtifact() {
  return minimalV3Artifact();
}

/** A v3 artifact with no borrowed census, which makes K1 unstated on both census axes. */
export function artifactWithoutCensus() {
  const artifact = minimalV3Artifact();
  artifact.pins.sourceEnumerations = [];
  return artifact;
}

/** A v3 artifact whose borrowed census is exactly the caller's pins. */
export function artifactWithPins(pins) {
  const artifact = minimalV3Artifact();
  artifact.pins.sourceEnumerations = pins;
  return artifact;
}

/** A v2 artifact: the contribution family withholds its check rather than guessing. */
export function withheldContributionArtifact() {
  return minimalV2Artifact();
}

/** Views whose provider package holds units while its RFC carries no distribution ledger. */
export function viewsWithUnitButNoLedger() {
  return defaultViews();
}

/** RFC bodies without a distribution ledger, so the discharge gate must report the omission. */
export function rfcBodiesWithoutLedger() {
  return {
    'pkg-0001': '# RFC pkg-0001\n\nThe design is authored here; no ledger is written yet.\n',
    'pkg-0002': '# RFC pkg-0002\n\nThe design is authored here; no ledger is written yet.\n',
  };
}

/** RFC bodies whose ledger is authored before any render, so the first completion is generation one. */
export function rfcBodiesWithoutDistributionMap() {
  return {
    'pkg-0001': rfcBody({ packageId: 'pkg-0001', operationId: 'ProduceFact', sequenceIds: ['A-1'], crossSequenceIds: ['A-1'] }),
    'pkg-0002': rfcBody({ packageId: 'pkg-0002', operationId: 'ConsumeFact', crossSequenceIds: ['A-1'] }),
  };
}

/** RFC bodies in which the provider ledger omits the operation its view owns. */
export function rfcBodiesWithUnaccountedOperation() {
  return {
    'pkg-0001': rfcBody({ packageId: 'pkg-0001', operationId: 'ProduceFact', extraUnits: [] })
      .replace(/\| op-ProduceFact \| operation \| pkg-0001 \|[^\n]*\n/, ''),
    'pkg-0002': rfcBody({ packageId: 'pkg-0002', operationId: 'ConsumeFact' }),
  };
}

/** The rust fence the API gate reads from each side of the declared package boundary. */
// [::TICKET::] PX-371 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-371 --for-spec --no-implementation-order`.
function crossPackageRust(providerBody, consumerBody) {
  const bodies = rfcBodiesWithoutDistributionMap();
  return {
    'pkg-0001': `${bodies['pkg-0001']}\n\n\`\`\`rust\n${providerBody}\n\`\`\`\n`,
    'pkg-0002': `${bodies['pkg-0002']}\n\n\`\`\`rust\n${consumerBody}\n\`\`\`\n`,
  };
}

/** RFC bodies whose cross-package calls agree with their declarations. */
export function rfcBodiesWithApiMatch() {
  return crossPackageRust(
    'pub fn produce_fact(one: String) -> Result<()> { Ok(()) }',
    'pub fn consume_it() { produce_fact(one); }',
  );
}

/** RFC bodies whose cross-package call has one argument more than the declaration. */
export function rfcBodiesWithApiMismatch() {
  return crossPackageRust(
    'pub fn produce_fact(one: String) -> Result<()> { Ok(()) }',
    'pub fn consume_it() { produce_fact(one, two); }',
  );
}

/** The seed identity block the formula gate reads. */
// [::TICKET::] PX-367 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-367 --for-spec --no-implementation-order`.
function seedBody() {
  return [
    '# RFC Seed: alpha',
    '',
    '## 1. Identity and Position in the Whole System',
    '',
    '```json',
    JSON.stringify({
      package: { id: COMPLETION_PACKAGE_ID, name: 'alpha', path: 'crates/alpha' },
      source_spec: { path: SPEC_FILENAME, sha256: '0'.repeat(64) },
      source_segments: [],
      stage1_manifest: { path: 'WORKSPACIFY-TREE-MANIFEST.json', hash: 'f'.repeat(64) },
    }, null, 2),
    '```',
    '',
  ].join('\n');
}

/** The Status.json the completion writer validates before it records DONE. */
// [::TICKET::] PX-367 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-367 --for-spec --no-implementation-order`.
function statusBody(rfcDir) {
  return {
    state: 'GRILLING',
    researchPath: join(rfcDir, 'material'),
    rfcPath: join(rfcDir, RFC_FILENAME),
    rfcDir,
    reviewLoopCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

/** The tree the divergence-ledger gate resolves and the open-count gate counts. */
// [::TICKET::] PX-367 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-367 --for-spec --no-implementation-order`.
function designTreeBody() {
  return {
    version: 1,
    nodes: [{
      id: 'seed-divergence-ledger',
      title: 'Seed divergence ledger',
      status: 'resolved',
      questions: [],
      children: [],
    }],
  };
}

/** The checklist header the schema requires; every item is checked. */
const CHECKLIST_BODY = [
  '# RFC 要件チェックリスト',
  '',
  '- [x] Every section is described',
  '- [x] Every code snippet is included',
  '- [x] No deferred work remains',
  '',
].join('\n');

/** The divergence appendix the gate requires, with its exact columns. */
const DIVERGENCE_APPENDIX = [
  '',
  '## Appendix B. Seed divergence ledger',
  '',
  'RFC.md is canonical over the material it was written from.',
  '',
  '| Artifact | Location | What the artifact says | What this document decides | Ground |',
  '|---|---|---|---|---|',
  '| RFC-SEED.md | §1 | the seed names the package position | the design keeps it | the seed section 1 |',
  '',
].join('\n');

/** A root RFC that is not a distribution package: it holds no view, so the workspace gates ignore it. */
const ROOT_RFC = [
  '# RFC workspace root',
  '',
  'The workspace root carries the completion record for a package the distribution does not name.',
  '',
  '## Appendix A. Cross-directory defect ledger',
  '',
  'Composition check: the provider and consumer designs were read; no contradiction, conflict or deficiency was found.',
  '',
  DIVERGENCE_APPENDIX,
].join('\n');

/**
 * The workspace root as a completion package that carries no view.
 *
 * The allocation names only the two crate packages, so a root completion neither reaches
 * the distribution nor changes the K8 verdict. This is the shape a package reaches DONE
 * in before the rail has projected a view for it.
 *
 * @returns {{ root: string, rfcDir: string, rfcPath: string, statusPath: string, remove: () => void }}
 */
export function materializeViewlessCompletionWorkspace() {
  const workspace = materializeCompletionWorkspace();
  const rfcDir = workspace.root;
  writeFileSync(join(rfcDir, RFC_FILENAME), ROOT_RFC);
  writeFileSync(join(rfcDir, SEED_FILENAME), seedBody());
  writeFileSync(join(rfcDir, STATUS_FILENAME), JSON.stringify(statusBody(rfcDir), null, 2));
  writeFileSync(join(rfcDir, TREE_FILENAME), JSON.stringify(designTreeBody(), null, 2));
  writeFileSync(join(rfcDir, CHECKLIST_FILENAME), CHECKLIST_BODY);
  return {
    root: workspace.root,
    rfcDir,
    rfcPath: join(rfcDir, RFC_FILENAME),
    statusPath: join(rfcDir, STATUS_FILENAME),
    remove: workspace.remove,
  };
}

/**
 * Materialize a workspace whose provider package can reach DONE.
 *
 * @param {{ artifact?: object, views?: object, rfcBodies?: object, extraArtifactName?: string }} input
 * @returns {{ root: string, rfcDir: string, rfcPath: string, statusPath: string,
 *   remove: () => void }}
 */
export function materializeCompletionWorkspace(input = {}) {
  const workspace = materializeSmoothWorkspace({
    artifact: input.artifact,
    views: input.views,
    rfcBodies: input.rfcBodies,
  });

  // The formula gate resolves the package's owned line ranges through the tree manifest.
  const treeManifest = JSON.parse(readFileSync(workspace.treeManifestPath, 'utf8'));
  treeManifest.structure = {
    segments: [{ id: TREE_SEGMENT_ID, line_start: 1, line_end: 10 }],
  };
  writeFileSync(workspace.treeManifestPath, JSON.stringify(treeManifest, null, 2));

  writeFileSync(join(workspace.root, SPEC_FILENAME), '# Specification\n\nThe fixture names no formula.\n');

  const rfcDir = workspace.directoryOf(COMPLETION_PACKAGE_ID);
  writeFileSync(join(rfcDir, SEED_FILENAME), seedBody());
  writeFileSync(join(rfcDir, STATUS_FILENAME), JSON.stringify(statusBody(rfcDir), null, 2));
  writeFileSync(join(rfcDir, TREE_FILENAME), JSON.stringify(designTreeBody(), null, 2));
  writeFileSync(join(rfcDir, CHECKLIST_FILENAME), CHECKLIST_BODY);
  appendFileSync(join(rfcDir, RFC_FILENAME), DIVERGENCE_APPENDIX);

  if (input.extraArtifactName !== undefined) {
    const source = readFileSync(workspace.artifactPath, 'utf8');
    writeFileSync(join(workspace.root, input.extraArtifactName), source);
  }

  return {
    root: workspace.root,
    rfcDir,
    rfcPath: join(rfcDir, RFC_FILENAME),
    statusPath: join(rfcDir, STATUS_FILENAME),
    remove: workspace.remove,
  };
}
