#!/usr/bin/env node
// [::TICKET::] PX-313 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-313 --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-275 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-275 --for-spec --no-implementation-order`.
/**
 * smooth-sequences — the final mechanical acceptance gate of the design pipeline.
 *
 * Usage:
 *   node "$(git rev-parse --show-toplevel)/.claude/scripts/smooth-sequences/run.mjs" [--audit] [--advisory-readings]
 *   node "$(git rev-parse --show-toplevel)/.claude/scripts/smooth-sequences/run.mjs" <workspace-root> [--audit] [--advisory-readings]
 *
 * The current directory, or the single argument when one is given, is the workspace root
 * itself. The root must hold both manifests directly; the command never walks up to a
 * parent. The command reads the workspace and writes only under <root>/smooth-sequences/:
 * the report pair and the generation status.
 *
 * Exit 0 means every registered check executed over an authored surface and found
 * nothing. Exit 1 means at least one blocking finding. Exit 2 means the workspace could
 * not be read, exit 3 means a judgment-required transaction is the next action, and
 * exit 4 means the run is unproven: a required surface was absent or synthesized, a
 * reading is unresolved, or the artifact was downgraded from v3 to v2. `--audit` reports
 * every finding and the would-be exit but always exits 0.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { CHECK_FAMILY_COUNT, evaluateCheckRegistry } from './lib/check-registry.mjs';
import { runClosureGates } from './lib/closure-gates.mjs';
import { buildCertificate, writeCertificate } from '../shared-obligations/certificate.mjs';
import { decideAll } from '../shared-obligations/decide.mjs';
import { readEvidenceManifest, sha256File, validateManifestReceipts, validateWriteReceipts } from '../shared-obligations/evidence.mjs';
import { EVIDENCE_FILE_PATHS } from '../shared-obligations/evidence-writer.mjs';
import { buildWorklist } from '../shared-obligations/judgment.mjs';
import { resolveCensusObligations, resolveConsistencyObligations, resolveMechanicalObligations, resolveReadingsObligations } from '../shared-obligations/predicates.mjs';
import { attackReaderForGeneration, readerForGeneration } from '../shared-obligations/reader.mjs';
import { deriveObligations } from '../shared-obligations/registry.mjs';
import { summarizeInstrument } from '../shared-obligations/instrument.mjs';
import { readPinnedCensus } from '../shared-obligations/source-census.mjs';
import { riskFieldForClass } from '../shared-obligations/risk-fields.mjs';
import { SmoothSequencesError } from './lib/errors.mjs';
import { compareFindingSets, computeFindingKey, readWaivers } from './lib/evidence-ledger.mjs';
import { computeFindingKeysDigest, MODE_VERIFICATION, readStatus, writeGeneration } from './lib/generation.mjs';
import { summarizeProvenance } from './lib/provenance.mjs';
import { readReadingsForRegistry, summarizeReadings } from './lib/readings-summary.mjs';
import {
  annotatePersisted,
  buildReport,
  EXIT_FINDINGS,
  EXIT_JUDGMENT,
  EXIT_MISUSE,
  EXIT_PASS,
  EXIT_UNPROVEN,
  readFindingBaseline,
  renderConsoleReport,
} from './lib/report.mjs';
import { classifyVerdict } from './lib/verdict.mjs';
import { verifyChain } from '../regeneration/lib/chain.mjs';
import { recoverCommit } from '../regeneration/lib/commit.mjs';
import { RegenerationError } from '../regeneration/lib/errors.mjs';
import { STATES, activeTransaction } from '../regeneration/lib/ledger.mjs';
import { groundHandoff } from '../regeneration/lib/transaction.mjs';
import { indexArtifact } from './lib/index.mjs';
import { producerForBlockedSurface } from './lib/repair-route.mjs';
import { writeWorklist } from './lib/worklist.mjs';
import { assertWorkspaceRoot, loadWorkspace, startDirectoryFor } from './lib/workspace.mjs';
import { snapshotDesignFiles } from '../regeneration/lib/staging.mjs';
import { calibrationVerdict, readCalibration } from './calibrate.mjs';

// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
const AUDIT_FLAG = '--audit';
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
const ADVISORY_READINGS_FLAG = '--advisory-readings';
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
const LEGACY_FLAG = '--legacy';
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
const REQUIRE_EFFORT_FLAG = '--require-effort';
// [::TICKET::] PX-297 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-297 --for-spec --no-implementation-order`.
const STRICT_FRESHNESS_FLAG = '--strict-freshness';
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
const SCOPE_PREFIX = '--scope=';
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
const SCHEMA_V2 = 2;
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
const SCHEMA_V3 = 3;

/**
 * Whether this run must prove observable effort.
 *
 * Closure mode is the final acceptance gate, so it owes strict evidence whether or not the
 * caller remembers a flag. --legacy keeps closureMode false, so the flags remain the only
 * way to ask for strict evidence in a workspace that is not claiming closure.
 */
