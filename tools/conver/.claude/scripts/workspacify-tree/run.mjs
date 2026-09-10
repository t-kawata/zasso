// [::TICKET::] PX-178, PX-179, PX-188, PX-192, PX-196, PX-197, PX-199, PX-200, PX-202 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-178|PX-179|PX-181|PX-183|PX-184|PX-185|PX-186|PX-188|PX-192) --for-spec --no-implementation-order`.
/**
 * Command entry point for /workspacify-tree.
 *
 * The node process performs only deterministic work. It exposes subcommands
 * that a Claude Code session drives: parse, extract, gate, finalize. The AI
 * supplies the semantic design as a decision input; the machine validates it
 * and publishes exactly one manifest.
 */
import path from 'node:path';
import process from 'node:process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';

import { EXIT_CODES } from './lib/errors.mjs';
import { ARCHITECTURE_DELTA_FILE_NAME, loadArchitectureDelta } from './lib/architecture-delta.mjs';
import {
  TREE_MODES,
  addReverseProvenance,
  computeSidecarBundleHash,
  digestSidecarFiles,
  renderReverseReport,
  runReverseGates,
  summarizeReverseGates,
} from './lib/reverse-mode.mjs';
import { measureDirectoryTree } from './lib/structure-parity.mjs';
import { LAYER_FORBIDDEN_TARGETS } from './lib/workspace-model.mjs';
import { readSpecInput } from './lib/fs-safe.mjs';
import { normalizeTextBytes } from './lib/normalization.mjs';
import { sha256Hex } from './lib/hash.mjs';
import { buildHeadingTree, collectHeadingWarnings } from './lib/headings.mjs';
import { segmentAtHeadings, verifyReconstruction } from './lib/segmentation.mjs';
import { attachOwnedInventory } from './lib/segment-ownership.mjs';
import { buildSpecPulse } from './lib/spec-pulse.mjs';
import { validateSpecDefects } from './lib/spec-defects.mjs';
import { buildDependencyReviewForDecisions, mergeReviewsWithCandidates, collectReviewResiduals } from './lib/dependency-review.mjs';
import { checkTreeEntryGate } from './lib/entry-parity.mjs';
import { adviseFailure } from './lib/gate-advice.mjs';
import {
  harvestObjectCandidates,
  harvestClaimCandidates,
  harvestNormativeCandidates,
  harvestRequirementCandidates,
  harvestCategoryInventory,
} from './lib/extraction.mjs';
import { normalizeAliases } from './lib/alias-normalization.mjs';
import { applyOwnership, applyApprovals } from './lib/decision-apply.mjs';
import { buildInventoryReport } from './lib/inventory-report.mjs';
import { runGatePipeline } from './lib/validation.mjs';
import { loadDecisionInput, assertDecisionSchema } from './lib/decision-input.mjs';
import { assembleManifest, renderManifestText } from './lib/render.mjs';
import { buildBoundaryContractScope } from './lib/contract-clauses.mjs';
import { runDagChecks } from './lib/dag.mjs';
import { atomicPublish } from './lib/atomic-publish.mjs';
import { formatSuccess, formatFailure } from './lib/report.mjs';

const MANIFEST_FILE_NAME = 'WORKSPACIFY-TREE-MANIFEST.json';
const COMMAND_NAME = '/workspacify-tree';
const GENERATOR_VERSION = '1.0.0';

/**
 * Friendly, natural-language English guidance for the AI operator.
 * Canonical machine output stays on stdout; this explanation goes to stderr so
 * the two never interfere and an AI reading the tool output is told what to do
 * next and why a step failed.
 */
function guide(text) {
  process.stderr.write(`[guide] ${text}\n`);
}

// [::TICKET::] P22-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-11 --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  const subcommand = args[0];
  if (subcommand === undefined) {
    process.stdout.write(printUsage());
    process.exit(EXIT_CODES.USAGE);
  }

  try {
    if (subcommand === 'parse') {
      runParse(args[1]);
    } else if (subcommand === 'extract') {
      runExtract(args[1]);
    } else if (subcommand === 'gate') {
      runGate(args);
    } else if (subcommand === 'finalize') {
      runFinalize(args);
    } else if (subcommand === 'reverse') {
      runReverse(args);
    } else {
      process.stdout.write(printUsage());
      process.exit(EXIT_CODES.USAGE);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const gateId = error?.gateId ?? 'GENERAL';
    process.stdout.write(formatFailure({ gateId, reason: message, fixHint: 'correct the reported input or design decision' }));
    guide(`The command stopped at gate ${gateId}. Reason: ${message}. Fix the reported input or decision, then re-run the step; a failed run never publishes or overwrites a manifest.`);
    process.exit(EXIT_CODES.FAIL);
  }
}

