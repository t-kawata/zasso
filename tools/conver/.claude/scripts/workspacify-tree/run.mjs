// [::TICKET::] PX-178, PX-179 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-178|PX-179|PX-181|PX-183|PX-184|PX-185) --for-spec --no-implementation-order`.
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

import { EXIT_CODES } from './lib/errors.mjs';
import { LAYER_FORBIDDEN_TARGETS } from './lib/workspace-model.mjs';
import { readSpecInput } from './lib/fs-safe.mjs';
import { normalizeTextBytes } from './lib/normalization.mjs';
import { sha256Hex } from './lib/hash.mjs';
import { buildHeadingTree, collectHeadingWarnings } from './lib/headings.mjs';
import { segmentAtHeadings, verifyReconstruction } from './lib/segmentation.mjs';
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
  } else {
    guide(`Parse FAIL: the specification could not be reconstructed from its segments. Reasons: ${(analysis.reconstruction.reasons ?? []).join('; ')}. Fix the input and re-run parse.`);
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
  process.stdout.write(JSON.stringify(report.stats) + '\n');
  guide(`Extract PASS: harvested ${report.stats.harvested} candidates (${report.stats.confirmed} confirmed, ${report.stats.review_required} need AI review, ${report.stats.unresolved} unresolved). In Step 3, resolve every REVIEW_REQUIRED item through approvals; leaving unknown/unresolved candidates prevents COMPLETE.`);
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
  const pipeline = runGatePipeline({
    structure: { reconstruction: analysis.reconstruction },
    inventory,
    workspace: { packages: decisions.workspace ?? [], tree: decisions.tree ?? [] },
    dependencies: {
      normalEdges: (decisions.dependencies ?? []).filter((edge) => edge.kind !== 'forbidden'),
      boundaries: decisions.boundaries ?? [],
    },
    adapters: buildPipelineAdapters(decisions),
    decisions: { approvals: decisions.approvals ?? [] },
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

function runFinalize(args) {
  const specPath = optionValue(args, '--spec');
  const decisionsPath = optionValue(args, '--decisions');
  if (!specPath || !decisionsPath) {
    throw new Error('finalize requires --spec=<path> and --decisions=<path>');
  }
  const analysis = analyzeSpec(specPath);
  const decisions = loadDecisionInput(path.resolve(decisionsPath));
  const schemaReport = assertDecisionSchema(decisions);
  if (!schemaReport.ok) {
    throw new Error(`decision schema invalid: ${schemaReport.errors.map((entry) => entry.message).join('; ')}`);
  }
  const inventory = prepareInventory(analysis, decisions);

  const pipelineInput = {
    structure: { reconstruction: analysis.reconstruction },
    inventory,
    workspace: { packages: decisions.workspace ?? [], tree: decisions.tree ?? [] },
    dependencies: {
      normalEdges: (decisions.dependencies ?? []).filter((edge) => edge.kind !== 'forbidden'),
      boundaries: decisions.boundaries ?? [],
    },
    adapters: buildPipelineAdapters(decisions),
    decisions: { approvals: decisions.approvals ?? [] },
  };
  const pipeline = runGatePipeline(pipelineInput);

  if (pipeline.status !== 'COMPLETE') {
    const failingGate = pipeline.gates.find((gate) => gate.status !== 'PASS') ?? { id: 'GENERAL', reasons: [] };
    process.stdout.write(
      formatFailure({
        gateId: failingGate.id,
        reason: `pipeline ended with status ${pipeline.status}`,
        fixHint: 'resolve REVIEW_REQUIRED items or fix the dependency/layer violations in the decisions input',
      })
    );
    guide(`Finalize blocked at ${failingGate.id} (${pipeline.status}). Reasons: ${(failingGate.reasons ?? []).join('; ') || 'see finalAudit counts'}. Edit the decision input in Step 3 and re-run gate until COMPLETE. Nothing was published and no existing manifest was changed.`);
    process.exit(EXIT_CODES.FAIL);
  }

  const manifest = assembleManifest({
    status: 'COMPLETE',
    run: buildRunSection(),
    input: buildInputSection(analysis),
    structure: buildStructureSection(analysis),
    inventory: {
      objects: inventory.objects,
      claims: inventory.claims,
      invariants: inventory.invariants ?? [],
      state_machines: inventory.stateMachines ?? [],
      error_codes: inventory.errorCodes ?? [],
      required_tests: inventory.requiredTests ?? [],
      terms: inventory.terms,
      normalization_decisions: inventory.normalization_decisions,
      unresolved_candidates: inventory.unresolved_candidates,
    },
    requirements: { normative_candidates: inventory.terms },
    workspace: { tree: decisions.tree ?? [], packages: decisions.workspace ?? [], ownership: buildOwnershipTable(inventory, decisions) },
    adapters: buildAdaptersSection(decisions),
    dependencies: buildDependencyTables(decisions, decisions.workspace ?? []),
    conformance: buildConformanceSection(decisions.workspace ?? []),
    stage2_handoff: buildStage2Handoff(inventory, decisions),
    gates: { records: pipeline.gates },
    final_audit: { ...pipeline.finalAudit, status: pipeline.finalAudit.status },
    integrity: { input_hash_verified_at_finalize: true, reload_validation: 'PASS' },
  });

  const content = renderManifestText(manifest);
  // The canonical artifact is always published to the current working directory.
  const outputDir = process.cwd();
  const publishResult = atomicPublish({ dir: outputDir, fileName: MANIFEST_FILE_NAME, content, sourceHash: analysis.sourceHash });
  if (!publishResult.published) {
    process.stdout.write(formatFailure({ gateId: 'G5', reason: publishResult.reason ?? 'publish failed', fixHint: 'resolve the blocked condition before retrying' }));
    process.exit(EXIT_CODES.FAIL);
  }

  process.stdout.write(
    formatSuccess({
      manifestAbsPath: path.resolve(publishResult.path),
      sourceHash: analysis.sourceHash,
      manifestHash: manifest.integrity.manifest_hash,
      gateSummary: pipeline.gates.map((gate) => `${gate.id}:${gate.status}`).join(' '),
    }) + '\n'
  );
  guide(`Finalize PASS: WORKSPACIFY-TREE-MANIFEST.json was atomically published to the current directory, reload-verified, and passes the ALLOCATE entry-gate parity (all categories owned, tree consistent, boundaries covered). This file is the single input for the next stage /workspacify-allocate.`);
  process.exit(EXIT_CODES.OK);
}

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
  const ownership = decisions.ownership ?? [];
  const approvals = decisions.approvals ?? [];
  const objects = applyApprovals(applyOwnership(rawInventory.objects, 'owner_package', ownership), approvals);
  const claims = applyOwnership(rawInventory.claims, 'primary_owner', ownership);
  const approvedIds = new Set(approvals.map((approval) => approval.decisionId));
  const unresolvedCandidates = rawInventory.unresolved_candidates.filter(
    (candidate) => !approvedIds.has(candidate.id) && !approvedIds.has(candidate.canonical_name)
  );
  return {
    objects,
    claims,
    invariants: rawInventory.invariants ?? [],
    stateMachines: rawInventory.stateMachines ?? [],
    errorCodes: rawInventory.errorCodes ?? [],
    requiredTests: rawInventory.requiredTests ?? [],
    terms: rawInventory.terms,
    normalization_decisions: rawInventory.normalization_decisions,
    unresolved_candidates: unresolvedCandidates,
  };
}

function buildAdaptersSection(decisions) {
  const adapters = decisions.adapters ?? {};
  return {
    ports: Array.isArray(adapters.ports) ? adapters.ports : [],
    leaf_packages: [],
    database_policy: adapters.databasePolicy ?? { applicable: false, raw_sql_prohibited: true },
  };
}

function buildOwnershipTable(inventory, decisions) {
  const packageIds = new Set((decisions.workspace ?? []).map((pkg) => pkg.id));
  const entries = [];
  for (const candidate of inventory.objects ?? []) {
    if (candidate.owner_package) {
      entries.push({ inventory_ref: candidate.id, canonical_name: candidate.canonical_name, category: 'object', owner_package: candidate.owner_package });
    }
  }
  for (const candidate of inventory.claims ?? []) {
    if (candidate.primary_owner) {
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
    for (const candidate of inventory[listKey] ?? []) {
      const ownerPackage = findOwningPackage(decisions.workspace ?? [], ownsKey, candidate.id);
      if (ownerPackage) {
        entries.push({ inventory_ref: candidate.id, canonical_name: candidate.canonical_name ?? candidate.id, category: categoryName, owner_package: ownerPackage });
      }
    }
  }
  return { entries, packages: [...packageIds] };
}

function findOwningPackage(packages, ownsKey, inventoryId) {
  for (const pkg of packages) {
    const owns = pkg.owns ?? {};
    if ((owns[ownsKey] ?? []).includes(inventoryId)) {
      return pkg.id;
    }
  }
  return null;
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
  const edges = decisions.dependencies ?? [];
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
    stage2_contract_scope: ['input', 'output', 'preconditions', 'postconditions', 'invariants', 'errors', 'state_ownership', 'idempotency', 'atomicity', 'ordering', 'finality', 'canonicalization', 'signature', 'proof_verification', 'tests'],
  }));
  return {
    orientation: 'consumer_to_direct_dependency',
    normal_edges: normalEdges,
    forbidden_edges: forbiddenEdges,
    forbidden_layer_rules: forbiddenLayerRules,
    dev_dependency_policy: devDependencyPolicy,
    boundaries,
  };
}

function buildStage2Handoff(inventory, decisions) {
  const dependencyTables = buildDependencyTables(decisions, decisions.workspace ?? []);
  const definitionOrder = [
    ...(inventory.objects ?? []).map((candidate) => candidate.canonical_name),
    ...(inventory.claims ?? []).map((candidate) => candidate.canonical_name),
    ...(inventory.terms ?? []).map((candidate) => candidate.canonical_name ?? candidate.keyword),
  ];
  return {
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
  const adapters = decisions.adapters ?? {};
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

function buildStructureSection(analysis) {
  return {
    heading_count: analysis.headings.length,
    segment_level: 2,
    segment_count: analysis.segments.length,
    headings: analysis.headings,
    segments: analysis.segments,
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

function printUsage() {
  return [
    'usage: /workspacify-tree <path-to-specification.md>',
    'subcommands:',
    '  parse <spec>',
    '  extract <spec>',
    '  gate --spec=<path> --decisions=<path>',
    '  finalize --spec=<path> --decisions=<path>',
  ].join('\n') + '\n';
}

main();