// [::TICKET::] PX-311 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-311 --for-spec --no-implementation-order`.
function strictEvidenceFor({ closureMode, parsed }) {
  return closureMode || parsed.requireEffort === true || parsed.strictFreshness === true;
}

/** The argument parser: one optional root, the audit flag, the readings policy, legacy and scope. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-297 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-297) --for-spec --no-implementation-order`.
function parseArguments(argv) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const audit = argv.includes(AUDIT_FLAG);
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const advisoryReadings = argv.includes(ADVISORY_READINGS_FLAG);
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const legacy = argv.includes(LEGACY_FLAG);
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const requireEffort = argv.includes(REQUIRE_EFFORT_FLAG);
  const strictFreshness = argv.includes(STRICT_FRESHNESS_FLAG);
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const scopeArgument = argv.find((argument) => argument.startsWith(SCOPE_PREFIX));
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const scope = scopeArgument === undefined ? null : scopeArgument.slice(SCOPE_PREFIX.length);
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const paths = argv.filter((argument) => argument !== AUDIT_FLAG
    && argument !== ADVISORY_READINGS_FLAG
    && argument !== LEGACY_FLAG
    && argument !== REQUIRE_EFFORT_FLAG
    && argument !== STRICT_FRESHNESS_FLAG
    && !argument.startsWith(SCOPE_PREFIX));
  if (paths.length > 1) {
    return { misuse: true, audit, advisoryReadings, legacy, requireEffort, strictFreshness, scope, root: null };
  }
  return {
    misuse: false, audit, advisoryReadings, legacy, requireEffort, strictFreshness,
    scope, root: startDirectoryFor(paths[0]),
  };
}

/** The members a borrowed census lists for one role, or null when it lists none. */
// [::TICKET::] PX-283, PX-284, PX-285, PX-297 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-283|PX-284|PX-285|PX-297) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function countCensusMembers(artifact, role) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const pins = artifact?.pins?.sourceEnumerations;
  if (!Array.isArray(pins)) return null;
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const pin = pins.find((entry) => entry?.role === role);
  return Array.isArray(pin?.members) ? pin.members.length : null;
}

