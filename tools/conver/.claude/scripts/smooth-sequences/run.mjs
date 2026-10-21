#!/usr/bin/env node
// [::TICKET::] PX-275 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-275 --for-spec --no-implementation-order`.
/**
 * smooth-sequences — the final mechanical acceptance gate of the design pipeline.
 *
 * Usage:
 *   node .claude/scripts/smooth-sequences/run.mjs [--audit] [--advisory-readings]
 *   node .claude/scripts/smooth-sequences/run.mjs <workspace-root> [--audit] [--advisory-readings]
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
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { CHECK_FAMILY_COUNT, evaluateCheckRegistry } from './lib/check-registry.mjs';
import { buildCertificate, writeCertificate } from '../shared-obligations/certificate.mjs';
import { decideAll } from '../shared-obligations/decide.mjs';
import { readEvidenceManifest } from '../shared-obligations/evidence.mjs';
import { buildWorklist } from '../shared-obligations/judgment.mjs';
import { resolveCensusObligations, resolveMechanicalObligations, resolveReadingsObligations } from '../shared-obligations/predicates.mjs';
import { attackReaderForGeneration, readerForGeneration } from '../shared-obligations/reader.mjs';
import { deriveObligations } from '../shared-obligations/registry.mjs';
import { SmoothSequencesError } from './lib/errors.mjs';
import { compareFindingSets, readWaivers } from './lib/evidence-ledger.mjs';
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
import { assertWorkspaceRoot, loadWorkspace, startDirectoryFor } from './lib/workspace.mjs';
import { snapshotDesignFiles } from '../regeneration/lib/staging.mjs';

const AUDIT_FLAG = '--audit';
const ADVISORY_READINGS_FLAG = '--advisory-readings';
const LEGACY_FLAG = '--legacy';
const SCOPE_PREFIX = '--scope=';
const SCHEMA_V2 = 2;
const SCHEMA_V3 = 3;

/** The argument parser: one optional root, the audit flag, the readings policy, legacy and scope. */
// [::TICKET::] PX-283, PX-284, PX-285, PX-292, PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-283|PX-284|PX-285|PX-292|PX-293) --for-spec --no-implementation-order`.
function parseArguments(argv) {
  const audit = argv.includes(AUDIT_FLAG);
  const advisoryReadings = argv.includes(ADVISORY_READINGS_FLAG);
  const legacy = argv.includes(LEGACY_FLAG);
  const scopeArgument = argv.find((argument) => argument.startsWith(SCOPE_PREFIX));
  const scope = scopeArgument === undefined ? null : scopeArgument.slice(SCOPE_PREFIX.length);
  const paths = argv.filter((argument) => argument !== AUDIT_FLAG
    && argument !== ADVISORY_READINGS_FLAG
    && argument !== LEGACY_FLAG
    && !argument.startsWith(SCOPE_PREFIX));
  if (paths.length > 1) return { misuse: true, audit, advisoryReadings, legacy, scope, root: null };
  return { misuse: false, audit, advisoryReadings, legacy, scope, root: startDirectoryFor(paths[0]) };
}

/** The members a borrowed census lists for one role, or null when it lists none. */
// [::TICKET::] PX-283, PX-284, PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-283|PX-284|PX-285) --for-spec --no-implementation-order`.
function countCensusMembers(artifact, role) {
  const pins = artifact?.pins?.sourceEnumerations;
  if (!Array.isArray(pins)) return null;
  const pin = pins.find((entry) => entry?.role === role);
  return Array.isArray(pin?.members) ? pin.members.length : null;
}