function runParse(specPath) {
  if (!specPath) {
    throw new Error('parse requires exactly one <path-to-specification.md>');
  }
  const analysis = analyzeSpec(specPath);
  process.stdout.write(
    JSON.stringify({
      status: analysis.reconstruction.status === 'PASS' ? 'PASS' : 'FAIL',
      source_hash: analysis.sourceHash,
      heading_count: analysis.headings.length,
      segment_count: analysis.segments.length,
      reconstruction: analysis.reconstruction,
    }) + '\n'
  );
  if (analysis.reconstruction.status === 'PASS') {
    guide(`Parse PASS: input locked (source hash ${analysis.sourceHash.slice(0, 12)}...), ${analysis.headings.length} headings, ${analysis.segments.length} segments, reconstruction verified byte-for-byte. Next: run extract to harvest candidates.`);
  }
  process.exit(analysis.reconstruction.status === 'PASS' ? EXIT_CODES.OK : EXIT_CODES.FAIL);
}

function runExtract(specPath) {
  if (!specPath) {
    throw new Error('extract requires exactly one <path-to-specification.md>');
  }
  const analysis = analyzeSpec(specPath);
  const inventory = buildInventory(analysis);
  const report = buildInventoryReport(inventory);
  // The pulse decides which observations the AI must settle, so it is published here
  // rather than only inside the gate: the operator can read the observations it is
  // asked to answer instead of guessing from candidate ids.
  const specPulse = buildSpecPulseForAnalysis(analysis, inventory);
  process.stdout.write(JSON.stringify({ ...report.stats, spec_pulse: specPulse }) + '\n');
  guide(`Extract PASS: harvested ${report.stats.harvested} candidates (${report.stats.confirmed} confirmed, ${report.stats.review_required} need AI review, ${report.stats.unresolved} unresolved) and observed ${specPulse.candidates.length} specification pulse candidate(s). In Step 3, resolve every REVIEW_REQUIRED item through approvals and settle every pulse candidate in spec_defects or residual_questions; leaving unknown/unresolved candidates prevents COMPLETE.`);
  process.exit(EXIT_CODES.OK);
}

function runGate(args) {
  const specPath = optionValue(args, '--spec');
  const decisionsPath = optionValue(args, '--decisions');
  if (!specPath || !decisionsPath) {
    throw new Error('gate requires --spec=<path> and --decisions=<path>');
  }
  const analysis = analyzeSpec(specPath);
  const decisions = loadDecisionInput(path.resolve(decisionsPath));
  const schemaReport = assertDecisionSchema(decisions);
  if (!schemaReport.ok) {
    throw new Error(`decision schema invalid: ${schemaReport.errors.map((entry) => entry.message).join('; ')}`);
  }
  const inventory = prepareInventory(analysis, decisions);
  // The pulse is computed once and handed to the pipeline, so the defect gate sees
  // exactly the candidate set the manifest will publish.
  const specPulse = buildSpecPulseForAnalysis(analysis, inventory);
  const dependencyReview = buildDependencyReviewForDecisions(decisions, buildOwnershipTable(inventory, decisions).entries);
  const pipeline = runGatePipeline({
    structure: { reconstruction: analysis.reconstruction, segments: analysis.segments, spec_pulse: specPulse },
    inventory,
    workspace: { packages: decisions.workspace, tree: decisions.tree ?? [] },
    dependencies: {
      normalEdges: decisions.dependencies.filter((edge) => edge.kind !== 'forbidden'),
      // The forbidden edges are published, so the gate must judge them too.
      forbiddenEdges: decisions.dependencies.filter((edge) => edge.kind === 'forbidden'),
      boundaries: decisions.boundaries ?? [],
    },
    adapters: buildPipelineAdapters(decisions),
    review: dependencyReview,
    decisions: {
      approvals: decisions.approvals,
      ownership: decisions.ownership,
      semantic_review: decisions.semantic_review ?? {},
      // The pulse candidates must be settled in this session, never handed to a human.
      spec_defects: decisions.spec_defects ?? [],
      residual_questions: decisions.residual_questions ?? [],
      // Every review candidate must likewise carry a decision made in this session.
      dependency_reviews: decisions.dependency_reviews ?? [],
    },
  });
  const summary = pipeline.gates.map((gate) => `${gate.id}:${gate.status}`).join(' ');
  process.stdout.write(JSON.stringify({ status: pipeline.status, gates: summary, finalAudit: pipeline.finalAudit }) + '\n');
  const failing = pipeline.gates.filter((gate) => gate.status !== 'PASS');
  if (failing.length === 0) {
    guide(`Gate PASS (${summary}): every automatic gate is green and nothing is unresolved. You may now run finalize to publish the manifest.`);
  } else {
    const hints = failing
      .map((gate) => `${gate.id}=${gate.status}${gate.reasons.length ? ` (${gate.reasons.join('; ')})` : ''}`)
      .join(', ');
    guide(`Gate ${pipeline.status}: the pipeline is not yet safe to publish. Review finalAudit counts and fix in Step 3: ${hints}. Re-run gate after each decision edit until it reports COMPLETE.`);
  }
  process.exit(pipeline.status === 'COMPLETE' ? EXIT_CODES.OK : EXIT_CODES.FAIL);
}