/** One JSON file under the root, or null when it is absent or unreadable. */
// [::TICKET::] PX-289, PX-290, PX-297 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-289|PX-290|PX-297) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function readJsonIfPresent(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** JSONL rows under the root, or an empty list when the file is absent or unreadable. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-297 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-297) --for-spec --no-implementation-order`.
function readJsonLinesIfPresent(path) {
  if (!existsSync(path)) return [];
  try {
    return readFileSync(path, 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

/** The package RFCs, keyed by package id, for RFC basis resolution. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-297 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-297) --for-spec --no-implementation-order`.
function readRfcByPackage(loaded) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const result = {};
  for (const pkg of loaded.packages ?? []) {
    if (typeof pkg?.rfc !== 'string') continue;
    result[pkg.id] = { path: join(pkg.path, 'RFC.md'), lines: pkg.rfc.split('\n') };
  }
  return result;
}

/** The current digests a phase receipt is checked against. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-297 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-297) --for-spec --no-implementation-order`.
function currentReceiptDigests(root, loaded, evidenceManifest) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const digests = {};
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const specRelative = loaded.artifact?.spec?.path;
  if (typeof specRelative === 'string' && specRelative !== '') {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const specPath = resolve(root, specRelative);
    if (existsSync(specPath)) digests.spec = sha256File(specPath);
  }
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const declarationPath = join(root, 'educe-sequences', 'declaration.json');
  if (existsSync(declarationPath)) digests.declaration = sha256File(declarationPath);
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const worklistPath = join(root, 'educe-sequences', 'worklist.txt');
  if (existsSync(worklistPath)) digests.worklist = sha256File(worklistPath);
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const artifactPath = loaded.artifactPath ?? evidenceManifest?.artifact?.path;
  if (typeof artifactPath === 'string' && existsSync(artifactPath)) digests.artifact = sha256File(artifactPath);
  return digests;
}

/** The census and declaration the obligation registry compares the artifact against. */
// [::TICKET::] PX-289, PX-290, PX-297, PX-303 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-289|PX-290|PX-297|PX-303) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function censusFor(root, artifact) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const declaration = readJsonIfPresent(join(root, 'educe-sequences', 'declaration.json'));
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const pins = Array.isArray(artifact?.pins?.sourceEnumerations) ? artifact.pins.sourceEnumerations : [];
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const operationPin = pins.find((entry) => entry?.role === 'operations');
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const operations = Array.isArray(operationPin?.members)
    ? operationPin.members
    : (artifact?.operations ?? []).map((entry) => entry.id);
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const entries = Array.isArray(declaration?.entries)
    ? declaration.entries.map((entry) => entry.id)
    : (artifact?.sequences ?? []).map((entry) => entry.id);
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const sections = Array.isArray(declaration?.sections)
    ? declaration.sections.map((entry) => entry.id)
    : (artifact?.sections ?? []).map((entry) => entry.id);
  const operationCensus = operationPin === undefined ? null : readPinnedCensus(root, operationPin);
  return { census: { operations, entries, sections }, declaration: declaration ?? {}, operationCensus };
}

/** The denominator each demand axis is measured against, as far as the workspace states it. */
// [::TICKET::] PX-283, PX-284, PX-285, PX-288, PX-297 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-283|PX-284|PX-285|PX-288|PX-297) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function summarizeDenominator(loaded) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const operations = loaded.artifact?.operations ?? [];
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const active = operations.filter((operation) => operation?.disposition === 'active').length;
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const realized = (loaded.artifact?.sequences ?? []).filter((sequence) => sequence?.outcome !== 'notASequence').length;
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const sequencesCensus = countCensusMembers(loaded.artifact, 'sequences');
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const entryRegions = countCensusMembers(loaded.artifact, 'entries');
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const requiredInterfaces = loaded.vocabulary.requiredInterfaces === null ? null : loaded.vocabulary.requiredInterfaces.length;
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const pinnedColumns = Array.isArray(loaded.artifact?.pins?.columns) ? loaded.artifact.pins.columns.length : null;
  return {
    operations: { all: operations.length, active },
    sequences: {
      realized,
      entryRegions,
      source: sequencesCensus === null ? 'artifact' : 'census',
      members: sequencesCensus ?? realized,
    },
    boundaries: Array.isArray(loaded.allocateManifest?.contract_registry) ? loaded.allocateManifest.contract_registry.length : null,
    surfaces: { requiredInterfaces, demandColumns: pinnedColumns ?? requiredInterfaces },
  };
}

/**
 * A digest of every design input the detector reads.
 *
 * The report digest alone cannot tell a failed repair from no repair: the finding set
 * may survive while the workspace moved. Hashing the input set makes that difference
 * visible, and snapshotDesignFiles is the pipeline's existing definition of the set.
 */
// [::TICKET::] PX-281, PX-285, PX-297 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-281|PX-285|PX-297) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function computeInputDigest(root) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const snapshot = snapshotDesignFiles(root);
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const lines = Object.keys(snapshot).sort().map((path) => `${path}\u0000${snapshot[path]}`);
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

/** The console line that says which generation this pass stands in. */
// [::TICKET::] PX-281, PX-285 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-281|PX-285) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function renderGenerationLine(result) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const mode = result.mode === MODE_VERIFICATION ? 'verification; no new generation' : 'new generation';
  return `generation: ${result.generation} (${mode})`;
}

/**
 * The schema history, including a prior generation that recorded v3 but had no history
 * field of its own.
 *
 * Older status files predate `schemaHistory`. The archived report still records that the
 * artifact was v3, and that record is the evidence a downgrade must be judged against.
 */
// [::TICKET::] PX-285, PX-297 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-285|PX-297) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function mergeSchemaHistory(history, provenance) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const merged = Array.isArray(history) ? [...history] : [];
  if (provenance?.toSchemaVersion === SCHEMA_V3 && !merged.includes(SCHEMA_V3)) merged.push(SCHEMA_V3);
  return merged;
}