/** One JSON file under the root, or null when it is absent or unreadable. */
// [::TICKET::] PX-289, PX-290 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-289|PX-290) --for-spec --no-implementation-order`.
function readJsonIfPresent(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** The census and declaration the obligation registry compares the artifact against. */
// [::TICKET::] PX-289, PX-290 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-289|PX-290) --for-spec --no-implementation-order`.
function censusFor(root, artifact) {
  const declaration = readJsonIfPresent(join(root, 'educe-sequences', 'declaration.json'));
  const pins = Array.isArray(artifact?.pins?.sourceEnumerations) ? artifact.pins.sourceEnumerations : [];
  const operationPin = pins.find((entry) => entry?.role === 'operations');
  const operations = Array.isArray(operationPin?.members)
    ? operationPin.members
    : (artifact?.operations ?? []).map((entry) => entry.id);
  const entries = Array.isArray(declaration?.entries)
    ? declaration.entries.map((entry) => entry.id)
    : (artifact?.sequences ?? []).map((entry) => entry.id);
  const sections = Array.isArray(declaration?.sections)
    ? declaration.sections.map((entry) => entry.id)
    : (artifact?.sections ?? []).map((entry) => entry.id);
  return { census: { operations, entries, sections }, declaration: declaration ?? {} };
}

/** The denominator each demand axis is measured against, as far as the workspace states it. */
// [::TICKET::] PX-283, PX-284, PX-285, PX-288 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-283|PX-284|PX-285|PX-288) --for-spec --no-implementation-order`.
function summarizeDenominator(loaded) {
  const operations = loaded.artifact?.operations ?? [];
  const active = operations.filter((operation) => operation?.disposition === 'active').length;
  const realized = (loaded.artifact?.sequences ?? []).filter((sequence) => sequence?.outcome !== 'notASequence').length;
  const sequencesCensus = countCensusMembers(loaded.artifact, 'sequences');
  const entryRegions = countCensusMembers(loaded.artifact, 'entries');
  const requiredInterfaces = loaded.vocabulary.requiredInterfaces === null ? null : loaded.vocabulary.requiredInterfaces.length;
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
// [::TICKET::] PX-281, PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-281|PX-285) --for-spec --no-implementation-order`.
function computeInputDigest(root) {
  const snapshot = snapshotDesignFiles(root);
  const lines = Object.keys(snapshot).sort().map((path) => `${path}\u0000${snapshot[path]}`);
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

/** The console line that says which generation this pass stands in. */
// [::TICKET::] PX-281, PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-281|PX-285) --for-spec --no-implementation-order`.
function renderGenerationLine(result) {
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
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
function mergeSchemaHistory(history, provenance) {
  const merged = Array.isArray(history) ? [...history] : [];
  if (provenance?.toSchemaVersion === SCHEMA_V3 && !merged.includes(SCHEMA_V3)) merged.push(SCHEMA_V3);
  return merged;
}

/** The downgrade record, or null when the current artifact did not step back from v3. */
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
function detectDowngrade({ status, baseline, artifact }) {
  if (artifact?.schema_version !== SCHEMA_V2) return null;
  const history = Array.isArray(status?.schemaHistory) ? status.schemaHistory : [];
  const baselineTo = baseline?.provenance?.toSchemaVersion;
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
// [::TICKET::] PX-273 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-273 --for-spec --no-implementation-order`.
// [::TICKET::] PX-276 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-276 --for-spec --no-implementation-order`.
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.

/** Resolve an interrupted commit, refuse an open transaction, and verify the chain. */
// [::TICKET::] PX-278, PX-279, PX-280 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-278|PX-279|PX-280) --for-spec --no-implementation-order`.
function regenerationGate(root, stderr, { allowTransaction } = {}) {
  // A commit verifies its own live write while the ledger still says committing.
  // Recovering first would close the journal before the detector judged the result,
  // so the named transaction is allowed through; every other consumer is refused.
  if (allowTransaction !== undefined) {
    const committing = activeTransaction(root);
    if (committing !== null && committing.id === allowTransaction) {
      const chain = verifyChain(root);
      if (chain.declared && !chain.ok) {
        const codes = chain.links.filter((entry) => !entry.ok).map((entry) => `${entry.link}:${entry.code}`);
        stderr(`smooth-sequences: SILENT_CHANGE_DETECTED: ${codes.join(', ')}`);
        stderr('next: restore the generation from the archive or open a regeneration; never edit a frozen input in place.');
        return { active: committing, refused: true };
      }
      return { active: committing, refused: false };
    }
  }
  recoverCommit(root);
  const active = activeTransaction(root);
  if (active !== null && active.state !== STATES.JUDGMENT_REQUIRED) {
    if (typeof active.pending === 'string' && active.pending.length > 0) {
      stderr(`smooth-sequences: REGENERATION_HANDOFF: transaction ${active.id} is waiting for the educe handoff`);
      stderr(`next: ${active.pending}`);
      return { active, refused: true, handoff: true };
    }
    stderr(`smooth-sequences: TRANSACTION_OPEN: transaction ${active.id} is ${active.state}`);
    stderr('next: node .claude/scripts/regeneration/run.mjs continue');
    return { active, refused: true };
  }
  const chain = verifyChain(root);
  if (chain.declared && !chain.ok) {
    const codes = chain.links.filter((entry) => !entry.ok).map((entry) => `${entry.link}:${entry.code}`);
    stderr(`smooth-sequences: SILENT_CHANGE_DETECTED: ${codes.join(', ')}`);
    stderr('next: restore the generation from the archive or open a regeneration; never edit a frozen input in place.');
    return { active, refused: true };
  }
  return { active, refused: false };
}

/** The boundary an obligation names, before any step suffix. */
// [::TICKET::] PX-291, PX-292, PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-291|PX-292|PX-293) --for-spec --no-implementation-order`.
function boundaryIdOf(subject) {
  return String(subject ?? '').split('/')[0];
}

/** The anchors a judgment basis may cite for one obligation. */
// [::TICKET::] PX-291, PX-292, PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-291|PX-292|PX-293) --for-spec --no-implementation-order`.
function anchorSetFor(obligation) {
  const anchorSet = { spec: [], contract: [], artifact: [], view: [], ledger: [] };
  const id = String(obligation.id ?? '');
  if (id.startsWith('JUDGE:')) {
    const field = String(obligation.predicate ?? '').replace('judgment:', '') || 'judgment';
    anchorSet.contract.push({ boundaryId: boundaryIdOf(obligation.subject), field });
  } else if (id.startsWith('DIST:FIDELITY:')) {
    const subject = String(obligation.subject ?? '');
    const separator = subject.indexOf('/');
    if (separator > 0) anchorSet.view.push({ packageId: subject.slice(0, separator), unitId: subject.slice(separator + 1) });
  } else if (id.startsWith('RISK:') || id.startsWith('PROP:')) {
    const [, operationId, field] = id.split(':');
    anchorSet.artifact.push({ id: operationId, field });
  }
  return anchorSet;
}

/** The evidence context one worklist item carries. */
// [::TICKET::] PX-291, PX-292, PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-291|PX-292|PX-293) --for-spec --no-implementation-order`.
function contextForObligation(obligation) {
  return {
    obligationId: obligation.id,
    subject: obligation.subject,
    claim: obligation.claim,
    anchorSet: anchorSetFor(obligation),
  };
}

/** The specification lines a basis quote is checked against. */
// [::TICKET::] PX-291, PX-292, PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-291|PX-292|PX-293) --for-spec --no-implementation-order`.
function readSpecLines(root, artifact) {
  const relative = artifact?.spec?.path;
  if (typeof relative !== 'string' || relative.length === 0) return {};
  const path = resolve(root, relative);
  if (!existsSync(path)) return {};
  return { [relative]: readFileSync(path, 'utf8').split('\n') };
}

// [::TICKET::] PX-286 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-286 --for-spec --no-implementation-order`.
export function runCommand(argv, io = {}) {
  const stdout = io.stdout ?? ((line) => process.stdout.write(`${line}\n`));
  const stderr = io.stderr ?? ((line) => process.stderr.write(`${line}\n`));
  const parsed = parseArguments(argv);

  if (parsed.misuse) {
    stderr(`smooth-sequences: usage: run.mjs [workspace-root] [${AUDIT_FLAG}] [${ADVISORY_READINGS_FLAG}] [${LEGACY_FLAG}] [${SCOPE_PREFIX}<obligation-prefix>]`);
    return { exitCode: EXIT_MISUSE, report: null };
  }

  try {
    const root = assertWorkspaceRoot(parsed.root);
    const gate = regenerationGate(root, stderr, { allowTransaction: io.allowTransaction });
    if (gate.refused) return { exitCode: EXIT_MISUSE, report: null };
    const loaded = loadWorkspace(root);
    const status = readStatus(root);
    const baseline = readFindingBaseline(root);
    const previousSchemaVersions = mergeSchemaHistory(status?.schemaHistory, baseline?.provenance);
    const provenance = summarizeProvenance(loaded.artifact, { previousSchemaVersions });
    const downgrade = detectDowngrade({ status, baseline, artifact: loaded.artifact });

    const index = indexArtifact(loaded);
    const evaluation = evaluateCheckRegistry(index);
    const blocked = evaluation.blocked.map((entry) => ({
      ...entry,
      producer: producerForBlockedSurface(entry.surface),
      repairClass: 'regeneration',
    }));
    const waivers = readWaivers(root);
    const ledger = compareFindingSets(baseline, evaluation.findings, { blocked, waivers });
    const findings = annotatePersisted([...evaluation.findings, ...ledger.withdrawn], baseline);

    const evidenceManifest = readEvidenceManifest(root);
    const closureMode = !parsed.legacy && (evidenceManifest !== null || loaded.artifact?.schema_version === SCHEMA_V3);
    const rawReadings = readReadingsForRegistry(root);
    let certificate = null;
    let worklist = [];
    let readings;
    if (closureMode) {
      const { census, declaration } = censusFor(root, loaded.artifact);
      let registry = deriveObligations({
        census,
        declaration,
        artifact: loaded.artifact,
        treeManifest: loaded.treeManifest,
        allocateManifest: loaded.allocateManifest,
        packages: loaded.packages,
        readings: rawReadings,
        mechanical: evaluation,
      });
      registry = resolveMechanicalObligations(registry, evaluation);
      registry = resolveCensusObligations(registry, {
        census,
        artifact: loaded.artifact,
        treeManifest: loaded.treeManifest,
        allocateManifest: loaded.allocateManifest,
        packages: loaded.packages,
      });
      const artifactDigest = evidenceManifest?.artifact?.sha256 ?? null;
      registry = resolveReadingsObligations(registry, { readings: rawReadings, artifactDigest });
      readings = {
        ...summarizeReadings(root, { registry }),
        policy: parsed.advisoryReadings ? 'advisory' : 'blocking',
      };
      const educeStatus = readJsonIfPresent(join(root, 'educe-sequences', 'status.json'));
      const reader = readerForGeneration({ generation: educeStatus?.generation });
      const attackReader = attackReaderForGeneration({ generation: educeStatus?.generation });
      const openSemantic = registry.filter((entry) => entry.class === 'semantic'
        && entry.state === 'open'
        && (parsed.scope === null || parsed.scope === '' || entry.id.startsWith(parsed.scope)));
      const contexts = Object.fromEntries(openSemantic.map((entry) => [entry.id, contextForObligation(entry)]));
      worklist = buildWorklist(openSemantic, contexts, {
        artifactDigest,
        reader,
        attackReader,
        requireRecordId: true,
      });
      const decisionSet = decideAll({
        obligations: registry,
        worklist,
        judgments: rawReadings.judgment,
        attacks: rawReadings.attack,
        artifactDigest,
        linesByPath: readSpecLines(root, loaded.artifact),
      });
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
      });
    } else {
      readings = {
        ...summarizeReadings(root),
        policy: parsed.advisoryReadings ? 'advisory' : 'blocking',
      };
    }
    const unresolvedReadings = readings.policy === 'advisory'
      ? 0
      : (closureMode
        ? (certificate.status === 'complete' ? 0 : 1)
        : (readings.inquest?.yes ?? 0) + (readings.withheld?.length ?? 0) + (readings.uncovered?.unresolved ?? 0));
    const decision = classifyVerdict({
      findings,
      blocked,
      unresolvedReadings,
      downgrade,
      certificate,
    });

    let exitCode = decision.exitCode;
    if (gate.active?.state === STATES.JUDGMENT_REQUIRED) exitCode = EXIT_JUDGMENT;
    const wouldExit = exitCode;
    if (parsed.audit && (exitCode === EXIT_FINDINGS || exitCode === EXIT_UNPROVEN)) exitCode = EXIT_PASS;
    const verdict = parsed.audit ? 'audit' : decision.verdict;

    const executed = evaluation.subChecks.filter((entry) => entry.status === 'executed').length;
    const checks = {
      families: CHECK_FAMILY_COUNT,
      run: executed,
      blocked: blocked.length,
      failed: findings.length,
      subChecks: evaluation.subChecks,
    };
    const withheld = [
      ...blocked.map((entry) => ({ layer: entry.family, check: entry.checkId, reason: entry.reason })),
      ...readings.withheld,
    ];
    const denominator = summarizeDenominator(loaded);
    const report = buildReport({
      workspace: loaded,
      findings,
      withheld,
      blocked,
      waived: ledger.waived,
      downgrade,
      checks,
      provenance,
      readings,
      denominator,
      verdict,
      wouldExit: parsed.audit ? wouldExit : null,
    });
    if (certificate !== null) report.certificate = certificate;
    const generation = writeGeneration({
      root,
      report,
      inputDigest: computeInputDigest(root),
      exitCode,
      findingKeysDigest: computeFindingKeysDigest(findings),
      schemaHistory: provenance.schemaHistory,
    });
    if (closureMode) {
      writeCertificate(root, certificate);
      if (worklist.length > 0) {
        writeFileSync(
          join(root, 'smooth-sequences', 'JUDGMENT-WORKLIST.json'),
          `${JSON.stringify(worklist, null, 2)}\n`,
        );
      }
    }
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