// [::TICKET::] P22-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-11 --for-spec --no-implementation-order`.
function runFinalize(args) {
  const specPath = optionValue(args, '--spec');
  const decisionsPath = optionValue(args, '--decisions');
  if (!specPath || !decisionsPath) {
    throw new Error('finalize requires --spec=<path> and --decisions=<path>');
  }
  const prepared = prepareForwardPipeline(specPath, decisionsPath);
  if (prepared.pipeline.status !== 'COMPLETE') {
    reportPipelineFailure(prepared.pipeline, 'Finalize');
  }

  const manifest = assembleManifest(buildForwardManifestSections(prepared));

  // The canonical artifact is always published to the current working directory.
  const published = publishAcceptedManifest({
    manifest,
    specPath: prepared.analysis.absPath,
    outDir: process.cwd(),
    sourceHash: prepared.analysis.sourceHash,
  });
  if (!published.published) {
    process.stdout.write(
      formatFailure({
        gateId: 'G5',
        reason: published.reason,
        fixHint: FINALIZE_REFUSAL_HINTS[published.refusal],
      }),
    );
    process.exit(EXIT_CODES.FAIL);
  }

  process.stdout.write(
    formatSuccess({
      manifestAbsPath: published.manifestAbsPath,
      sourceHash: prepared.analysis.sourceHash,
      manifestHash: manifest.integrity.manifest_hash,
      gateSummary: prepared.pipeline.gates.map((gate) => `${gate.id}:${gate.status}`).join(' '),
    }) + '\n'
  );
  guide(`Finalize PASS: WORKSPACIFY-TREE-MANIFEST.json was atomically published to the current directory, reload-verified, and passes the ALLOCATE entry-gate parity (all categories owned, tree consistent, boundaries covered). This file is the single input for the next stage /workspacify-allocate.`);
  process.exit(EXIT_CODES.OK);
}

/**
 * Run the stage-two entry gate and publish the manifest.
 *
 * Both rotations publish through this one function, so a change to the publish
 * discipline cannot reach one path and miss the other. The refusal is returned
 * rather than printed, because the two entry points tell the operator to re-run
 * different steps.
 *
 * @returns {{published: boolean, manifestAbsPath?: string, refusal?: 'entry-gate'|'publish', reason?: string}}
 */
// [::TICKET::] P22-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-11 --for-spec --no-implementation-order`.
function publishAcceptedManifest({ manifest, specPath, outDir, sourceHash }) {
  // Double gate: the hand-off must be acceptable to stage 2 before it is published.
  const acceptance = checkTreeEntryGate(manifest, specPath);
  if (!acceptance.ok) {
    return { published: false, refusal: 'entry-gate', reason: `the manifest would not be accepted by stage 2: ${acceptance.errors.join('; ')}` };
  }
  const publishResult = atomicPublish({ dir: outDir, fileName: MANIFEST_FILE_NAME, content: renderManifestText(manifest), sourceHash });
  if (!publishResult.published) {
    return { published: false, refusal: 'publish', reason: publishResult.reason ?? 'publish failed' };
  }
  return { published: true, manifestAbsPath: path.resolve(publishResult.path) };
}

/** What the forward rotation tells the operator to re-run after a refused publication. */
const FINALIZE_REFUSAL_HINTS = Object.freeze({
  'entry-gate': 'fix the stage-2 requirements named above, then re-run gate and finalize',
  publish: 'resolve the blocked condition before retrying',
});

/**
 * Prepare everything the forward pipeline needs, without deciding anything.
 *
 * Both the forward finalize and the reverse entry point call this, so the
 * reverse rotation judges exactly the manifest the forward rotation publishes.
 */