/** The downgrade record, or null when the current artifact did not step back from v3. */
// [::TICKET::] PX-285 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-285 --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function detectDowngrade({ status, baseline, artifact }) {
  if (artifact?.schema_version !== SCHEMA_V2) return null;
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const history = Array.isArray(status?.schemaHistory) ? status.schemaHistory : [];
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const baselineTo = baseline?.provenance?.toSchemaVersion;
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const baselineStatus = baseline?.provenance?.status;
  if (history.includes(SCHEMA_V3) || baselineTo === SCHEMA_V3 || baselineStatus === 'recorded') {
    return { code: 'UNPROVEN_DOWNGRADE', from: SCHEMA_V3, to: SCHEMA_V2 };
  }
  return null;
}

/**
 * Run the detector.
 *
 * @param {string[]} argv — zero arguments (current directory) or one workspace root
 * @param {{ stdout?: (line: string) => void, stderr?: (line: string) => void }} [io]
 * @returns {{ exitCode: number, report: object|null }}
 */
// [::TICKET::] PX-273 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-273 --for-spec --no-implementation-order`.
// [::TICKET::] PX-276 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-276 --for-spec --no-implementation-order`.
// [::TICKET::] PX-277 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-277 --for-spec --no-implementation-order`.
// [::TICKET::] PX-285 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-285 --for-spec --no-implementation-order`.

/** Resolve an interrupted commit, refuse an open transaction, and verify the chain. */
// [::TICKET::] PX-278, PX-279, PX-280, PX-297, PX-341 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-278|PX-279|PX-280|PX-297|PX-341) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-341 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-341 --for-spec --no-implementation-order`.
function regenerationGate(root, stderr, { allowTransaction } = {}) {
  // A commit verifies its own live write while the ledger still says committing.
  // Recovering first would close the journal before the detector judged the result,
  // so the named transaction is allowed through; every other consumer is refused.
  if (allowTransaction !== undefined) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const committing = activeTransaction(root);
    if (committing !== null && committing.id === allowTransaction) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
      const chain = verifyChain(root);
      if (chain.declared && !chain.ok) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
        const codes = chain.links.filter((entry) => !entry.ok).map((entry) => `${entry.link}:${entry.code}`);
        stderr(`smooth-sequences: SILENT_CHANGE_DETECTED: ${codes.join(', ')}`);
        stderr('next: restore the generation from the archive or open a regeneration; never edit a frozen input in place.');
        return { active: committing, refused: true };
      }
      return { active: committing, refused: false };
    }
  }
  recoverCommit(root);
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const active = activeTransaction(root);
  if (active !== null && active.state !== STATES.JUDGMENT_REQUIRED) {
    if (typeof active.pending === 'string' && active.pending.length > 0) {
      stderr(`smooth-sequences: REGENERATION_HANDOFF: transaction ${active.id} is waiting for the educe handoff`);
      stderr(`next: ${active.pending}`);
      return { active, refused: true, handoff: true };
    }
    stderr(`smooth-sequences: TRANSACTION_OPEN: transaction ${active.id} is ${active.state}`);
    stderr('next: node "$(git rev-parse --show-toplevel)/.claude/scripts/regeneration/run.mjs" continue');
    return { active, refused: true };
  }
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const chain = verifyChain(root);
  if (chain.declared && !chain.ok) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const codes = chain.links.filter((entry) => !entry.ok).map((entry) => `${entry.link}:${entry.code}`);
    stderr(`smooth-sequences: SILENT_CHANGE_DETECTED: ${codes.join(', ')}`);
    stderr('next: restore the generation from the archive or open a regeneration; never edit a frozen input in place.');
    return { active, refused: true };
  }
  return { active, refused: false };
}

/** The boundary an obligation names, before any step suffix. */
// [::TICKET::] PX-291, PX-292, PX-293, PX-297 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-291|PX-292|PX-293|PX-297) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function boundaryIdOf(subject) {
  return String(subject ?? '').split('/')[0];
}

