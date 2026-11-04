#!/usr/bin/env node
/**
 * check-formula-coverage.js <rfc-dir> [--workspace=<root>]
 *
 * The per-package transcription gate. It derives the formulas this package owns from
 * the tree manifest's line ranges, then proves each one reached the RFC ledger with its
 * theory, its realization class, its implementation site and its tests. A formula in
 * the ledger that the specification never carried is refused as invented, because an
 * invention and a transcription look identical in the RFC alone.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  computeRfcDigest,
  extractFormulas,
  parseSeedIdentity,
  readFormulaLedger,
  resolveWorkspaceRoot,
  uniqueFormulas,
  validateFormulaLedger,
  validateFormulaSidecar,
} from '../spec-formula/index.mjs';
import { FORMULA_SIDECAR_FILENAME } from '../spec-formula/ledger.mjs';
import { sha256Hex } from '../workspacify-tree/lib/hash.mjs';

const USAGE = 'usage: check-formula-coverage.js <rfc-dir> [--workspace=<root>]';

/** @param {string[]} argv */
// [::TICKET::] PX-359, PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-359|PX-360|PX-361) --for-spec --no-implementation-order`.
function parseArgs(argv) {
  const options = { rfcDir: '', workspace: null };
  for (const argument of argv) {
    if (argument.startsWith('--workspace=')) options.workspace = argument.slice('--workspace='.length);
    else if (!argument.startsWith('--') && options.rfcDir.length === 0) options.rfcDir = argument;
  }
  return options;
}

/** The line ranges this package's seed claims, resolved through the tree manifest. */
// [::TICKET::] PX-359, PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-359|PX-360|PX-361) --for-spec --no-implementation-order`.
function ownedLineRanges(seed, treeManifest) {
  const segmentIds = seed.sourceSegments ?? [];
  const segments = treeManifest?.structure?.segments ?? [];
  const byId = new Map(segments.map((segment) => [segment.id, segment]));

  return segmentIds
    .map((id) => byId.get(id))
    .filter((segment) => segment !== undefined)
    .map((segment) => ({ lineStart: segment.line_start, lineEnd: segment.line_end }));
}

/** Whether a formula line overlaps a range this package owns. */
// [::TICKET::] PX-359, PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-359|PX-360|PX-361) --for-spec --no-implementation-order`.
function isOwned(formula, ranges) {
  return ranges.some((range) => formula.lineStart <= range.lineEnd && formula.lineEnd >= range.lineStart);
}

/** One gate finding. */
// [::TICKET::] PX-359, PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-359|PX-360|PX-361) --for-spec --no-implementation-order`.
function finding(code, message, extra = {}) {
  return { code, message, ...extra };
}

/** @param {string[]} argv @returns {number} */
export function run(argv) {
  const options = parseArgs(argv);
  if (options.rfcDir.length === 0) {
    process.stderr.write(`${USAGE}\n`);
    return 1;
  }

  const rfcDir = resolve(options.rfcDir);
  const workspaceRoot = options.workspace === null ? resolveWorkspaceRoot(rfcDir) : resolve(options.workspace);
  if (workspaceRoot === null) {
    process.stderr.write(`refused: no workspace manifests above ${rfcDir}\n`);
    return 1;
  }

  const seed = parseSeedIdentity(readFileSync(resolve(rfcDir, 'RFC-SEED.md'), 'utf8'));
  const specPath = resolve(workspaceRoot, seed.sourceSpec.path);
  const specBytes = readFileSync(specPath);
  const specText = specBytes.toString('utf8');
  const specDigest = sha256Hex(specBytes);
  const treeManifest = JSON.parse(readFileSync(resolve(workspaceRoot, 'WORKSPACIFY-TREE-MANIFEST.json'), 'utf8'));

  const rfcPath = resolve(rfcDir, 'RFC.md');
  const rfcText = existsSync(rfcPath) ? readFileSync(rfcPath, 'utf8') : '';
  const sidecarPath = resolve(rfcDir, FORMULA_SIDECAR_FILENAME);
  const sidecar = existsSync(sidecarPath)
    ? JSON.parse(readFileSync(sidecarPath, 'utf8'))
    : null;

  const ledger = readFormulaLedger(rfcText);
  const findings = [...validateFormulaLedger(ledger), ...validateFormulaSidecar(sidecar, ledger)];

  const ranges = ownedLineRanges(seed, treeManifest);
  const allFormulas = uniqueFormulas(extractFormulas(specText));
  const ownedFormulas = allFormulas.filter((formula) => isOwned(formula, ranges));
  const allFormulaIds = new Set(allFormulas.map((formula) => formula.id));
  const ledgerRows = new Map((ledger?.rows ?? []).map((row) => [row.id, row]));

  if (ledger !== null && ledger.specDigest !== specDigest) {
    findings.push(finding('SPEC_DIGEST_MISMATCH', `the ledger records ${ledger.specDigest} and the specification is ${specDigest}`, { field: 'specDigest' }));
  }
  if (ledger !== null && ledger.rfcDigest !== computeRfcDigest(rfcText)) {
    findings.push(finding('RFC_DIGEST_MISMATCH', 'the ledger rfcDigest does not reproduce the RFC body', { field: 'rfcDigest' }));
  }

  for (const formula of ownedFormulas) {
    const row = ledgerRows.get(formula.id);
    if (row === undefined) {
      findings.push(finding('MISSING_LEDGER_ROW', `${formula.id} is owned and absent from the formula ledger`, {
        formulaId: formula.id,
        specPath: seed.sourceSpec.path,
        specLine: formula.lineStart,
      }));
      continue;
    }
    if (row.digest !== formula.digest) {
      findings.push(finding('DIGEST_MISMATCH', `${formula.id} carries different content in the ledger`, {
        formulaId: formula.id,
        specPath: seed.sourceSpec.path,
        specLine: formula.lineStart,
      }));
    }
  }

  for (const id of ledgerRows.keys()) {
    if (!allFormulaIds.has(id)) {
      findings.push(finding('INVENTED_FORMULA', `${id} is in the ledger and absent from the specification`, { formulaId: id }));
    }
  }
  for (const row of sidecar?.formulas ?? []) {
    if (!allFormulaIds.has(row.id)) {
      findings.push(finding('INVENTED_FORMULA', `${row.id} is in the sidecar and absent from the specification`, { formulaId: row.id }));
    }
  }

  const output = {
    ok: findings.length === 0,
    ownedFormulas: ownedFormulas.length,
    ledgerRows: ledger?.rows.length ?? 0,
    transcribed: ownedFormulas.filter((formula) => ledgerRows.has(formula.id)).length,
    findings,
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);

  if (findings.length > 0) {
    for (const entry of findings) {
      process.stderr.write(`${entry.code}${entry.formulaId ? ` ${entry.formulaId}` : ''}: ${entry.message}\n`);
    }
    return 1;
  }
  return 0;
}

process.exit(run(process.argv.slice(2)));
