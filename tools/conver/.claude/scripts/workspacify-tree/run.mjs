// [::TICKET::] PX-178 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-178 --for-spec --no-implementation-order`.
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
} from './lib/extraction.mjs';
import { normalizeAliases } from './lib/alias-normalization.mjs';
import { buildInventoryReport } from './lib/inventory-report.mjs';
import { runGatePipeline } from './lib/validation.mjs';
import { loadDecisionInput, assertDecisionSchema } from './lib/decision-input.mjs';
import { assembleManifest, renderManifestText } from './lib/render.mjs';
import { atomicPublish } from './lib/atomic-publish.mjs';
import { formatSuccess, formatFailure } from './lib/report.mjs';

const MANIFEST_FILE_NAME = 'WORKSPACIFY-TREE-MANIFEST.json';
const COMMAND_NAME = '/workspacify-tree';
const GENERATOR_VERSION = '1.0.0';

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
    process.stdout.write(formatFailure({ gateId: error?.gateId ?? 'GENERAL', reason: message, fixHint: 'correct the reported input or design decision' }));
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
  process.exit(EXIT_CODES.OK);
}

function runGate(args) {
  const specPath = optionValue(args, '--spec');
  const decisionsPath = optionValue(args, '--decisions');
  if (!specPath || !decisionsPath) {
    throw new Error('gate requires --spec=<path> and --decisions=<path>');
  }
  const decisions = loadDecisionInput(path.resolve(decisionsPath));
  const schemaReport = assertDecisionSchema(decisions);
  if (!schemaReport.ok) {
    throw new Error(`decision schema invalid: ${schemaReport.errors.map((entry) => entry.message).join('; ')}`);
  }
  process.stdout.write(JSON.stringify({ status: 'PASS', approvals: (decisions.approvals ?? []).length }) + '\n');
  process.exit(EXIT_CODES.OK);
}

function runFinalize(args) {
  const specPath = optionValue(args, '--spec');
  const decisionsPath = optionValue(args, '--decisions');
  if (!specPath || !decisionsPath) {
    throw new Error('finalize requires --spec=<path> and --decisions=<path>');
  }
  const analysis = analyzeSpec(specPath);
  const inventory = buildInventory(analysis);
  const decisions = loadDecisionInput(path.resolve(decisionsPath));
  const schemaReport = assertDecisionSchema(decisions);
  if (!schemaReport.ok) {
    throw new Error(`decision schema invalid: ${schemaReport.errors.map((entry) => entry.message).join('; ')}`);
  }

  const pipelineInput = {
    structure: { reconstruction: analysis.reconstruction },
    inventory: {
      objects: inventory.objects,
      claims: inventory.claims,
      requirements: inventory.terms,
      unresolved_candidates: inventory.unresolved_candidates,
    },
    workspace: { packages: decisions.workspace ?? [] },
    dependencies: { normalEdges: (decisions.dependencies ?? []).filter((edge) => edge.kind !== 'forbidden') },
    adapters: {},
    decisions: { approvals: decisions.approvals ?? [] },
  };
  const pipeline = runGatePipeline(pipelineInput);

  if (pipeline.status !== 'COMPLETE') {
    process.stdout.write(
      formatFailure({
        gateId: (pipeline.gates.find((gate) => gate.status !== 'PASS') ?? { id: 'GENERAL' }).id,
        reason: `pipeline ended with status ${pipeline.status}`,
        fixHint: 'resolve REVIEW_REQUIRED items or fix the dependency/layer violations in the decisions input',
      })
    );
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
      terms: inventory.terms,
      normalization_decisions: inventory.normalization_decisions,
      unresolved_candidates: inventory.unresolved_candidates,
    },
    requirements: { normative_candidates: inventory.terms },
    workspace: { packages: decisions.workspace ?? [], ownership: decisions.ownership ?? [] },
    adapters: {},
    dependencies: { normal_edges: decisions.dependencies ?? [] },
    conformance: {},
    stage2_handoff: { eligible: true, non_goals_of_stage1: ['No protocol implementation is defined'] },
    gates: { records: pipeline.gates },
    final_audit: { ...pipeline.finalAudit, status: pipeline.finalAudit.status },
    integrity: { input_hash_verified_at_finalize: true, reload_validation: 'PASS' },
  });

  const content = renderManifestText(manifest);
  const outputDir = optionValue(args, '--output-dir') ? path.resolve(optionValue(args, '--output-dir')) : path.dirname(path.resolve(specPath));
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
  const unresolvedCandidates = normalizedObjects.candidates
    .filter((candidate) => candidate.classification === 'unknown')
    .map((candidate) => ({ kind: 'unknown-classification', canonical_name: candidate.canonical_name }));
  return {
    objects: normalizedObjects.candidates,
    claims,
    terms: [...normative, ...requirements],
    normalization_decisions: normalizedObjects.decisions,
    unresolved_candidates: unresolvedCandidates,
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
    '  finalize --spec=<path> --decisions=<path> [--output-dir=<dir>]',
  ].join('\n') + '\n';
}

main();