// [::TICKET::] P22-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-11 --for-spec --no-implementation-order`.
function prepareForwardPipeline(specPath, decisionsPath) {
  const analysis = analyzeSpec(specPath);
  const decisions = loadDecisionInput(path.resolve(decisionsPath));
  const schemaReport = assertDecisionSchema(decisions);
  if (!schemaReport.ok) {
    throw new Error(`decision schema invalid: ${schemaReport.errors.map((entry) => entry.message).join('; ')}`);
  }
  const inventory = prepareInventory(analysis, decisions);
  const specPulse = buildSpecPulseForAnalysis(analysis, inventory);
  const ownershipTable = buildOwnershipTable(inventory, decisions);
  // The review is computed once and handed to the pipeline, so the gate judges
  // exactly the candidate set the manifest publishes.
  const dependencyReview = buildDependencyReviewForDecisions(decisions, ownershipTable.entries);
  const pipelineInput = {
    structure: { reconstruction: analysis.reconstruction, segments: analysis.segments, spec_pulse: specPulse },
    inventory,
    workspace: { packages: decisions.workspace, tree: decisions.tree ?? [] },
    dependencies: {
      normalEdges: decisions.dependencies.filter((edge) => edge.kind !== 'forbidden'),
      // The forbidden edges are published, so the gate must judge them too.
      forbiddenEdges: decisions.dependencies.filter((edge) => edge.kind === 'forbidden'),
      boundaries: decisions.boundaries ?? [],
    },
    adapters: buildPipelineAdapters(decisions),
    review: dependencyReview,
    decisions: {
      approvals: decisions.approvals,
      ownership: decisions.ownership,
      semantic_review: decisions.semantic_review ?? {},
      // The pulse candidates must be settled in this session, never handed to a human.
      spec_defects: decisions.spec_defects ?? [],
      residual_questions: decisions.residual_questions ?? [],
      // Every review candidate must likewise carry a decision made in this session.
      dependency_reviews: decisions.dependency_reviews ?? [],
    },
  };
  const pipeline = runGatePipeline(pipelineInput);
  return { analysis, decisions, inventory, specPulse, ownershipTable, dependencyReview, pipeline };
}

/** The manifest sections the forward rotation publishes, and reverse mode extends. */
// [::TICKET::] P22-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-11 --for-spec --no-implementation-order`.
function buildForwardManifestSections(prepared) {
  const { analysis, decisions, inventory, specPulse, ownershipTable, dependencyReview, pipeline } = prepared;
  return {
    status: 'COMPLETE',
    run: buildRunSection(),
    input: buildInputSection(analysis),
    structure: buildStructureSection(analysis, inventory, specPulse),
    inventory: {
      objects: inventory.objects,
      claims: inventory.claims,
      invariants: inventory.invariants,
      state_machines: inventory.stateMachines,
      error_codes: inventory.errorCodes,
      required_tests: inventory.requiredTests,
      terms: inventory.terms,
      normalization_decisions: inventory.normalization_decisions,
      unresolved_candidates: inventory.unresolved_candidates,
    },
    requirements: { normative_candidates: inventory.terms },
    workspace: { tree: decisions.tree ?? [], packages: decisions.workspace, ownership: ownershipTable },
    adapters: buildAdaptersSection(decisions),
    dependencies: buildDependencyTables(decisions, decisions.workspace),
    conformance: buildConformanceSection(decisions.workspace),
    stage2_handoff: buildStage2Handoff(inventory, decisions, dependencyReview),
    gates: { records: pipeline.gates },
    final_audit: { ...pipeline.finalAudit, status: pipeline.finalAudit.status },
    integrity: { input_hash_verified_at_finalize: true, reload_validation: 'PASS' },
  };
}

/**
 * Report a forward-gate failure and stop: nothing is published and no manifest is replaced.
 *
 * The step is named by the caller, because both rotations run the same forward
 * gates and an operator reading "Finalize blocked" during a reverse run would
 * re-run the wrong step.
 */
// [::TICKET::] P22-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-11 --for-spec --no-implementation-order`.
function reportPipelineFailure(pipeline, stepName) {
  const failingGate = pipeline.gates.find((gate) => gate.status !== 'PASS');
  process.stdout.write(
    formatFailure({
      gateId: failingGate.id,
      reason: `pipeline ended with status ${pipeline.status}`,
      fixHint: 'resolve REVIEW_REQUIRED items or fix the dependency/layer violations in the decisions input',
    })
  );
  const reasons = (failingGate.reasons ?? []).join('; ') || 'see finalAudit counts in the gate output';
  guide(`${stepName} blocked at ${failingGate.id} (${pipeline.status}). Reasons: ${reasons}. Nothing was published and no existing manifest was changed.`);
  for (const line of adviseFailure({ gateId: failingGate.id, reason: reasons, stage: 'workspacify-tree' })) {
    guide(line);
  }
  process.exit(EXIT_CODES.FAIL);
}

/**
 * Reverse mode: partition a project that already exists.
 *
 * The forward pipeline still runs and still has to reach COMPLETE, because the
 * reverse rotation does not replace the partition — it grounds it. The measured
 * tree is then compared against what the partition declared (T1 to T6), and only
 * a run whose every gate answered PASS publishes a manifest. The one field the
 * manifest gains is `reverse_provenance`; `COMPLETE` keeps the meaning it has in
 * the forward rotation.
 */
