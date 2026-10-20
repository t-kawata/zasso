/**
 * A populated workspace built by the real stage-one and stage-two producers.
 *
 * The transaction tests that use this fixture run the real tree and allocate
 * producers, so a derivation that violates the allocate empty-directory policy
 * fails here instead of passing on an injected producer. The live workspace is
 * complete: the chain verifies, every package directory is populated, and the
 * artifact digest is the raw digest of the live specification.
 */
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { digestOf } from '../../../.claude/scripts/educe-sequences/rail/load.mjs';
import { verifyChain } from '../../../.claude/scripts/regeneration/lib/chain.mjs';
import { makeDecisions } from '../../workspacify-allocate/helpers/build-valid-manifest.mjs';
import { settleSelfGrill } from '../../workspacify-allocate/helpers/self-grill-fixture.mjs';
import { stageAllocateDecisions } from '../../workspacify-allocate/helpers/stage-allocate-decisions.mjs';
import { stageTreeDecisionsFrom } from '../../workspacify-tree/helpers/stage-tree-decisions.mjs';

const CONVER_ROOT = process.cwd();
const TREE_FIXTURES = join(CONVER_ROOT, 'tests/workspacify-tree/fixtures');
export const LIVE_SPEC_TEXT = readFileSync(join(TREE_FIXTURES, 'gaia-like-spec.md'), 'utf8');
export const CANDIDATE_SPEC_TEXT = LIVE_SPEC_TEXT.replace(
  'Invariants must hold across every state transition.',
  'Invariants must hold across every state transition. Every transition is logged.',
);

/** Run one producer script inside a workspace root and fail loudly on refusal. */
// [::TICKET::] PX-279 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-279 --for-spec --no-implementation-order`.
export function runProducerCli(cwd, script, args) {
  const result = spawnSync(process.execPath, [join(CONVER_ROOT, '.claude/scripts', script), ...args], {
    cwd,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`${script} failed: ${result.stdout}\n${result.stderr}`);
  }
  return result;
}

/** Write a v3 artifact whose spec digest is the raw digest of the given spec. */
// [::TICKET::] PX-279 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-279 --for-spec --no-implementation-order`.
export function writeArtifactForSpec(root, specPath, fileName = 'spec-sequences.json') {
  // The empty artifact is the clean fixture: the detector has no sequence to judge, so
  // the CLI integration test exercises the transaction rather than a finding.
  const artifact = {
    schema_version: 3,
    vocabulary: { terminalStatuses: [], requiredInterfaces: [] },
    spec: {
      path: 'spec.md',
      sha256: digestOf(specPath),
      lines: readFileSync(specPath, 'utf8').split('\n').length,
    },
    pins: {},
    sequences: [],
    steps: [],
    operations: [],
  };
  writeFileSync(join(root, fileName), `${JSON.stringify(artifact, null, 2)}\n`);
  return join(root, fileName);
}

/** Build a populated live workspace with the real tree and allocate producers. */
// [::TICKET::] PX-279 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-279 --for-spec --no-implementation-order`.
export function materializeRealWorkspace() {
  const root = mkdtempSync(join(tmpdir(), 'regeneration-real-'));
  const specPath = join(root, 'spec.md');
  writeFileSync(specPath, LIVE_SPEC_TEXT);
  stageTreeDecisionsFrom(root, join(TREE_FIXTURES, 'gaia-decisions.json'));
  runProducerCli(root, 'workspacify-tree/run.mjs', ['finalize', `--spec=${specPath}`]);

  const treeManifest = JSON.parse(readFileSync(join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), 'utf8'));
  stageAllocateDecisions(root, settleSelfGrill({ decisions: makeDecisions(treeManifest), manifest: treeManifest }));
  runProducerCli(root, 'workspacify-allocate/run.mjs', ['finalize', join(root, 'WORKSPACIFY-TREE-MANIFEST.json')]);

  writeArtifactForSpec(root, specPath);
  for (const pkg of treeManifest.workspace?.packages ?? []) {
    writeFileSync(join(root, pkg.path, 'SEQUENCES.json'), `${JSON.stringify({ packageId: pkg.id }, null, 2)}\n`);
  }
  const chain = verifyChain(root);
  if (!chain.ok) throw new Error(`the live fixture chain is broken: ${JSON.stringify(chain.links.filter((link) => !link.ok))}`);
  return { root, specPath, treeManifest, remove: () => rmSync(root, { recursive: true, force: true }) };
}

/** Write a candidate specification that changes only prose inside an existing chapter. */
// [::TICKET::] PX-279 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-279 --for-spec --no-implementation-order`.
export function writeCandidateSpec(workspace) {
  const candidatePath = join(workspace.root, 'regeneration/candidates/spec.md');
  mkdirSync(dirname(candidatePath), { recursive: true });
  writeFileSync(candidatePath, CANDIDATE_SPEC_TEXT);
  return candidatePath;
}

/** Write an allocate decisions candidate that changes only the semantic approver. */
// [::TICKET::] PX-279 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-279 --for-spec --no-implementation-order`.
export function writeCandidateAllocateDecisions(workspace) {
  const sourcePath = join(workspace.root, 'workspacify/allocate/DECISIONS.json');
  const decisions = JSON.parse(readFileSync(sourcePath, 'utf8'));
  decisions.semantic_review = { ...decisions.semantic_review, approver: 'regeneration-test' };
  const candidatePath = join(workspace.root, 'regeneration/candidates/ALLOCATE-DECISIONS.json');
  mkdirSync(dirname(candidatePath), { recursive: true });
  writeFileSync(candidatePath, `${JSON.stringify(decisions, null, 2)}\n`);
  return candidatePath;
}

/** Write a tree decisions candidate that the candidate specification accepts. */
// [::TICKET::] PX-279 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-279 --for-spec --no-implementation-order`.
export function writeCandidateTreeDecisions(workspace) {
  const candidatePath = join(workspace.root, 'regeneration/candidates/TREE-DECISIONS.json');
  mkdirSync(dirname(candidatePath), { recursive: true });
  copyFileSync(join(TREE_FIXTURES, 'gaia-decisions.json'), candidatePath);
  return candidatePath;
}