/** The anchors a judgment basis may cite for one obligation. */
// [::TICKET::] PX-291, PX-292, PX-293, PX-297 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-291|PX-292|PX-293|PX-297) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function anchorSetFor(obligation) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const anchorSet = { spec: [], contract: [], artifact: [], view: [], ledger: [] };
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const id = String(obligation.id ?? '');
  if (id.startsWith('JUDGE:')) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const field = String(obligation.predicate ?? '').replace('judgment:', '') || 'judgment';
    anchorSet.contract.push({ boundaryId: boundaryIdOf(obligation.subject), field });
  } else if (id.startsWith('DIST:FIDELITY:')) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const subject = String(obligation.subject ?? '');
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const separator = subject.indexOf('/');
    if (separator > 0) anchorSet.view.push({ packageId: subject.slice(0, separator), unitId: subject.slice(separator + 1) });
  } else if (id.startsWith('RISK:') || id.startsWith('PROP:')) {
    const [, operationId, riskClass] = id.split(':');
    // The id names the risk class; the artifact row names the field that carries it.
    // Citing the class as a field put every risk judgment out of scope and left the
    // obligation open even when the cited value was the one the mapping selects.
    const field = riskFieldForClass(riskClass) ?? riskClass;
    anchorSet.artifact.push({ id: operationId, field });
  }
  return anchorSet;
}

/** The evidence context one worklist item carries. */
// [::TICKET::] PX-291, PX-292, PX-293, PX-297 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-291|PX-292|PX-293|PX-297) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function contextForObligation(obligation) {
  return {
    obligationId: obligation.id,
    subject: obligation.subject,
    claim: obligation.claim,
    anchorSet: anchorSetFor(obligation),
  };
}

/** The specification lines a basis quote is checked against. */
// [::TICKET::] PX-291, PX-292, PX-293, PX-297 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-291|PX-292|PX-293|PX-297) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function readSpecLines(root, artifact) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const relative = artifact?.spec?.path;
  if (typeof relative !== 'string' || relative.length === 0) return {};
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const path = resolve(root, relative);
  if (!existsSync(path)) return {};
  return { [relative]: readFileSync(path, 'utf8').split('\n') };
}