// [::TICKET::] P22-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-11 --for-spec --no-implementation-order`.
function runReverse(args) {
  const specPath = optionValue(args, '--spec');
  const decisionsPath = optionValue(args, '--decisions');
  const root = optionValue(args, '--root');
  if (!specPath || !decisionsPath || !root) {
    process.stdout.write(printUsage());
    process.exit(EXIT_CODES.USAGE);
  }

  const outDir = path.resolve(optionValue(args, '--out') ?? process.cwd());
  const measuredRoot = path.resolve(root);
  const deltaPath = path.resolve(optionValue(args, '--delta') ?? path.join(outDir, ARCHITECTURE_DELTA_FILE_NAME));

  const prepared = prepareForwardPipeline(specPath, decisionsPath);
  if (prepared.pipeline.status !== 'COMPLETE') {
    reportPipelineFailure(prepared.pipeline, 'Reverse mode');
  }

  const packages = prepared.decisions.workspace;
  const measuredTree = measureDirectoryTree(measuredRoot);
  const measured = {
    directories: measuredTree.directories,
    sourceFiles: measuredTree.sourceFiles,
    edges: readMeasuredEdges(optionValue(args, '--measured')),
  };

  const sidecarFiles = listSidecarFiles(optionValue(args, '--sidecars'));
  const delta = loadArchitectureDelta(deltaPath);
  const reverseProvenance = {
    sidecar_bundle_hash: computeSidecarBundleHash(digestSidecarFiles(sidecarFiles)),
    counts: { sidecars: sidecarFiles.length, packages: packages.length, mismatches_recorded: delta.mismatches.length },
  };

  const manifest = assembleManifest(
    addReverseProvenance(buildForwardManifestSections(prepared), {
      mode: TREE_MODES.REVERSE,
      sidecarBundleHash: reverseProvenance.sidecar_bundle_hash,
      counts: reverseProvenance.counts,
    }),
  );

  const records = runReverseGates({
    mode: TREE_MODES.REVERSE,
    manifest,
    measured,
    graph: { nodes: readGraphNodes(optionValue(args, '--graph')) },
    resolveFilePath: (file) => path.resolve(measuredRoot, file),
    delta,
    sidecarFiles,
    reverseProvenance,
  });
  const summary = summarizeReverseGates(records);
  if (summary.status !== 'COMPLETE') {
    reportReverseFailure(records, summary);
  }

  const published = publishAcceptedManifest({
    manifest,
    specPath: prepared.analysis.absPath,
    outDir,
    sourceHash: prepared.analysis.sourceHash,
  });
  if (!published.published) {
    process.stdout.write(
      formatFailure({ gateId: 'G5', reason: published.reason, fixHint: REVERSE_REFUSAL_HINTS[published.refusal] }) + '\n'
    );
    process.exit(EXIT_CODES.FAIL);
  }

  process.stdout.write(
    formatSuccess({
      manifestAbsPath: published.manifestAbsPath,
      sourceHash: prepared.analysis.sourceHash,
      manifestHash: manifest.integrity.manifest_hash,
      gateSummary: records.map((record) => `${record.gateId}:${record.status}`).join(' '),
    }) + '\n'
  );
  guide(`Reverse PASS: T1 to T6 were judged over the measured tree at ${measuredRoot} and the manifest was published with its reverse provenance. The physical layout is preserved and every logical/physical mismatch is recorded in ${ARCHITECTURE_DELTA_FILE_NAME} rather than silently accepted.`);
  process.stdout.write(renderReverseReport(records));
  process.exit(EXIT_CODES.OK);
}

/** What the reverse rotation tells the operator to re-run after a refused publication. */
const REVERSE_REFUSAL_HINTS = Object.freeze({
  'entry-gate': 'fix the stage-2 requirements named above, then re-run reverse',
  publish: 'resolve the blocked condition before retrying',
});

/**
 * Report the reverse gates that did not pass and stop, publishing nothing.
 *
 * Every failing gate is named, not only the first: a run that reported one
 * problem at a time would make the operator re-run the step once per problem.
 */
// [::TICKET::] P22-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-11 --for-spec --no-implementation-order`.
function reportReverseFailure(records, summary) {
  const failingGate = records.find((record) => record.status !== 'PASS');
  process.stdout.write(
    formatFailure({
      gateId: failingGate.gateId,
      reason: failingGate.reasons.join('; '),
      fixHint: `repair what ${summary.failing.join(', ')} reported, then run this step again`,
    }) + '\n'
  );
  guide(`Reverse mode stopped at ${summary.failing.join(', ')}. Nothing was published and no existing manifest was replaced.`);
  process.stdout.write(renderReverseReport(records));
  process.exit(EXIT_CODES.FAIL);
}

/** The regular files directly inside a sidecar directory, name-sorted. */
// [::TICKET::] P22-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-11 --for-spec --no-implementation-order`.
function listSidecarFiles(dir) {
  if (!dir) {
    return [];
  }
  const absoluteDir = path.resolve(dir);
  if (!existsSync(absoluteDir)) {
    throw new Error(`the sidecar directory ${absoluteDir} does not exist`);
  }
  return readdirSync(absoluteDir)
    .sort()
    .filter((entry) => statSync(path.join(absoluteDir, entry)).isFile())
    .map((entry) => ({ name: entry, path: path.join(absoluteDir, entry) }));
}

