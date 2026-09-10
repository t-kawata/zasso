// [::TICKET::] PX-191, PX-193, PX-194, PX-195 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-191|PX-193|PX-194|PX-195) --for-spec --no-implementation-order`.
/**
 * /workspacify-allocate command entry (corrected ALLOCATE).
 *
 * The node process performs only deterministic work. The session drives it
 * with subcommands: validate, plan, packet, gate, finalize. finalize is the
 * single atomic publication: it re-runs every gate, stages the directory tree
 * plus one RFC-SEED.md per package, publishes with rollback, reload-verifies,
 * and reports. The published set is the directory tree, one RFC-SEED.md per
 * package, and WORKSPACIFY-ALLOCATE-MANIFEST.json — the machine authority that
 * records what was proven. Intermediate artefacts are removed before it returns.
 */
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';

import { EXIT_CODES, WorkSpacifyTreeError } from '../workspacify-tree/lib/errors.mjs';
import { validateAgainstSchema } from '../workspacify-tree/lib/manifest-schema.mjs';

import { loadTreeManifest, checkAllocateEntryGate, readManifestSource } from './lib/tree-manifest-input.mjs';
import { buildDirectoryPlan } from './lib/directory-plan.mjs';
import { checkPlannedPathSafety } from './lib/path-safety.mjs';
import { checkExistingOutputPolicy, createStagingRoot, materializeDirectories, verifyStaging, publishStagedTree, verifyDirectorySet } from './lib/tree-staging.mjs';
import { deriveExpectedAllocation, lookupInventoryItem } from './lib/allocation-model.mjs';
import { buildAuthoringPacket } from './lib/seed-authoring-packet.mjs';
import { SEED_FILE_NAME, ALLOCATE_MANIFEST_FILE_NAME, validateDecisionsAuthoringSurface } from './lib/seed-model.mjs';
import { buildReferenceBlock } from './lib/reference-block.mjs';
import { buildContractEdge } from './lib/contract-model.mjs';
import { buildCoverageProof, assertSegmentCoverage } from './lib/coverage-proof.mjs';
import { buildContractIndex, runBilateralSymmetry } from './lib/contract-gate.mjs';
import { buildIntegrationGraph, runGraphViolations } from './lib/wig.mjs';
import { deriveImplementationOrder, verifyOrderAgainstStage1 } from './lib/implementation-order.mjs';
import { walkSeedContracts } from './walk-seed-contracts.mjs';
import { adviseFailure } from '../workspacify-tree/lib/gate-advice.mjs';
import { buildAllocateManifest } from './lib/allocate-manifest.mjs';
import { publishWorkspace } from './publish-allocate-manifest.mjs';
import { removeWorkspaceArtifacts } from './cleanup-workspace-artifacts.mjs';
import { reloadAndVerify } from './lib/allocate-reload.mjs';
import { renderSeed } from './lib/seed-render.mjs';
import { parseSeed } from './lib/seed-parse.mjs';
import { runSeedParity } from './lib/seed-parity.mjs';
import { runSeedLocalChecks } from './lib/seed-local-checks.mjs';

const DECISIONS_SCHEMA_PATH = fileURLToPath(new URL('./schemas/workspacify-allocate-decisions.schema.json', import.meta.url));

function guide(message) {
  process.stderr.write(`[guide] ${message}\n`);
}

