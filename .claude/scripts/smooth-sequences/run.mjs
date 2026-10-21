#!/usr/bin/env node
// [::TICKET::] PX-275 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-275 --for-spec --no-implementation-order`.
/**
 * smooth-sequences — the final mechanical acceptance gate of the design pipeline.
 *
 * Usage:
 *   node .claude/scripts/smooth-sequences/run.mjs [--audit]
 *   node .claude/scripts/smooth-sequences/run.mjs <workspace-root> [--audit]
 *
 * The current directory, or the single argument when one is given, is the workspace root
 * itself. The root must hold both manifests directly; the command never walks up to a
 * parent. The command reads the workspace and writes only under <root>/smooth-sequences/:
 * the report pair and the generation status. Exit 0 means every non-withheld check holds,
 * 1 means at least one blocking finding, 2 means the workspace could not be read, and 3
 * means a judgment-required transaction is the next action. --audit reports every
 * finding but exits 0 and records the would-be exit in the report.
 */
import { createHash } from 'node:crypto';

import { contributionWithheld } from './lib/checks-layer-a.mjs';
import { layerBWithheld } from './lib/checks-layer-b.mjs';
import { CHECK_FAMILY_COUNT, evaluateCheckRegistry } from './lib/check-registry.mjs';
import { SmoothSequencesError } from './lib/errors.mjs';
import { summarizeProvenance } from './lib/provenance.mjs';
import { summarizeReadings } from './lib/readings-summary.mjs';
import { verifyChain } from '../regeneration/lib/chain.mjs';
import { recoverCommit } from '../regeneration/lib/commit.mjs';
import { RegenerationError } from '../regeneration/lib/errors.mjs';
import { STATES, activeTransaction } from '../regeneration/lib/ledger.mjs';
import { groundHandoff } from '../regeneration/lib/transaction.mjs';
import { indexArtifact } from './lib/index.mjs';
import { annotatePersisted, buildReport, EXIT_FINDINGS, EXIT_JUDGMENT, EXIT_MISUSE, EXIT_PASS, readPreviousReport, renderConsoleReport } from './lib/report.mjs';
import { MODE_VERIFICATION, writeGeneration } from './lib/generation.mjs';
import { assertWorkspaceRoot, loadWorkspace, startDirectoryFor } from './lib/workspace.mjs';
import { snapshotDesignFiles } from '../regeneration/lib/staging.mjs';

const AUDIT_FLAG = '--audit';

/** The argument parser: one optional root and the audit flag. */
// [::TICKET::] PX-283, PX-284 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-283|PX-284) --for-spec --no-implementation-order`.
function parseArguments(argv) {
  const audit = argv.includes(AUDIT_FLAG);
  const paths = argv.filter((argument) => argument !== AUDIT_FLAG);
  if (paths.length > 1) return { misuse: true, audit, root: null };
  return { misuse: false, audit, root: startDirectoryFor(paths[0]) };
}

/** The members a borrowed census lists for one role, or null when it lists none. */
// [::TICKET::] PX-283, PX-284 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-283|PX-284) --for-spec --no-implementation-order`.
function censusMemberCount(artifact, role) {
  const pins = artifact?.pins?.sourceEnumerations;
  if (!Array.isArray(pins)) return null;
  const pin = pins.find((entry) => entry?.role === role);
  return Array.isArray(pin?.members) ? pin.members.length : null;
}

/** The denominator each demand axis is measured against, as far as the workspace states it. */
// [::TICKET::] PX-283, PX-284 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-283|PX-284) --for-spec --no-implementation-order`.
function summarizeDenominator(loaded) {
  return {
    operations: censusMemberCount(loaded.artifact, 'operations'),
    sequences: censusMemberCount(loaded.artifact, 'entries'),
    boundaries: Array.isArray(loaded.allocateManifest?.contract_registry) ? loaded.allocateManifest.contract_registry.length : null,
    surfaces: loaded.vocabulary.requiredInterfaces === null ? null : loaded.vocabulary.requiredInterfaces.length,
  };
}

/**
 * A digest of every design input the detector reads.
 *
 * The report digest alone cannot tell a failed repair from no repair: the finding set
 * may survive while the workspace moved. Hashing the input set makes that difference
 * visible, and snapshotDesignFiles is the pipeline's existing definition of the set.
 */
// [::TICKET::] PX-281 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-281 --for-spec --no-implementation-order`.
function inputDigestOf(root) {
  const snapshot = snapshotDesignFiles(root);
  const lines = Object.keys(snapshot).sort().map((path) => `${path}\u0000${snapshot[path]}`);
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

/** The console line that says which generation this pass stands in. */
// [::TICKET::] PX-281 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-281 --for-spec --no-implementation-order`.
function generationLine(result) {
  const mode = result.mode === MODE_VERIFICATION ? 'verification; no new generation' : 'new generation';
  return `generation: ${result.generation} (${mode})`;
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

export function runCommand(argv, io = {}) {
  const stdout = io.stdout ?? ((line) => process.stdout.write(`${line}\n`));
  const stderr = io.stderr ?? ((line) => process.stderr.write(`${line}\n`));
  const parsed = parseArguments(argv);

  if (parsed.misuse) {
    stderr(`smooth-sequences: usage: run.mjs [workspace-root] [${AUDIT_FLAG}]`);
    return { exitCode: EXIT_MISUSE, report: null };
  }

  try {
    const root = assertWorkspaceRoot(parsed.root);
    const gate = regenerationGate(root, stderr, { allowTransaction: io.allowTransaction });
    if (gate.refused) return { exitCode: EXIT_MISUSE, report: null };
    const loaded = loadWorkspace(root);
    const index = indexArtifact(loaded);
    const evaluation = evaluateCheckRegistry(index);
    const findings = annotatePersisted(evaluation.findings, readPreviousReport(root));
    const readings = summarizeReadings(root);
    const withheld = [
      ...layerBWithheld(index),
      ...index.vocabulary.withheld,
      ...contributionWithheld(index),
      ...readings.withheld,
    ];
    const executed = evaluation.subChecks.filter((entry) => entry.status === 'executed').length;
    const skipped = evaluation.subChecks.filter((entry) => entry.status === 'skipped').length;
    const checks = {
      families: CHECK_FAMILY_COUNT,
      run: executed,
      skipped,
      failed: findings.length,
      subChecks: evaluation.subChecks,
    };
    const provenance = summarizeProvenance(loaded.artifact);
    const denominator = summarizeDenominator(loaded);
    // The exit code is decided before the status is written, so a judgment handoff is
    // recorded as exit 3 rather than as the pass the findings alone would suggest.
    let exitCode = findings.length === 0 ? EXIT_PASS : EXIT_FINDINGS;
    if (gate.active?.state === STATES.JUDGMENT_REQUIRED) exitCode = EXIT_JUDGMENT;
    const wouldExit = exitCode;
    if (parsed.audit && exitCode === EXIT_FINDINGS) exitCode = EXIT_PASS;
    const verdict = parsed.audit ? 'audit' : (exitCode === EXIT_PASS ? 'pass' : 'findings');
    const report = buildReport({ workspace: loaded, findings, withheld, checks, provenance, readings, denominator, verdict, wouldExit: parsed.audit ? wouldExit : null });
    const generation = writeGeneration({ root, report, inputDigest: inputDigestOf(root), exitCode });
    const consoleLines = renderConsoleReport(report, generation);
    consoleLines.splice(1, 0, generationLine(generation));
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