/**
 * Read a measured edge set.
 *
 * A file that parses but carries no `edges` array is reported as an absent
 * measurement, which T4 then names. A file that cannot be read at all is an
 * input error and says so here: "the JSON is malformed" and "the measurement
 * found no edges" are different problems with different repairs.
 */
// [::TICKET::] P22-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-11 --for-spec --no-implementation-order`.
function readMeasuredEdges(measuredPath) {
  if (!measuredPath) {
    return undefined;
  }
  const absolutePath = path.resolve(measuredPath);
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    throw new Error(`the measured dependency report ${absolutePath} could not be read as JSON: ${error.message}`);
  }
  return Array.isArray(parsed?.edges) ? parsed.edges : undefined;
}

/**
 * Read the node list a graph carries.
 *
 * The contract T3 judges is one field: every node carries `file`, the path it
 * is grounded in. A node without one is passed through as `file: null` so T3
 * reports it by identifier instead of dropping it.
 *
 * An absent `--graph` returns undefined rather than an empty list, because an
 * omitted graph and an empty graph are different claims: T3 must fail on the
 * first and may pass on the second.
 */
// [::TICKET::] P22-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-11 --for-spec --no-implementation-order`.
function readGraphNodes(graphPath) {
  if (!graphPath) {
    return undefined;
  }
  const absolutePath = path.resolve(graphPath);
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    throw new Error(`the graph ${absolutePath} could not be read as JSON: ${error.message}`);
  }
  if (!Array.isArray(parsed?.nodes)) {
    throw new Error(`the graph ${absolutePath} does not carry a "nodes" array`);
  }
  return parsed.nodes.map((node) => ({ id: node.id, file: node.file ?? null }));
}

// [::TICKET::] P22-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-11 --for-spec --no-implementation-order`.
function analyzeSpec(specPath) {
  const absPath = path.resolve(specPath);
  const input = readSpecInput(absPath);
  const normalized = normalizeTextBytes(input.rawBuffer);
  const sourceText = Buffer.from(normalized.bytes).toString('utf8');
  const sourceHash = sha256Hex(normalized.bytes);
  const lines = sourceText.split('\n');
  const headings = buildHeadingTree(lines, undefined, { sourceText });
  const warnings = collectHeadingWarnings(lines);
  const segmented = segmentAtHeadings({ sourceText, headings }, { segmentLevel: 2 });
  const reconstruction = verifyReconstruction({ sourceBytes: normalized.bytes, sourceHash, segments: segmented.segments });
  return {
    absPath,
    sourceText,
    sourceHash,
    sourceBytes: Buffer.byteLength(sourceText, 'utf8'),
    sourceCharacters: [...sourceText].length,
    sourceLines: lines.length,
    headings,
    warnings,
    segments: segmented.segments,
    reconstruction,
  };
}

function buildInventory(analysis) {
  const objects = harvestObjectCandidates({ sourceText: analysis.sourceText, headings: analysis.headings, segments: analysis.segments });
  const claims = harvestClaimCandidates({ sourceText: analysis.sourceText, headings: analysis.headings, segments: analysis.segments });
  const normative = harvestNormativeCandidates({ sourceText: analysis.sourceText, headings: analysis.headings, segments: analysis.segments });
  const requirements = harvestRequirementCandidates({ sourceText: analysis.sourceText, headings: analysis.headings, segments: analysis.segments });
  const normalizedObjects = normalizeAliases(objects);
  const categories = harvestCategoryInventory({ sourceText: analysis.sourceText, headings: analysis.headings, segments: analysis.segments });
  const unresolvedCandidates = normalizedObjects.candidates
    .filter((candidate) => candidate.classification === 'unknown')
    .map((candidate) => ({ kind: 'unknown-classification', id: candidate.id, canonical_name: candidate.canonical_name }));
  return {
    objects: normalizedObjects.candidates,
    claims,
    invariants: categories.invariants,
    stateMachines: categories.stateMachines,
    errorCodes: categories.errorCodes,
    requiredTests: categories.requiredTests,
    terms: [...normative, ...requirements],
    normalization_decisions: normalizedObjects.decisions,
    unresolved_candidates: unresolvedCandidates,
  };
}

