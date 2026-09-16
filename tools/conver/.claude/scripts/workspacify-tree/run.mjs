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
import { copyFileSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';

import { EXIT_CODES } from './lib/errors.mjs';
import {
  ARCHITECTURE_DELTA_FILE_NAME,
  MEASUREMENTS,
  assertPriorUnchanged,
  buildLayerStructureSeam,
  digestFile,
  loadArchitectureDelta,
  mergeSeamIntoDelta,
  readPriorPartition,
  renderLayerStructureSeam,
} from './lib/architecture-delta.mjs';
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
// The reserved root is declared once, in this layer, where both later stages may
// read it without the forward rotation depending on the reverse tree.
import {
  RESERVED_DECISIONS_FILE_NAME,
  RESERVED_MEASURED_EDGES_FILE_NAME,
  RESERVED_ORIGIN_SPEC_FILE_NAME,
  RESERVED_REVERSE_SUBDIRECTORY,
  RESERVED_ROOT_NAME,
  RESERVED_TREE_SUBDIRECTORY,
  reservedReverseDirectory,
  reservedTreeDecisionsPath,
} from './lib/reserved-root.mjs';
import { sweepStagingDecisions } from './lib/staging-decisions.mjs';
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
/**
 * Exit once the streams have drained.
 *
 * `process.exit()` discards whatever a pipe has not accepted yet, so a
 * subcommand answering with megabytes — `extract` lists every pulse candidate it
 * observed — hands its reader a truncated document and still reports success.
 * Setting the exit code and returning lets both writes finish before the process
 * ends; no subcommand leaves a handle open, so it ends as soon as they do.
 */
// [::TICKET::] P24-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-9 --for-spec --no-implementation-order`.
function exitWhenDrained(code) {
  process.exitCode = code;
}

// [::TICKET::] P24-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-9 --for-spec --no-implementation-order`.
function guide(text) {
  process.stderr.write(`[guide] ${text}\n`);
}

// [::TICKET::] P22-11, P24-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P22-11|P24-9) --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  const subcommand = args[0];
  if (subcommand === undefined) {
    process.stdout.write(printUsage());
    return exitWhenDrained(EXIT_CODES.USAGE);
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
      return exitWhenDrained(EXIT_CODES.USAGE);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const gateId = error?.gateId ?? 'GENERAL';
    process.stdout.write(formatFailure({ gateId, reason: message, fixHint: 'correct the reported input or design decision' }));
    guide(`The command stopped at gate ${gateId}. Reason: ${message}. Fix the reported input or decision, then re-run the step; a failed run never publishes or overwrites a manifest.`);
    return exitWhenDrained(EXIT_CODES.FAIL);
  }
}

// [::TICKET::] P24-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-9 --for-spec --no-implementation-order`.
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
  return exitWhenDrained(analysis.reconstruction.status === 'PASS' ? EXIT_CODES.OK : EXIT_CODES.FAIL);
}

// [::TICKET::] P24-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-9 --for-spec --no-implementation-order`.
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
  return exitWhenDrained(EXIT_CODES.OK);
}

/**
 * Refuse a decisions argument on a subcommand that derives the document.
 *
 * Judged before anything is read, so the refusal answers about the argument rather
 * than about a document: a caller who learned the old surface is told the location
 * is not theirs to choose, instead of being read from a file they did not name.
 * The whole token travels, because a refusal naming only the option would leave the
 * path they chose unaccounted for — the dropped question the refusal exists to
 * prevent.
 */
// [::TICKET::] PX-215 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-215 --for-spec --no-implementation-order`.
function refuseDecisionsArgument(args) {
  const drawn = args.filter((token) => token === '--decisions' || token.startsWith('--decisions='));
  if (drawn.length === 0) return;
  throw new Error(
    `withdrawn option ${drawn.map((token) => JSON.stringify(token)).join(', ')} — the decisions document is read `
    + `from ${reservedTreeDecisionsPath(process.cwd())}, which is derived from the subject and is not selectable`,
  );
}