function emit(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function optionValue(args, flag) {
  const prefix = `${flag}=`;
  const entry = args.find((arg) => arg.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : undefined;
}

/** Join gate reasons into readable sentences: the reader is an AI agent, not a log parser. */
function asSentences(entries) {
  return entries.map((entry) => (entry.endsWith('.') ? entry : `${entry}.`)).join(' ');
}

function loadLockedInput(manifestPath) {
  const absPath = path.resolve(manifestPath);
  const manifest = loadTreeManifest(absPath);
  const manifestDir = path.dirname(absPath);
  const entryGate = checkAllocateEntryGate(manifest, manifestDir);
  if (!entryGate.ok) {
    throw new WorkSpacifyTreeError(asSentences(entryGate.errors), { gateId: 'G0' });
  }
  const source = readManifestSource(manifest, manifestDir);
  return { manifest, manifestDir, sourceText: source.sourceText, sourceHash: source.sourceHash };
}

function loadDecisions(decisionsPath) {
  const absPath = path.resolve(decisionsPath);
  let decisions;
  try {
    decisions = JSON.parse(readFileSync(absPath, 'utf8'));
  } catch {
    throw new WorkSpacifyTreeError(`decisions file is not readable JSON: ${absPath}`, { gateId: 'G3' });
  }
  const schema = JSON.parse(readFileSync(DECISIONS_SCHEMA_PATH, 'utf8'));
  const report = validateAgainstSchema(decisions, schema);
  if (!report.valid) {
    throw new WorkSpacifyTreeError(report.errors.map((entry) => entry.message).join('; '), { gateId: 'G3' });
  }
  const surface = validateDecisionsAuthoringSurface(decisions);
  if (!surface.ok) {
    throw new WorkSpacifyTreeError(surface.errors.join('; '), { gateId: 'G3' });
  }
  return decisions;
}

function packageDecisionByPackageId(decisions, packageId) {
  return (decisions.seeds ?? []).find((seed) => seed.packageId === packageId) ?? null;
}

/**
 * Build the machine contract edges a package owes, from the stage-1 boundaries.
 *
 * Each boundary produces one contract per side: the consumer seed and the provider
 * seed carry the same contract id with the direction seen from their side, so the
 * bilateral symmetry gate has something real to compare.
 */
function buildContractEdgesForPackage({ manifest, packageId, decision }) {
  const packages = manifest.workspace?.packages ?? [];
  const packageById = new Map(packages.map((pkg) => [pkg.id, pkg]));
  const declaredIds = new Set((manifest.dependencies?.boundaries ?? []).map((boundary) => `contract-${boundary.id}`));
  const undeclared = (decision?.contractEdges ?? []).map((edge) => edge.contract_id).filter((contractId) => !declaredIds.has(contractId));
  if (undeclared.length > 0) {
    // Never drop an authored contract silently: an unknown id means the AI and the
    // manifest disagree about the boundary set.
    throw new WorkSpacifyTreeError(
      `package ${packageId} authors contract(s) with no declared boundary: ${undeclared.join(', ')}`,
      { gateId: 'G3' },
    );
  }
  const edges = [];
  for (const boundary of manifest.dependencies?.boundaries ?? []) {
    if (boundary.consumer_package !== packageId && boundary.provider_package !== packageId) {
      continue;
    }
    const authored = (decision?.contractEdges ?? []).find((edge) => edge.contract_id === `contract-${boundary.id}`);
    if (!authored) {
      // The AI must state the contract; the machine never fabricates an empty one,
      // so a missing contract is caught as a missing obligation instead of a shell.
      continue;
    }
    const isConsumer = boundary.consumer_package === packageId;
    edges.push(buildContractEdge({
      boundaryId: boundary.id,
      consumerPackage: boundary.consumer_package,
      providerPackage: boundary.provider_package,
      consumerPath: packageById.get(boundary.consumer_package)?.path,
      providerPath: packageById.get(boundary.provider_package)?.path,
      direction: isConsumer ? 'consumer_to_provider' : 'provider_to_consumer',
      connectionKind: boundary.connection_kind,
      // The semantic owner of a coupling is the provider: the same value on both sides.
      owners: authored.owners ?? { semantic: boundary.provider_package },
      clauses: authored.clauses ?? {},
      sourceRefs: authored.source_refs ?? collectPackageSegments({ manifest, packageId }),
    }));
  }
  return edges;
}

/** Segment ids behind a package's allocated inventory items. */
function collectPackageSegments({ manifest, packageId }) {
  const segments = new Set();
  for (const entry of manifest.workspace?.ownership?.entries ?? []) {
    if (entry.owner_package !== packageId) {
      continue;
    }
    const record = lookupInventoryItem(manifest, entry.category, entry.inventory_ref);
    for (const ref of record?.source_refs ?? []) {
      if (typeof ref.segment_id === 'string') {
        segments.add(ref.segment_id);
      }
    }
  }
  return [...segments].sort();
}

/** The implementation order entry of a package, taken from the stage-1 proof. */
function orderEntryForPackage({ manifest, packageId }) {
  const order = manifest.dependencies?.dag?.implementation_order ?? { serial: [], levels: [] };
  const wave = (order.levels ?? []).findIndex((level) => level.includes(packageId));
  const serialIndex = (order.serial ?? []).indexOf(packageId);
  return {
    before: wave > 0 ? (order.levels[wave - 1] ?? []) : [],
    after: wave >= 0 && wave + 1 < (order.levels ?? []).length ? order.levels[wave + 1] : [],
    parallel_with: wave >= 0 ? (order.levels[wave] ?? []).filter((id) => id !== packageId) : [],
    serial_index: serialIndex,
    wave,
  };
}

function renderAllSeeds({ manifest, manifestPath, manifestDir, expectedByPackage, decisions }) {
  const packages = manifest.workspace?.packages ?? [];
  const segmentIds = (manifest.structure?.segments ?? []).map((segment) => segment.id);
  const parsedByPackage = new Map();
  const renderedByPackage = new Map();
  const allocationRowsByPackage = new Map();

  for (const pkg of packages) {
    if (pkg.seed_required === false) {
      continue;
    }
    const decision = packageDecisionByPackageId(decisions, pkg.id);
    if (!decision?.aiSections) {
      throw new WorkSpacifyTreeError(`decisions is missing seed content for package ${pkg.id}`, { gateId: 'G3' });
    }
    const expectedAllocation = expectedByPackage.get(pkg.id) ?? [];
    const contractEdges = buildContractEdgesForPackage({ manifest, packageId: pkg.id, decision });
    const referenceBlock = buildReferenceBlock({
      manifest,
      manifestPath,
      manifestDir,
      package: pkg,
      orderEntry: orderEntryForPackage({ manifest, packageId: pkg.id }),
      contractIds: contractEdges.map((edge) => edge.contract_id),
      sourceSegments: collectPackageSegments({ manifest, packageId: pkg.id }),
    });
    const { seedText } = renderSeed({ package: pkg, manifest, expectedAllocation, referenceBlock, contractEdges, aiSections: decision.aiSections });
    const parsed = parseSeed(seedText);
    const local = runSeedLocalChecks({ parsedSeed: parsed, package: pkg, expectedAllocation, manifest, manifestPath, manifestDir, segmentIds });
    if (!local.ok) {
      throw new WorkSpacifyTreeError(`seed ${pkg.id} local checks failed: ${local.errors.join('; ')}`, { gateId: 'G3' });
    }
    parsedByPackage.set(pkg.id, parsed);
    allocationRowsByPackage.set(pkg.id, parsed.allocationIndexRows);
    renderedByPackage.set(pkg.id, { seedText, package: pkg });
  }

  const parity = runSeedParity({ expectedByPackage, parsedByPackage: allocationRowsByPackage });
  if (!parity.ok) {
    throw new WorkSpacifyTreeError(`seed parity failed: ${describeParity(parity)}`, { gateId: 'G4' });
  }
  return { parsedByPackage, allocationRowsByPackage, renderedByPackage };
}

/**
 * Prove the workspace coupling: both sides of every boundary, no graph violation,
 * and an implementation order identical to the one stage 1 proved.
 *
 * @param {{ manifest: object, parsedByPackage: Map<string, object> }} input
 * @returns {{ symmetry: object, graph: object, violations: object, order: object }}
 */
function assertWorkspaceCoupling({ manifest, parsedByPackage, expectedByPackage = new Map() }) {
  const contractIndex = buildContractIndex({ parsedByPackage, manifest });
  const symmetry = runBilateralSymmetry({ index: contractIndex, manifest });
  if (!symmetry.ok) {
    const unseeded = symmetry.unseeded_endpoints.map((packageId) => `package ${packageId} is a boundary endpoint but declares seed_required: false`).join('; ');
    const located = [unseeded, ...symmetry.details.map((entry) => `${entry.contract_id}: ${entry.reason}`)].filter((entry) => entry.length > 0).join('; ');
    throw new WorkSpacifyTreeError(`bilateral contract verification failed: ${located}`, { gateId: 'G4' });
  }

  const graph = buildIntegrationGraph({ contractIndex, manifest });
  const violations = runGraphViolations({ graph, manifest });
  if (!violations.ok) {
    const located = violations.violations.map((entry) => `${entry.class}(${entry.contract_id ?? entry.package_id ?? '-'}): ${entry.detail}`).join('; ');
    throw new WorkSpacifyTreeError(`workspace integration graph violations: ${located}`, { gateId: 'G5' });
  }

  const order = deriveImplementationOrder({ graph, manifest });
  const verdict = verifyOrderAgainstStage1({ derived: order, manifest });
  if (!verdict.ok) {
    throw new WorkSpacifyTreeError(verdict.reason, { gateId: 'G5' });
  }
  const coverageProof = buildCoverageProof({ manifest, expectedAllocation: expectedByPackage, parsedByPackage });
  return { symmetry, graph, violations, order, contractIndex, coverageProof };
}

/** Prove that no segment of the specification was dropped on the way into seeds. */
function assertSourceCoverage({ manifest, expectedByPackage, parsedByPackage }) {
  const proof = buildCoverageProof({ manifest, expectedAllocation: expectedByPackage, parsedByPackage });
  assertSegmentCoverage(proof);
  if (proof.not_applicable_without_reason.length > 0) {
    throw new WorkSpacifyTreeError(
      `a not_applicable body has no reason: ${proof.not_applicable_without_reason.join(', ')}`,
      { gateId: 'G3.5' },
    );
  }
  return proof;
}

/** Human-readable parity summary: which allocation keys are wrong, and how. */
function describeParity(parity) {
  const parts = [];
  if ((parity.missing ?? []).length > 0) parts.push(`missing allocations: ${parity.missing.join(', ')}`);
  if ((parity.extraneous ?? []).length > 0) parts.push(`unexpected allocations: ${parity.extraneous.join(', ')}`);
  if ((parity.crossPackage ?? []).length > 0) parts.push(`items claimed by the wrong package: ${parity.crossPackage.join(', ')}`);
  if ((parity.duplicate ?? []).length > 0) parts.push(`items claimed twice: ${parity.duplicate.join(', ')}`);
  if ((parity.unknown ?? []).length > 0) parts.push(`items outside the manifest inventory: ${parity.unknown.join(', ')}`);
  return parts.length > 0 ? parts.join('; ') : 'no allocation key differs';
}

/** Human-readable divergence summary: which artefact drifted and where. */
function describeDivergences(divergences = []) {
  return divergences
    .map((entry) => `${entry.artefact}${entry.package_id ? ` (${entry.package_id})` : ''}: ${entry.field} — ${entry.detail}`)
    .join('; ');
}

/** Render a list for a message, or "none" when it is empty. */
function listOrNone(entries = []) {
  return entries.length > 0 ? entries.join(', ') : 'none';
}

function assertSemanticApproval(decisions) {
  if (decisions.semantic_review?.status !== 'APPROVED') {
    throw new WorkSpacifyTreeError('semantic_review.status must be APPROVED before seeds can be finalized', { gateId: 'G5' });
  }
}

export function runValidate(args) {
  const manifestPath = args[1];
  if (!manifestPath) {
    throw new WorkSpacifyTreeError('validate requires exactly one <path-to-WORKSPACIFY-TREE-MANIFEST.json>', { gateId: 'G0' });
  }
  const { manifest, manifestDir, sourceHash } = loadLockedInput(manifestPath);
  emit({ status: 'PASS', workspaceRoot: manifestDir, sourceHash, manifestHash: manifest.integrity.manifest_hash, gateSummary: 'G0:PASS G1:PASS' });
  guide('Validate PASS: the manifest and its co-located specification are locked. Next: run plan.');
}

export function runPlan(args) {
  const manifestPath = args[1];
  if (!manifestPath) {
    throw new WorkSpacifyTreeError('plan requires exactly one <path-to-WORKSPACIFY-TREE-MANIFEST.json>', { gateId: 'G0' });
  }
  const { manifest, manifestDir } = loadLockedInput(manifestPath);
  const plan = buildDirectoryPlan({ tree: manifest.workspace?.tree, packages: manifest.workspace?.packages });
  if (!plan.consistent) {
    throw new WorkSpacifyTreeError(plan.errors.join('; '), { gateId: 'G2' });
  }
  const safety = checkPlannedPathSafety({ root: manifestDir, relativeDirs: plan.relativeDirs });
  if (!safety.ok) {
    throw new WorkSpacifyTreeError(safety.unsafe.map((entry) => `${entry.path}: ${entry.reason}`).join('; '), { gateId: 'G2.2' });
  }
  const policy = checkExistingOutputPolicy(manifestDir, plan.relativeDirs);
  if (!policy.ok) {
    throw new WorkSpacifyTreeError(policy.reason, { gateId: 'G2.4', exitCode: EXIT_CODES.FAIL });
  }
  emit({ status: 'PASS', plannedDirectoryCount: plan.relativeDirs.length, relativeDirs: plan.relativeDirs, gateSummary: 'G2:PASS' });
  guide('Plan PASS: the directory plan is safe and the workspace is fresh. Next: author the decisions input.');
}

export function runPacket(args) {
  const manifestPath = args[1];
  if (!manifestPath) {
    throw new WorkSpacifyTreeError('packet requires exactly one <path-to-WORKSPACIFY-TREE-MANIFEST.json>', { gateId: 'G0' });
  }
  const { manifest, sourceText } = loadLockedInput(manifestPath);
  const requested = optionValue(args, '--package');
  const targets = requested ? [requested] : (manifest.workspace?.packages ?? []).map((pkg) => pkg.id);
  const packets = targets.map((packageId) => buildAuthoringPacket({ manifest, sourceText, packageId }));
  emit({ packets });
  guide('Packet PASS: authoring material printed for the requested packages. Next: write the decisions input from this material.');
}

export function runGate(args) {
  const manifestPath = args[1];
  const decisionsPath = optionValue(args, '--decisions');
  if (!manifestPath || !decisionsPath) {
    throw new WorkSpacifyTreeError('gate requires <manifest> and --decisions=<path>', { gateId: 'G3' });
  }
  const { manifest, manifestDir } = loadLockedInput(manifestPath);
  const decisions = loadDecisions(decisionsPath);
  const { expectedByPackage } = deriveExpectedAllocation({ ownershipEntries: manifest.workspace?.ownership?.entries ?? [], packages: manifest.workspace?.packages ?? [] });
  const gateRun = renderAllSeeds({ manifest, manifestPath, manifestDir, expectedByPackage, decisions });
  assertSourceCoverage({ manifest, expectedByPackage, parsedByPackage: gateRun.parsedByPackage });
  assertWorkspaceCoupling({ manifest, parsedByPackage: gateRun.parsedByPackage });
  assertSemanticApproval(decisions);
  emit({ status: 'COMPLETE', gateSummary: 'G0:PASS G2:PASS G3:PASS G4:PASS G5:PASS order:PASS semantic:APPROVED' });
  guide('Gate PASS: every automatic gate is green and the AI semantic approval is recorded. Next: run finalize to publish.');
}

export function runFinalize(args) {
  const manifestPath = args[1];
  const decisionsPath = optionValue(args, '--decisions');
  if (!manifestPath || !decisionsPath) {
    throw new WorkSpacifyTreeError('finalize requires <manifest> and --decisions=<path>', { gateId: 'G3' });
  }
  const { manifest, manifestDir } = loadLockedInput(manifestPath);
  const decisions = loadDecisions(decisionsPath);
  const packages = manifest.workspace?.packages ?? [];

  const plan = buildDirectoryPlan({ tree: manifest.workspace?.tree, packages });
  if (!plan.consistent) {
    throw new WorkSpacifyTreeError(plan.errors.join('; '), { gateId: 'G2' });
  }
  const safety = checkPlannedPathSafety({ root: manifestDir, relativeDirs: plan.relativeDirs });
  if (!safety.ok) {
    throw new WorkSpacifyTreeError(safety.unsafe.map((entry) => `${entry.path}: ${entry.reason}`).join('; '), { gateId: 'G2.2' });
  }
  const policy = checkExistingOutputPolicy(manifestDir, plan.relativeDirs);
  if (!policy.ok) {
    throw new WorkSpacifyTreeError(policy.reason, { gateId: 'G2.4' });
  }

  const { expectedByPackage } = deriveExpectedAllocation({ ownershipEntries: manifest.workspace?.ownership?.entries ?? [], packages });
  const { renderedByPackage, parsedByPackage } = renderAllSeeds({ manifest, manifestPath, manifestDir, expectedByPackage, decisions });
  assertSourceCoverage({ manifest, expectedByPackage, parsedByPackage });
  const coupling = assertWorkspaceCoupling({ manifest, parsedByPackage, expectedByPackage });
  assertSemanticApproval(decisions);

  const allocateManifest = buildAllocateManifest({
    manifestRef: { manifest, manifestPath, manifestDir },
    plan,
    renderedByPackage,
    proof: { ...coupling, parsedByPackage },
    review: {
      gateResults: [{ id: 'G4', status: 'PASS' }, { id: 'G5', status: 'PASS' }],
      semanticReview: decisions.semantic_review,
    },
  });

  const publishResult = publishWorkspace({ manifestDir, plan, renderedByPackage, allocateManifest });
  if (!publishResult.published) {
    throw new WorkSpacifyTreeError(publishResult.reason, { gateId: 'G6.6' });
  }

  // Reload verification: the published artefacts must reproduce the proof.
  const reloadDirs = verifyDirectorySet(manifestDir, plan.relativeDirs);
  if (!reloadDirs.ok) {
    throw new WorkSpacifyTreeError(`reload directory scan failed: missing ${listOrNone(reloadDirs.missing)}, unexpected ${listOrNone(reloadDirs.unexpected)}`, { gateId: 'G6.4' });
  }
  const reloadVerdict = reloadAndVerify({ workspaceRoot: manifestDir, plan, manifest, manifestPath, expected: allocateManifest });
  if (!reloadVerdict.ok) {
    removeWorkspaceArtifacts({ workspaceRoot: manifestDir, stagingRoot: null });
    throw new WorkSpacifyTreeError(`reload verification failed: ${describeDivergences(reloadVerdict.divergences)}`, { gateId: 'G6.5' });
  }
  const walked = walkSeedContracts({ root: manifestDir, plan, manifest, manifestPath });
  const reloadRowsByPackage = new Map([...walked.byPackage].map(([packageId, parsed]) => [packageId, parsed.allocationIndexRows]));
  const reloadParity = runSeedParity({ expectedByPackage, parsedByPackage: reloadRowsByPackage });
  if (!reloadParity.ok) {
    throw new WorkSpacifyTreeError(`reload seed parity failed: ${describeParity(reloadParity)}`, { gateId: 'G6.5' });
  }

  const cleanup = removeWorkspaceArtifacts({ workspaceRoot: manifestDir, stagingRoot: null });
  emit({
    published: true,
    workspaceRoot: manifestDir,
    allocateManifestPath: path.join(manifestDir, ALLOCATE_MANIFEST_FILE_NAME),
    allocateManifestHash: allocateManifest.integrity.manifest_hash,
    residue: cleanup.residue,
    inputManifestHash: manifest.integrity.manifest_hash,
    directoryCount: plan.relativeDirs.length,
    packageCount: packages.length,
    seedCount: renderedByPackage.size,
    contractCount: coupling.violations.summary.edge_count,
    waveCount: coupling.order.levels.length,
    segmentCoverage: `${allocateManifest.source_coverage.segments_covered}/${allocateManifest.source_coverage.segments_total}`,
    gateSummary: 'G0:PASS G2:PASS G3:PASS G4:PASS G5:PASS order:PASS G6:PASS semantic:APPROVED',
  });
  guide('Finalize PASS: the workspace tree, one RFC-SEED.md per package and WORKSPACIFY-ALLOCATE-MANIFEST.json were published together and reload-verified. Intermediate artefacts were removed.');
}

const SUBCOMMANDS = {
  validate: runValidate,
  plan: runPlan,
  packet: runPacket,
  gate: runGate,
  finalize: runFinalize,
};

function main() {
  const args = process.argv.slice(2);
  const subcommand = args[0];
  const handler = SUBCOMMANDS[subcommand];
  if (!handler) {
    guide('Usage: run.mjs <validate|plan|packet|gate|finalize> <path-to-WORKSPACIFY-TREE-MANIFEST.json> [--decisions=<path>] [--package=<id>]');
    process.exit(EXIT_CODES.USAGE);
  }
  try {
    handler(args);
  } catch (error) {
    if (error instanceof WorkSpacifyTreeError) {
      emit({ status: 'FAIL', gateId: error.gateId, reason: error.message });
      const reason = error.message.endsWith('.') ? error.message : `${error.message}.`;
      guide(`The command stopped at gate ${error.gateId}. Reason: ${reason} A failed run never publishes or overwrites workspace content.`);
      for (const line of adviseFailure({ gateId: error.gateId, reason: error.message, stage: 'workspacify-allocate' })) {
        guide(line);
      }
      process.exit(error.exitCode ?? EXIT_CODES.FAIL);
    }
    emit({ status: 'FAIL', gateId: 'GENERAL', reason: error.message });
    guide(`Unexpected failure: ${error.message}`);
    process.exit(EXIT_CODES.FAIL);
  }
}

// Allow in-process unit tests to import and drive handlers without running main.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