function prepareInventory(analysis, decisions) {
  const rawInventory = buildInventory(analysis);
  const ownership = decisions.ownership;
  const approvals = decisions.approvals;
  const objects = applyApprovals(applyOwnership(rawInventory.objects, 'owner_package', ownership), approvals);
  const claims = applyApprovals(applyOwnership(rawInventory.claims, 'primary_owner', ownership), approvals);
  const terms = applyApprovals(rawInventory.terms, approvals);
  const approvedIds = new Set(approvals.map((approval) => approval.decisionId));
  const unresolvedCandidates = rawInventory.unresolved_candidates
    .filter((candidate) => !approvedIds.has(candidate.id) && !approvedIds.has(candidate.canonical_name))
    .concat(
      terms
        .filter((candidate) => candidate.normalization_status === 'REVIEW_REQUIRED')
        .map((candidate) => ({ kind: 'review-required', id: candidate.id, canonical_name: candidate.canonical_name }))
    )
    .concat(
      claims
        .filter((candidate) => (candidate.review_status ?? candidate.normalization_status) === 'REVIEW_REQUIRED')
        .map((candidate) => ({ kind: 'review-required', id: candidate.id, canonical_name: candidate.canonical_name }))
    );
  return {
    objects,
    claims,
    invariants: rawInventory.invariants,
    stateMachines: rawInventory.stateMachines,
    errorCodes: rawInventory.errorCodes,
    requiredTests: rawInventory.requiredTests,
    terms,
    normalization_decisions: rawInventory.normalization_decisions,
    unresolved_candidates: unresolvedCandidates,
  };
}

function buildAdaptersSection(decisions) {
  const adapters = decisions.adapters;
  return {
    ports: Array.isArray(adapters.ports) ? adapters.ports : [],
    leaf_packages: [],
    database_policy: adapters.databasePolicy ?? { applicable: false, raw_sql_prohibited: true },
  };
}

function buildOwnershipTable(inventory, decisions) {
  const packages = decisions.workspace;
  const packageIds = new Set(packages.map((pkg) => pkg.id));
  const entries = [];
  // An entry without a resolved catalog owner is unallocated material: it stays out
  // of the ownership table (the orphan counts are what stop the run before COMPLETE),
  // so stage 2 never receives a half-owned table it would have to refuse.
  for (const candidate of inventory.objects ?? []) {
    if (packageIds.has(candidate.owner_package)) {
      entries.push({ inventory_ref: candidate.id, canonical_name: candidate.canonical_name, category: 'object', owner_package: candidate.owner_package });
    }
  }
  for (const candidate of inventory.claims ?? []) {
    if (packageIds.has(candidate.primary_owner)) {
      entries.push({ inventory_ref: candidate.id, canonical_name: candidate.canonical_name, category: 'claim', owner_package: candidate.primary_owner });
    }
  }
  const categoryLists = [
    ['invariants', 'invariant', 'invariants'],
    ['stateMachines', 'state_machine', 'state_machines'],
    ['errorCodes', 'error_code', 'error_codes'],
    ['requiredTests', 'required_test', 'required_tests'],
  ];
  for (const [listKey, categoryName, ownsKey] of categoryLists) {
    const ownerByInventoryId = buildCategoryOwnerIndex(packages, ownsKey);
    for (const candidate of inventory[listKey] ?? []) {
      const owner = ownerByInventoryId.get(candidate.id);
      if (!packageIds.has(owner)) {
        continue;
      }
      entries.push({
        inventory_ref: candidate.id,
        canonical_name: candidate.canonical_name ?? candidate.id,
        category: categoryName,
        owner_package: owner,
      });
    }
  }
  return { entries, packages: [...packageIds] };
}

function buildCategoryOwnerIndex(packages, ownsKey) {
  const ownerByInventoryId = new Map();
  for (const pkg of packages) {
    for (const inventoryId of pkg.owns?.[ownsKey] ?? []) {
      ownerByInventoryId.set(inventoryId, pkg.id);
    }
  }
  return ownerByInventoryId;
}

function buildConformanceSection(packages) {
  const obligations = (packages ?? [])
    .filter((pkg) => pkg.kind === 'test-support' || pkg.kind === 'conformance')
    .map((pkg) => ({
      package: pkg.id,
      obligation: `${pkg.id} is the conformance/test sink for its layer`,
    }));
  return { test_obligations: obligations, ci_rules: [] };
}

function buildDependencyTables(decisions, packages = []) {
  const edges = decisions.dependencies;
  const presentLayers = new Set(packages.map((pkg) => pkg.layer));
  const forbiddenLayerRules = [];
  for (const [fromLayer, targets] of Object.entries(LAYER_FORBIDDEN_TARGETS)) {
    if (presentLayers.has(fromLayer)) {
      forbiddenLayerRules.push({ from_layer: fromLayer, forbidden_to: [...targets] });
    }
  }
  const devDependencyPolicy = [
    { rule: 'testkit is a dev dependency limited to fixtures and property tests', applies_to: ['test-support'] },
    { rule: 'conformance is a test sink and is never a production dependency', applies_to: ['conformance'] },
  ];
  const normalEdges = edges.filter((edge) => edge.kind !== 'forbidden');
  const forbiddenEdges = edges.filter((edge) => edge.kind === 'forbidden');
  const boundaries = normalEdges.map((edge, index) => ({
    id: `boundary-${String(index + 1).padStart(3, '0')}`,
    consumer_package: edge.from,
    provider_package: edge.to,
    dependency_reason_code: edge.reasonCode ?? null,
    stage2_contract_scope: buildBoundaryContractScope(edge.connectionKind),
  }));
  return {
    orientation: 'consumer_to_direct_dependency',
    normal_edges: normalEdges,
    forbidden_edges: forbiddenEdges,
    forbidden_layer_rules: forbiddenLayerRules,
    dev_dependency_policy: devDependencyPolicy,
    boundaries,
    dag: runDagChecks({ packages, edges: normalEdges, forbiddenEdges }),
  };
}