// [::TICKET::] P24-9, PX-215 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P24-9|PX-215) --for-spec --no-implementation-order`.
function runGate(args) {
  refuseDecisionsArgument(args.slice(1));
  const specPath = optionValue(args, '--spec');
  if (!specPath) {
    throw new Error('gate requires --spec=<path>');
  }
  const decisionsPath = reservedTreeDecisionsPath(process.cwd());
  const analysis = analyzeSpec(specPath);
  const decisions = loadDecisionInput(path.resolve(decisionsPath));
  const schemaReport = assertDecisionSchema(decisions);
  if (!schemaReport.ok) {
    throw new Error(`decision schema invalid at ${decisionsPath}: ${schemaReport.errors.map((entry) => entry.message).join('; ')}`);
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
  return exitWhenDrained(pipeline.status === 'COMPLETE' ? EXIT_CODES.OK : EXIT_CODES.FAIL);
}

// [::TICKET::] P22-11, P24-9, PX-215 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P22-11|P24-9|PX-215) --for-spec --no-implementation-order`.
function runFinalize(args) {
  refuseDecisionsArgument(args.slice(1));
  const specPath = optionValue(args, '--spec');
  if (!specPath) {
    throw new Error('finalize requires --spec=<path>');
  }
  const decisionsPath = reservedTreeDecisionsPath(process.cwd());
  const prepared = prepareForwardPipeline(specPath, decisionsPath);
  if (prepared.pipeline.status !== 'COMPLETE') {
    return reportPipelineFailure(prepared.pipeline, 'Finalize');
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
    return exitWhenDrained(EXIT_CODES.FAIL);
  }

  // Staging, and the doctrine says the script deletes it: the published manifest is
  // the record of what was decided, and this document is what the gate read on the
  // way there. Swept only after a publication that succeeded, so a refused run
  // leaves the author's document where they can repair it.
  sweepStagingDecisions(decisionsPath);

  process.stdout.write(
    formatSuccess({
      manifestAbsPath: published.manifestAbsPath,
      sourceHash: prepared.analysis.sourceHash,
      manifestHash: manifest.integrity.manifest_hash,
      gateSummary: prepared.pipeline.gates.map((gate) => `${gate.id}:${gate.status}`).join(' '),
    }) + '\n'
  );
  guide(`Finalize PASS: WORKSPACIFY-TREE-MANIFEST.json was atomically published to the current directory, reload-verified, and passes the ALLOCATE entry-gate parity (all categories owned, tree consistent, boundaries covered). This file is the single input for the next stage /workspacify-allocate.`);
  return exitWhenDrained(EXIT_CODES.OK);
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
// [::TICKET::] P22-11, PX-215 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P22-11|PX-215) --for-spec --no-implementation-order`.
function prepareForwardPipeline(specPath, decisionsPath) {
  const analysis = analyzeSpec(specPath);
  const decisions = loadDecisionInput(path.resolve(decisionsPath));
  const schemaReport = assertDecisionSchema(decisions);
  if (!schemaReport.ok) {
    throw new Error(`decision schema invalid at ${decisionsPath}: ${schemaReport.errors.map((entry) => entry.message).join('; ')}`);
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
// [::TICKET::] P22-11, P24-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P22-11|P24-9) --for-spec --no-implementation-order`.
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
  return exitWhenDrained(EXIT_CODES.FAIL);
}

/**
 * The options `reverse` once honoured and no longer does, each with the reason it left.
 *
 * Withdrawal belongs to the entrance that lost the option rather than to the file,
 * which is why `--spec` is here while `gate` and `finalize` still take it: a caller
 * who names a document is asking a question this subcommand has already settled, and
 * a question dropped in silence reads exactly like one that was answered. The reason
 * travels with the name so the refusal teaches the derived place instead of only
 * reporting that something was wrong.
 */
const WITHDRAWN_FROM_REVERSE_OPTIONS = Object.freeze({
  '--spec': `the origin spec is read from ${RESERVED_ROOT_NAME}/${RESERVED_REVERSE_SUBDIRECTORY}/${RESERVED_ORIGIN_SPEC_FILE_NAME} beneath the subject, and a copy of it is placed at the workspace root before the gates read it.`,
  '--graph': 'the graph is the subject\'s own RFC-ROOT-GRAPH.json. An absent graph keeps the meaning it had when the flag was omitted: T3 judges it exactly as before, because an omitted measurement and an empty one are different claims.',
  '--measured': `the measured dependency report is ${RESERVED_ROOT_NAME}/${RESERVED_REVERSE_SUBDIRECTORY}/${RESERVED_MEASURED_EDGES_FILE_NAME} beneath the subject. An absent report keeps the meaning it had when the flag was omitted, for the same reason as --graph.`,
  '--sidecars': 'the sidecar bundle is the reserved directory itself, which is where the analysis publishes.',
  '--root': `the subject is the directory the command is run in (${process.cwd()}). A caller who named one would be naming, on the next command line, a document this one already knows the place of.`,
  '--delta': `the delta is ${ARCHITECTURE_DELTA_FILE_NAME} at the workspace root, which is also where it is published.`,
  '--out': 'the destination is not selectable. The manifest and the delta belong at the workspace root, beside the ROOT package\'s own four layers.',
  '--prior-partition': 'the layer-structure seam is the subject\'s own RFC-ROOT-Dirs-Tree.json. A subject that carries none is judged exactly as it was before the seam existed.',
  '--decisions': `the decisions document is read from ${RESERVED_ROOT_NAME}/${RESERVED_TREE_SUBDIRECTORY}/${RESERVED_DECISIONS_FILE_NAME} beneath the subject. It is the same document the forward gate and finalize read, read once, so the semantics approved are the semantics applied.`,
});

/**
 * The withdrawn options present in an argument list, as the tokens the caller wrote.
 *
 * The whole token travels rather than the option's name, so `--root=/tmp/x` is
 * reported with the value the caller chose in it: a refusal that named only the
 * option would leave that value unaccounted for, which is the dropped question the
 * refusal exists to prevent.
 */
// [::TICKET::] PX-214, PX-215 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-214|PX-215) --for-spec --no-implementation-order`.
function withdrawnReverseOptionsUsed(args) {
  return args.flatMap((token) => {
    const name = Object.keys(WITHDRAWN_FROM_REVERSE_OPTIONS)
      .find((candidate) => token === candidate || token.startsWith(`${candidate}=`));
    return name === undefined ? [] : [{ name, token }];
  });
}

/** Refuse the withdrawn options a caller used, naming each token and why it cannot be honoured. */
// [::TICKET::] PX-214, PX-215 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-214|PX-215) --for-spec --no-implementation-order`.
function refuseWithdrawnReverseOptions(drawn) {
  if (drawn.length === 0) return;
  const reasons = drawn.map(({ name, token }) => `${token}: ${WITHDRAWN_FROM_REVERSE_OPTIONS[name]}`).join(' ');
  throw new Error(`withdrawn option ${drawn.map(({ token }) => JSON.stringify(token)).join(', ')} — ${reasons}`);
}

/**
 * Refuse a bare argument handed to `reverse`.
 *
 * The subcommand takes none: its subject is the directory it is run in. Ignoring a
 * root the caller supplied would leave them believing a run had been scoped when the
 * scope was never theirs — the same dropped question the withdrawn options are
 * refused for.
 */
// [::TICKET::] PX-214, PX-215 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-214|PX-215) --for-spec --no-implementation-order`.
function refuseReversePositionalArguments(positionals) {
  if (positionals.length === 0) return;
  throw new Error(
    `the reverse subcommand takes no arguments, and ${positionals.map((token) => JSON.stringify(token)).join(', ')} `
    + `was given. The subject is the directory the command is run in (${process.cwd()}), and the origin spec, the `
    + `sidecars and the measured edges are read from ${RESERVED_ROOT_NAME}/${RESERVED_REVERSE_SUBDIRECTORY} beneath it; `
    + 'neither is selectable',
  );
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
// [::TICKET::] P22-11, P23-9, P24-9, PX-214, PX-215 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P22-11|P23-9|P24-9|PX-214|PX-215) --for-spec --no-implementation-order`.
function runReverse(args) {
  // Judged before anything is read: a run that refused only after reading its
  // inputs would still have answered over a subject the caller did not name.
  const given = args.slice(1);
  refuseWithdrawnReverseOptions(withdrawnReverseOptionsUsed(given));
  refuseReversePositionalArguments(given.filter((token) => !token.startsWith('--')));

  const decisionsPath = reservedTreeDecisionsPath(process.cwd());

  // The subject is the directory the command is run in, and the destination is
  // that same directory: the fifth layer belongs at the workspace root, beside
  // the ROOT package's own four layers, and not beneath the reserved root where
  // the analysis keeps its documents.
  const derived = resolveReverseInputs();
  const { measuredRoot, graphPath, outDir } = derived;
  const specPath = placeOriginSpecBesideTheManifest(derived);

  const prepared = prepareForwardPipeline(specPath, decisionsPath);
  if (prepared.pipeline.status !== 'COMPLETE') {
    return reportPipelineFailure(prepared.pipeline, 'Reverse mode');
  }

  const packages = prepared.decisions.workspace;
  const { measured, sidecarFiles, seam, delta } = readReverseInputs({ derived, packages });

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
    graph: { nodes: readGraphNodes(graphPath) },
    resolveFilePath: (file) => path.resolve(measuredRoot, file),
    delta,
    seam,
    sidecarFiles,
    reverseProvenance,
  });
  const summary = summarizeReverseGates(records);
  if (summary.status !== 'COMPLETE') {
    return reportReverseFailure(records, summary);
  }

  // Swept for the same reason the forward finalize sweeps it: the manifest this run
  // published is the record of what was decided, and the document the gate read is
  // staging. Leaving it would put a second copy of the decisions beside a manifest
  // that already carries them.
  sweepStagingDecisions(decisionsPath);
  publishAndReportReverse({ outcome: { manifest, records, prepared, outDir, measuredRoot }, seam });
}

/**
 * Publish the judged manifest and print the outcome, or refuse and name why.
 *
 * The publication is a gate of its own: a refused publish changes nothing on disk, so
 * the report has to say what was refused rather than leave the operator reading a run
 * that appears to have produced nothing for no reason.
 *
 * The seam is printed in prose beside the gate report because the JSON section alone is
 * read by a machine: an operator deciding what to do about a redrawn boundary needs the
 * two partitions named together with the classes between them, which is what the prose
 * carries and the delta's arrays do not.
 */
// [::TICKET::] P23-9, P24-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P23-9|P24-9) --for-spec --no-implementation-order`.
function publishAndReportReverse({ outcome, seam = null }) {
  const { manifest, records, prepared, outDir, measuredRoot } = outcome;
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
    return exitWhenDrained(EXIT_CODES.FAIL);
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
  if (seam !== null) {
    process.stdout.write(renderLayerStructureSeam(seam));
  }
  process.stdout.write(renderReverseReport(records));
  return exitWhenDrained(EXIT_CODES.OK);
}

/** Everything a reverse run is given: the tree, the sidecars, and the delta with its seam. */
// [::TICKET::] P23-9, PX-214, PX-215 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P23-9|PX-214|PX-215) --for-spec --no-implementation-order`.
function readReverseInputs({ derived, packages }) {
  const measuredTree = measureDirectoryTree(derived.measuredRoot);
  return {
    measured: {
      directories: measuredTree.directories,
      sourceFiles: measuredTree.sourceFiles,
      edges: readMeasuredEdges(derived.measuredEdgesPath),
    },
    sidecarFiles: listSidecarFiles(derived.sidecarDir),
    ...resolveDeltaWithSeam({ derived, packages }),
  };
}

/**
 * The delta T5 will judge, with the seam taken and published when the subject carries one.
 *
 * A subject with no prior partition is judged exactly as it was before the seam
 * existed: the authored delta is returned untouched, and no seam is published.
 */
// [::TICKET::] P23-9, PX-214, PX-215 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P23-9|PX-214|PX-215) --for-spec --no-implementation-order`.
function resolveDeltaWithSeam({ derived, packages }) {
  const authoredDelta = loadArchitectureDelta(derived.deltaPath);

  if (derived.priorPartitionPath === null) {
    return { seam: null, delta: authoredDelta };
  }
  return publishLayerStructureSeam({
    priorPartitionPath: derived.priorPartitionPath,
    measuredRoot: derived.measuredRoot,
    packages,
    deltaPath: derived.deltaPath,
    authoredDelta,
  });
}

/**
 * The inputs a reverse run derives for itself.
 *
 * The rotation measures the directory it is run in, and everything it needs in
 * order to judge that measurement is already on disk: the origin spec the
 * analysis published, the sidecar bundle that analysis produced, and — for a
 * subject that was already driven through conver's loop — its own graph and its
 * own directory tree. Deriving them removes the class of error a caller makes
 * when they name the same document by a different spelling on the next command
 * line; the gates then report a mistyped path as an absent measurement.
 *
 * Two of the lookups are expected to find nothing. A subject that carries no
 * graph and no measurement is judged by T3 and T4 exactly as it was when those
 * flags were omitted, because an omitted measurement and an empty one are
 * different claims and the gates have to be able to tell them apart. So this is
 * a lookup in a declared place rather than a default: the day a stage publishes
 * one, the same call finds it.
 */
// [::TICKET::] PX-214, PX-215 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-214|PX-215) --for-spec --no-implementation-order`.
function resolveReverseInputs() {
  const measuredRoot = process.cwd();
  const reserve = reservedReverseDirectory(measuredRoot);
  return {
    measuredRoot,
    // The manifest and the delta are published at the workspace root, beside the
    // ROOT package's own four layers: §2.2 puts the fifth layer there, and the
    // allocate step reads its plan from exactly that directory.
    outDir: measuredRoot,
    specPath: path.join(reserve, RESERVED_ORIGIN_SPEC_FILE_NAME),
    sidecarDir: reserve,
    measuredEdgesPath: path.join(reserve, RESERVED_MEASURED_EDGES_FILE_NAME),
    graphPath: path.join(measuredRoot, ROOT_GRAPH_FILE_NAME),
    priorPartitionPath: existsSync(path.join(measuredRoot, ROOT_DIRS_TREE_FILE_NAME))
      ? path.join(measuredRoot, ROOT_DIRS_TREE_FILE_NAME)
      : null,
    deltaPath: path.join(measuredRoot, ARCHITECTURE_DELTA_FILE_NAME),
  };
}

/**
 * Put the origin spec at the workspace root and return the path to read it from.
 *
 * Stage two resolves the recorded `input.spec_path`, which is a basename, against
 * the manifest's directory and refuses a specification that is not there — its
 * own gate advice says to keep the specification *next to the manifest*. The
 * analysis publishes the origin spec beneath the reserved root, where its own
 * walks can write, so the rotation places it at the workspace root before
 * anything reads it. A run that skipped this would assemble a manifest whose
 * specification stage two cannot find, and would only discover that one command
 * later.
 */
// [::TICKET::] PX-214, PX-215 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-214|PX-215) --for-spec --no-implementation-order`.
function placeOriginSpecBesideTheManifest({ specPath, outDir }) {
  const beside = path.join(outDir, path.basename(specPath));
  if (beside !== specPath && !existsSync(beside)) {
    copyFileSync(specPath, beside);
  }
  return beside;
}

/** The subject's own graph, which a project already driven through conver's loop carries. */
const ROOT_GRAPH_FILE_NAME = 'RFC-ROOT-GRAPH.json';

/** The subject's own directory tree, which is the layer-structure seam such a subject carries. */
const ROOT_DIRS_TREE_FILE_NAME = 'RFC-ROOT-Dirs-Tree.json';

/**
 * Take the seam, publish it into the delta, and hand back the record T5 will judge.
 *
 * A pattern-2 or pattern-3 subject was running its four-layer cycle when the boundaries
 * were redrawn, so the old partition and the new one differ and the difference is a
 * finding (§3.2, §3.4). It is published into the delta rather than kept in memory for the
 * same reason every other analysis document is: a difference nobody wrote down is the
 * contradiction §2.4 defines, and T5 passes on the recording rather than on the two
 * partitions agreeing.
 *
 * The prior is digested before it is read and again after, because a run that rewrote the
 * old Dirs-Tree and then measured against it would be reporting agreement with itself.
 * The record returned carries the merged mismatch list, so T5 judges the document that
 * was written rather than the one that was there before it.
 */
// [::TICKET::] P23-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-9 --for-spec --no-implementation-order`.
function publishLayerStructureSeam({ priorPartitionPath, measuredRoot, packages, deltaPath, authoredDelta }) {
  const priorBeforeDigest = existsSync(priorPartitionPath) ? digestFile(priorPartitionPath) : null;
  const prior = readPriorPartition(priorPartitionPath);

  const seam = buildLayerStructureSeam({
    oldPartition: prior,
    newPartition: {
      source: `measured tree at ${measuredRoot}`,
      paths: packages.map((pkg) => pkg.path),
    },
    measurement: MEASUREMENTS.ROOT_INCLUDING,
  });

  if (priorBeforeDigest !== null) {
    assertPriorUnchanged({
      path: priorPartitionPath,
      beforeDigest: priorBeforeDigest,
      afterDigest: digestFile(priorPartitionPath),
    });
  }

  const merged = mergeSeamIntoDelta({ mismatches: authoredDelta.mismatches }, seam);
  writeFileSync(deltaPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');

  return { seam, delta: { exists: true, mismatches: merged.mismatches } };
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
// [::TICKET::] P22-11, P24-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P22-11|P24-9) --for-spec --no-implementation-order`.
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
  return exitWhenDrained(EXIT_CODES.FAIL);
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

// [::TICKET::] P22-11, P23-9, PX-214, PX-215 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P22-11|P23-9|PX-214|PX-215) --for-spec --no-implementation-order`.
function printUsage() {
  return [
    'usage: /workspacify-tree <path-to-specification.md>',
    'subcommands:',
    '  parse <spec>',
    '  extract <spec>',
    '  gate --spec=<path>',
    '  finalize --spec=<path>',
    '  reverse',
    '          The specification is the one argument, and it survives because it is the',
    '          entire input of pattern 4: an empty project holds nothing from which a',
    '          specification path could be derived.',
    `          The decisions document is read from ${RESERVED_ROOT_NAME}/${RESERVED_TREE_SUBDIRECTORY}/${RESERVED_DECISIONS_FILE_NAME}`,
    '          beneath the subject, which is the directory the command is run in. So is',
    '          everything reverse derives: the origin spec and the sidecar bundle from the',
    '          reserved directory beneath it, the graph and the layer-structure seam from the',
    '          subject itself, and the manifest and the delta are published beside them, at',
    '          the workspace root. None of those is selectable, because a caller who named',
    '          one would be naming on the next command line a document this one already knows',
    '          the place of.',
  ].join('\n') + '\n';
}

main();