// [::TICKET::] PX-286 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-286 --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-306 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-306 --for-spec --no-implementation-order`.
// [::TICKET::] PX-310 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-310 --for-spec --no-implementation-order`.
export function runCommand(argv, io = {}) {
// [::TICKET::] PX-302 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-302 --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const stdout = io.stdout ?? ((line) => process.stdout.write(`${line}\n`));
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const stderr = io.stderr ?? ((line) => process.stderr.write(`${line}\n`));
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const parsed = parseArguments(argv);

  if (parsed.misuse) {
    stderr(`smooth-sequences: usage: run.mjs [workspace-root] [${AUDIT_FLAG}] [${ADVISORY_READINGS_FLAG}] [${LEGACY_FLAG}] [${SCOPE_PREFIX}<obligation-prefix>]`);
    return { exitCode: EXIT_MISUSE, report: null };
  }

  try {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const root = assertWorkspaceRoot(parsed.root);
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const gate = regenerationGate(root, stderr, { allowTransaction: io.allowTransaction });
    if (gate.refused) return { exitCode: EXIT_MISUSE, report: null };
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const loaded = loadWorkspace(root);
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const status = readStatus(root);
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const baseline = readFindingBaseline(root);
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const previousSchemaVersions = mergeSchemaHistory(status?.schemaHistory, baseline?.provenance);
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const provenance = summarizeProvenance(loaded.artifact, { previousSchemaVersions });
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const downgrade = detectDowngrade({ status, baseline, artifact: loaded.artifact });

// [::TICKET::] PX-299, PX-311 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-299|PX-311) --for-spec --no-implementation-order`.
    const evidenceManifest = readEvidenceManifest(root);
    // The closure gates are the design-authoring gates. They are measured only where the
    // workspace claims the whole pipeline: an artifact or evidence manifest, and both
    // manifests those gates read. A unit fixture carrying neither is not claiming closure,
    // and refusing it for a tree it never had would measure nothing.
    const closureMode = !parsed.legacy
      && (evidenceManifest !== null || loaded.artifact?.schema_version === SCHEMA_V3)
      && loaded.treeManifest !== null && loaded.treeManifest !== undefined
      && loaded.allocateManifest !== null && loaded.allocateManifest !== undefined;
    // The evidence policy is a property of the run, computed once before any consumer.
    // Closure mode is the final acceptance gate, so it owes strict evidence without a flag.
    const strictEvidence = strictEvidenceFor({ closureMode, parsed });
// [::TICKET::] PX-295, PX-296, PX-311 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-295|PX-296|PX-311) --for-spec --no-implementation-order`.
    const index = {
      ...indexArtifact(loaded),
      linesByPath: strictEvidence ? readSpecLines(root, loaded.artifact) : undefined,
    };
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const evaluation = evaluateCheckRegistry(index);
    const closure = closureMode
      ? (io.runClosureGates ?? runClosureGates)({ root })
      : { ok: true, gates: [] };
    const closureBlocked = closure.gates
      .filter((gate) => gate.exitCode !== 0)
      .map((gate) => ({
        checkId: `CLOSURE:${gate.script}`,
        family: 'closure',
        surface: 'design-authoring-gate',
        reason: gate.reason || `${gate.script} exited ${gate.exitCode}`,
        producer: gate.script,
        repairClass: 'regeneration',
      }));
    const calibration = readCalibration(root);
    const calibrationCheck = calibrationVerdict(calibration);
    const calibrationBlocked = closureMode && !calibrationCheck.ok
      ? [{
        checkId: calibrationCheck.code,
        family: 'assurance',
        surface: 'smooth-sequences/CALIBRATION.json',
        reason: calibrationCheck.code === 'CALIBRATION_MISSING'
          ? 'the closure run has no CALIBRATION.json; run smooth-sequences/calibrate.mjs'
          : 'the calibration did not detect every seeded defect',
        producer: 'smooth-sequences/calibrate.mjs',
        repairClass: 'in-place',
      }]
      : [];
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const blocked = [
      ...evaluation.blocked.map((entry) => ({
        ...entry,
        producer: producerForBlockedSurface(entry.surface),
        repairClass: 'regeneration',
      })),
      ...closureBlocked,
      ...calibrationBlocked,
    ];
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const waivers = readWaivers(root);
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const waiverByKey = new Map(waivers.map((waiver) => [waiver.findingKey, waiver]));
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const waivedCurrent = evaluation.findings
      .filter((finding) => waiverByKey.has(computeFindingKey(finding)))
      .map((finding) => ({ ...finding, waiver: waiverByKey.get(computeFindingKey(finding)) }));
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const unwaivedFindings = evaluation.findings
      .filter((finding) => !waiverByKey.has(computeFindingKey(finding)));
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const ledger = compareFindingSets(baseline, unwaivedFindings, { blocked, waivers });
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const findings = annotatePersisted([...unwaivedFindings, ...ledger.withdrawn], baseline);

// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const rawReadings = readReadingsForRegistry(root);
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    let certificate = null;
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    let worklist = [];
    let readings;
    let effortEvidence = [];
    if (closureMode) {
      const { census, declaration, operationCensus } = censusFor(root, loaded.artifact);
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
      let registry = deriveObligations({
        census,
        declaration,
        artifact: loaded.artifact,
        treeManifest: loaded.treeManifest,
        allocateManifest: loaded.allocateManifest,
        packages: loaded.packages,
        readings: rawReadings,
        mechanical: evaluation,
        operationCensus,
      });
      registry = resolveMechanicalObligations(registry, evaluation);
      registry = resolveCensusObligations(registry, {
        census,
        artifact: loaded.artifact,
        treeManifest: loaded.treeManifest,
        allocateManifest: loaded.allocateManifest,
        packages: loaded.packages,
      });
      registry = resolveConsistencyObligations(registry, {
        operationCensus,
        artifact: loaded.artifact,
        packages: loaded.packages,
        allocateManifest: loaded.allocateManifest,
      });
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
      const manifestArtifactDigest = evidenceManifest?.artifact?.sha256 ?? null;
      const artifactDigest = typeof loaded.artifactPath === 'string' && existsSync(loaded.artifactPath)
        ? sha256File(loaded.artifactPath)
        : manifestArtifactDigest;
      const artifactDigestMismatch = manifestArtifactDigest !== null
        && artifactDigest !== null
        && manifestArtifactDigest !== artifactDigest;
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
      const specLines = readSpecLines(root, loaded.artifact);
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
      // A judgment may cite an RFC line whatever the effort gate is. Reading the RFCs
      // only in strict mode refused every distribution-fidelity basis with
      // BASIS_QUOTE_MISSING, which is a false open rather than a missing reading.
      const rfcByPackage = readRfcByPackage(loaded);
      // The claim anchor may be a specification line or a package RFC line; both must be
      // available to the searched-quote resolver, or a correct RFC citation is refused.
      const searchableSources = { ...specLines };
      for (const document of Object.values(rfcByPackage ?? {})) {
        if (Array.isArray(document?.lines)) searchableSources[document.path] = document.lines;
      }
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
      const educeStatus = readJsonIfPresent(join(root, 'educe-sequences', 'status.json'));
      const generation = educeStatus?.generation ?? null;
      const generationStartedAt = educeStatus?.generationStartedAt ?? null;
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
      const phaseReceiptDebt = strictEvidence && evidenceManifest !== null
        ? validateManifestReceipts(evidenceManifest, currentReceiptDigests(root, loaded, evidenceManifest)).stale
        : [];
      const writeReceiptDebt = strictEvidence && evidenceManifest !== null
        ? validateWriteReceipts(evidenceManifest, {
          root,
          paths: EVIDENCE_FILE_PATHS,
          generation,
        }).stale
        : [];
      const artifactReceiptDebt = strictEvidence && artifactDigestMismatch
        ? [{
          code: 'ARTIFACT_DIGEST_MISMATCH',
          reason: `manifest artifact sha ${manifestArtifactDigest} does not name the artifact ${artifactDigest}`,
        }]
        : [];
      const receiptDebt = [...phaseReceiptDebt, ...writeReceiptDebt, ...artifactReceiptDebt];
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
      const effortRecords = strictEvidence
        ? readJsonLinesIfPresent(join(root, 'educe-sequences', 'readings-effort.jsonl'))
        : [];
      effortEvidence = effortRecords;
      registry = resolveReadingsObligations(registry, {
        readings: rawReadings,
        artifactDigest,
        ...(strictEvidence ? {
          linesByPath: specLines,
          inheritedPolicy: 'block',
          generation,
          generationStartedAt,
        } : {}),
      });
      readings = {
        ...summarizeReadings(root, { registry }),
        policy: parsed.advisoryReadings ? 'advisory' : 'blocking',
      };
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
      const reader = readerForGeneration({ generation: educeStatus?.generation });
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
      const attackReader = attackReaderForGeneration({ generation: educeStatus?.generation });
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
      const openSemantic = registry.filter((entry) => entry.class === 'semantic'
        && entry.state === 'open'
        && (parsed.scope === null || parsed.scope === '' || entry.id.startsWith(parsed.scope)));
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
      const contexts = Object.fromEntries(openSemantic.map((entry) => [entry.id, contextForObligation(entry)]));
      worklist = buildWorklist(openSemantic, contexts, {
        artifactDigest,
        reader,
        attackReader,
        requireRecordId: true,
        requireEffort: strictEvidence,
        generation,
        generationStartedAt,
      });
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
      const decisionSet = decideAll({
        obligations: registry,
        worklist,
        judgments: rawReadings.judgment,
        attacks: rawReadings.attack,
        effort: effortRecords,
        artifactDigest,
        linesByPath: specLines,
        staleReceipts: receiptDebt,
        generation,
        // The evidence surfaces a judgment may cite are validated in every run, not
        // only under the effort gate. Withholding them turned a correct RFC or artifact
        // basis into BASIS_QUOTE_MISSING/BASIS_OUT_OF_SCOPE and left the obligation open.
        artifact: loaded.artifact,
        contractRegistry: loaded.allocateManifest.contract_registry ?? [],
        rfcByPackage,
        sources: searchableSources,
        // The anchor closure is the effort gate's promise. A reading obligation may carry
        // no anchor at all, so requiring one in the default run would reopen 543 readings
        // that have nothing to anchor to. The surfaces above still validate every basis.
        requireAnchor: strictEvidence,
      });
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
      const openIds = new Set(
        decisionSet.decisions.filter((entry) => entry.state === 'open').map((entry) => entry.obligationId),
      );
      worklist = worklist.filter((item) => openIds.has(item.obligationId));
      certificate = buildCertificate({
        obligations: registry,
        decisions: decisionSet.decisions,
        checks: evaluation.subChecks,
        readings,
        inputs: {
          spec: loaded.artifact?.spec?.sha256 ?? null,
          artifact: artifactDigest,
          evidenceManifest: evidenceManifest?.generation ?? null,
          exemptions: (declaration.exemptions ?? []).length,
        },
        assurance: decisionSet.metrics,
        receiptDebt,
        closureGates: closure.gates,
      });
    } else {
      readings = {
        ...summarizeReadings(root),
        policy: parsed.advisoryReadings ? 'advisory' : 'blocking',
      };
    }
    // The diagnostic is computed from the same evidence the verdict used, so the two
    // can never describe different runs.
    const instrument = summarizeInstrument({
      readings,
      judgments: rawReadings.judgment ?? [],
      attacks: rawReadings.attack ?? [],
      effort: effortEvidence,
    });
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const unresolvedReadings = readings.policy === 'advisory'
      ? 0
      : (closureMode
        ? (certificate.status === 'complete' ? 0 : 1)
        : (readings.inquest?.yes ?? 0) + (readings.withheld?.length ?? 0) + (readings.uncovered?.unresolved ?? 0));
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const decision = classifyVerdict({
      findings,
      blocked,
      unresolvedReadings,
      downgrade,
      certificate,
    });

// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    let exitCode = decision.exitCode;
    if (gate.active?.state === STATES.JUDGMENT_REQUIRED) exitCode = EXIT_JUDGMENT;
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const wouldExit = exitCode;
    if (parsed.audit && (exitCode === EXIT_FINDINGS || exitCode === EXIT_UNPROVEN)) exitCode = EXIT_PASS;
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const verdict = parsed.audit ? 'audit' : decision.verdict;

// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const executed = evaluation.subChecks.filter((entry) => entry.status === 'executed').length;
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const checks = {
      families: CHECK_FAMILY_COUNT,
      run: executed,
      blocked: blocked.length,
      failed: findings.length,
      subChecks: evaluation.subChecks,
    };
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const withheld = [
      ...blocked.map((entry) => ({ layer: entry.family, check: entry.checkId, reason: entry.reason })),
      ...readings.withheld,
    ];
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const denominator = summarizeDenominator(loaded);
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const report = buildReport({
      workspace: loaded,
      findings,
      withheld,
      blocked,
      waived: [...ledger.waived, ...waivedCurrent],
      downgrade,
      checks,
      provenance,
      readings,
      instrument,
      denominator,
      verdict,
      evidencePolicy: strictEvidence ? 'strict' : 'legacy',
      wouldExit: parsed.audit ? wouldExit : null,
    });
    if (certificate !== null) report.certificate = certificate;
    report.calibration = {
      digest: calibration?.digest ?? null,
      digestValid: calibration?.digestValid ?? false,
      seeds: calibration?.seeds ?? [],
      verdict: calibrationCheck,
    };
    if (closureMode) {
      report.remainingOpen = worklist.length;
      report.effortDebt = certificate?.open?.length ?? 0;
    }
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const generation = writeGeneration({
      root,
      report,
      inputDigest: computeInputDigest(root),
      exitCode,
      findingKeysDigest: computeFindingKeysDigest(findings),
      schemaHistory: provenance.schemaHistory,
      calibrationDigest: calibration?.digest ?? null,
    });
    if (closureMode) {
      writeCertificate(root, certificate);
      writeWorklist(root, worklist, {
        generation: generation?.generation ?? null,
        worklistDigest: worklist[0]?.worklistDigest ?? null,
        legacy: !strictEvidence,
      });
    }
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const consoleLines = renderConsoleReport(report, generation);
    consoleLines.splice(1, 0, renderGenerationLine(generation));
    if (gate.active?.state === STATES.JUDGMENT_REQUIRED) {
      consoleLines.push(`transaction: judgment-required — ${gate.active.reason ?? 'a ground no longer resolves'}`);
      consoleLines.push(`next: ${groundHandoff(gate.active)}`);
    }
    for (const line of consoleLines) stdout(line);
    return { exitCode, report };
  } catch (error) {
    if (error instanceof RegenerationError) {
      stderr(`smooth-sequences: ${error.code}: ${error.message}${error.repair ? ` — ${error.repair}` : ''}`);
      stderr('next: fix the workspace and rerun; no report was written.');
      return { exitCode: EXIT_MISUSE, report: null };
    }
    if (error instanceof SmoothSequencesError) {
      stderr(`smooth-sequences: ${error.code}: ${error.message}${error.repair ? ` — ${error.repair}` : ''}`);
    } else {
      stderr(`smooth-sequences: ${error.message}`);
    }
    stderr('next: fix the workspace and rerun; no report was written.');
    return { exitCode: EXIT_MISUSE, report: null };
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = runCommand(process.argv.slice(2)).exitCode;
}