function buildStage2Handoff(inventory, decisions, dependencyReview) {
  const candidates = dependencyReview?.candidates ?? [];
  const reviews = decisions.dependency_reviews ?? [];
  const specHandoff = {
    spec_defects: decisions.spec_defects ?? [],
    // Both kinds of open question travel together: the specification defects the pulse
    // reported and the dependency questions the review raised. The per-directory human
    // grill reads this single list later, so nothing may be dropped on the way.
    residual_questions: [
      ...(decisions.residual_questions ?? []),
      ...collectReviewResiduals({ candidates, reviews }),
    ],
    dependency_reviews: mergeReviewsWithCandidates({ candidates, reviews }),
  };
  const dependencyTables = buildDependencyTables(decisions, decisions.workspace);
  const definitionOrder = [
    ...(inventory.objects ?? []).map((candidate) => candidate.canonical_name),
    ...(inventory.claims ?? []).map((candidate) => candidate.canonical_name),
    ...(inventory.terms ?? []).map((candidate) => candidate.canonical_name ?? candidate.keyword),
  ];
  return {
    ...specHandoff,
    eligible: true,
    entry_gate: {
      required_status: 'COMPLETE',
      source_hash_must_match: true,
      unresolved_count_must_be: 0,
      review_required_count_must_be: 0,
      cycle_count_must_be: 0,
    },
    contract_definition_order: definitionOrder,
    contract_boundaries: dependencyTables.boundaries,
    non_goals_of_stage1: ['No trait method signatures are defined', 'No concrete I/O contract is defined', 'No protocol implementation is defined'],
  };
}

function buildPipelineAdapters(decisions) {
  const adapters = decisions.adapters;
  return {
    ports: Array.isArray(adapters.ports) ? adapters.ports : [],
    databasePolicy: adapters.databasePolicy ?? {},
  };
}

function buildRunSection() {
  return {
    run_id: createRunId(),
    generated_at: new Date().toISOString(),
    generator: { command: COMMAND_NAME, generator_version: GENERATOR_VERSION, node_version: process.version },
  };
}

function buildInputSection(analysis) {
  return {
    spec_path: path.basename(analysis.absPath),
    source_encoding: 'UTF-8',
    newline_normalization: 'LF',
    hash_algorithm: 'SHA-256',
    source_hash: analysis.sourceHash,
    source_bytes: analysis.sourceBytes,
    source_characters: analysis.sourceCharacters,
    source_lines: analysis.sourceLines,
  };
}

/** The specification pulse for one analysis: the gate and the manifest share it. */
function buildSpecPulseForAnalysis(analysis, inventory) {
  return buildSpecPulse({
    sourceText: analysis.sourceText,
    headings: analysis.headings,
    segments: analysis.segments,
    inventory,
  });
}

function buildStructureSection(analysis, inventory, specPulse) {
  return {
    heading_count: analysis.headings.length,
    segment_level: 2,
    segment_count: analysis.segments.length,
    headings: analysis.headings,
    // Each segment declares the harvested material it carries, so stage 2 can tell
    // a segment no seed owes (prose) from one that must be carried.
    segments: attachOwnedInventory({ segments: analysis.segments, inventory }),
    // The pulse reports how the specification reads as a document; the AI settles
    // every candidate before the manifest may be published.
    spec_pulse: specPulse,
    warnings: analysis.warnings,
    reconstruction: analysis.reconstruction,
  };
}

function createRunId() {
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function optionValue(args, flag) {
  for (const arg of args) {
    if (arg.startsWith(`${flag}=`)) {
      return arg.slice(flag.length + 1);
    }
  }
  return undefined;
}

// [::TICKET::] P22-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-11 --for-spec --no-implementation-order`.
function printUsage() {
  return [
    'usage: /workspacify-tree <path-to-specification.md>',
    'subcommands:',
    '  parse <spec>',
    '  extract <spec>',
    '  gate --spec=<path> --decisions=<path>',
    '  finalize --spec=<path> --decisions=<path>',
    '  reverse --spec=<origin-spec.md> --decisions=<path> --root=<project directory>',
    '          [--graph=<path>] [--measured=<path>] [--sidecars=<dir>] [--delta=<path>] [--out=<dir>]',
  ].join('\n') + '\n';
}

main();
