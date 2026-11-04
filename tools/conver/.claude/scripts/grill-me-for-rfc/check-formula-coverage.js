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
import { homedir } from 'node:os';
import { resolve } from 'node:path';

import {
  computeRfcDigest,
  digestFormula,
  extractFormulas,
  normalizeFormula,
  parseSeedIdentity,
  readFormulaLedger,
  resolveWorkspaceRoot,
  uniqueFormulas,
  validateFormulaLedger,
  validateFormulaSidecar,
} from '../spec-formula/index.mjs';
import { FORMULA_SIDECAR_FILENAME } from '../spec-formula/ledger.mjs';
import { sha256Hex } from '../workspacify-tree/lib/hash.mjs';
import repairFinding from '../lib/repair-finding.js';

const { createFinding, renderFindings } = repairFinding;
import { toHomeRelative } from '../lib/path-utils.js';

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
// [::TICKET::] PX-359, PX-360, PX-361, PX-365 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-359|PX-360|PX-361|PX-365) --for-spec --no-implementation-order`.
function ownedLineRanges(seed, treeManifest) {
  const segmentIds = seed.sourceSegments ?? [];
  const segments = treeManifest?.structure?.segments ?? [];
  const byId = new Map(segments.map((segment) => [segment.id, segment]));

  const ranges = [];
  const unresolved = [];
  for (const id of segmentIds) {
    const segment = byId.get(id);
    if (segment === undefined) unresolved.push(id);
    else ranges.push({ lineStart: segment.line_start, lineEnd: segment.line_end });
  }
  return { ranges, unresolved };
}

/** Resolve a sidecar or seed path against the workspace root, including ~/ paths. */
// [::TICKET::] PX-365 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-365 --for-spec --no-implementation-order`.
function resolveSpecPath(workspaceRoot, value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  return resolve(value.startsWith('~/') ? homedir() : workspaceRoot, value.startsWith('~/') ? value.slice(2) : value);
}

/** Enrich a coverage finding with the exact repair and verification commands. */
// [::TICKET::] PX-365 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-365 --for-spec --no-implementation-order`.
function withRepair(finding, rfcDir, formulasById = new Map()) {
  const target = finding.formulaId ?? 'the owned formulas';
  const record = createFinding({
    severity: 'blocking',
    code: finding.code,
    layer: 'grill',
    artifact: resolve(rfcDir, 'RFC.md'),
    formulaId: finding.formulaId ?? null,
    field: finding.field ?? null,
    cause: finding.message,
    action: `edit ${rfcDir}/RFC.md and ${rfcDir}/RFC-FORMULAS.json for ${target} from the specification extractor, then run node "$(git rev-parse --show-toplevel)/.claude/scripts/grill-me-for-rfc/check-formula-coverage.js" ${rfcDir}`,
    verify: `node "$(git rev-parse --show-toplevel)/.claude/scripts/grill-me-for-rfc/check-formula-coverage.js" ${rfcDir}`,
    route: 'in-drill',
  });
  return {
    ...record,
    specPath: finding.specPath ?? null,
    specLine: finding.specLine ?? formulasById.get(finding.formulaId)?.lineStart ?? null,
  };
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
    process.stderr.write(`refused: no workspace manifests above ${toHomeRelative(rfcDir)}\n`);
    return 1;
  }

  let seed;
  let specBytes;
  let treeManifest;
  try {
    seed = parseSeedIdentity(readFileSync(resolve(rfcDir, 'RFC-SEED.md'), 'utf8'));
    specBytes = readFileSync(resolve(workspaceRoot, seed.sourceSpec.path));
    treeManifest = JSON.parse(readFileSync(resolve(workspaceRoot, 'WORKSPACIFY-TREE-MANIFEST.json'), 'utf8'));
  } catch (error) {
    const entry = withRepair({
      ...finding('SPECIFICATION_UNREADABLE', error.message),
      field: 'specification',
    }, rfcDir);
    process.stdout.write(`${JSON.stringify({ ok: false, ownedFormulas: 0, ledgerRows: 0, transcribed: 0, findings: [entry] }, null, 2)}\n`);
    process.stderr.write(`${entry.code}: ${entry.message}\n`);
    return 1;
  }

  const specText = specBytes.toString('utf8');
  const specDigest = sha256Hex(specBytes);

  const rfcPath = resolve(rfcDir, 'RFC.md');
  const rfcText = existsSync(rfcPath) ? readFileSync(rfcPath, 'utf8') : '';
  const sidecarPath = resolve(rfcDir, FORMULA_SIDECAR_FILENAME);
  const sidecar = existsSync(sidecarPath)
    ? JSON.parse(readFileSync(sidecarPath, 'utf8'))
    : null;

  const ledger = readFormulaLedger(rfcText);
  const findings = [...validateFormulaLedger(ledger), ...validateFormulaSidecar(sidecar, ledger)];

  const { ranges, unresolved } = ownedLineRanges(seed, treeManifest);
  for (const segmentId of unresolved) {
    findings.push(finding('SEGMENT_UNRESOLVED', `the seed claims source segment ${segmentId} and the tree manifest does not define it`, { segmentId, field: 'source_segments' }));
  }

  const allFormulas = uniqueFormulas(extractFormulas(specText));
  const ownedFormulas = allFormulas.filter((formula) => isOwned(formula, ranges));
  const allFormulaIds = new Set(allFormulas.map((formula) => formula.id));
  const formulasById = new Map(allFormulas.map((formula) => [formula.id, formula]));
  const ledgerRows = new Map((ledger?.rows ?? []).map((row) => [row.id, row]));

  if (ownedFormulas.length === 0 && unresolved.length === 0 && ledger === null && sidecar === null) {
    const output = { ok: true, ownedFormulas: 0, ledgerRows: 0, transcribed: 0, findings: [] };
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    return 0;
  }

  if (ledger !== null && ledger.specDigest !== specDigest) {
    findings.push(finding('SPEC_DIGEST_MISMATCH', `the ledger records ${ledger.specDigest} and the specification is ${specDigest}`, { field: 'specDigest' }));
  }
  if (ledger !== null && ledger.rfcDigest !== computeRfcDigest(rfcText)) {
    findings.push(finding('RFC_DIGEST_MISMATCH', 'the ledger rfcDigest does not reproduce the RFC body', { field: 'rfcDigest' }));
  }

  if (sidecar !== null) {
    const seedSpecPath = resolveSpecPath(workspaceRoot, seed.sourceSpec.path);
    const sidecarSpecPath = resolveSpecPath(workspaceRoot, sidecar.specPath);
    if (sidecarSpecPath === null || sidecarSpecPath !== seedSpecPath) {
      findings.push(finding('SPEC_PATH_MISMATCH', `the sidecar specPath ${sidecar.specPath ?? '(missing)'} does not resolve to the seed specification ${seed.sourceSpec.path}`, { field: 'specPath' }));
    }
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
    const location = row.specLocation;
    if (location === null || location.lineStart !== formula.lineStart || location.lineEnd !== formula.lineEnd) {
      findings.push(finding('SPEC_LOCATION_MISMATCH', `${formula.id} records a different specification line range in the ledger`, {
        formulaId: formula.id,
        field: 'specLocation',
        specLine: formula.lineStart,
      }));
    }
  }

  for (const sidecarFormula of sidecar?.formulas ?? []) {
    const extracted = formulasById.get(sidecarFormula.id);
    if (extracted === undefined) continue;
    const location = sidecarFormula.specLocation;
    if (location === undefined || location.lineStart !== extracted.lineStart || location.lineEnd !== extracted.lineEnd) {
      findings.push(finding('SPEC_LOCATION_MISMATCH', `${sidecarFormula.id} records a different specification line range in the sidecar`, {
        formulaId: sidecarFormula.id,
        field: 'specLocation',
        specLine: extracted.lineStart,
      }));
    }
    // The sidecar is compared with the specification through its body, not through its
    // digest field: a field can keep the ledger's old value while the body names another
    // formula, and every downstream stage compares bodies.
    const recomputed = typeof sidecarFormula.body === 'string' && sidecarFormula.body.trim().length > 0
      ? digestFormula(normalizeFormula(sidecarFormula.body))
      : null;
    if (recomputed !== extracted.digest) {
      findings.push(finding('SIDECAR_BODY_MISMATCH', `${sidecarFormula.id} body does not reproduce the specification formula`, {
        formulaId: sidecarFormula.id,
        field: 'body',
        specPath: seed.sourceSpec.path,
        specLine: extracted.lineStart,
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

  const repaired = findings.map((entry) => withRepair(entry, rfcDir, formulasById));
  const output = {
    ok: repaired.length === 0,
    ownedFormulas: ownedFormulas.length,
    ledgerRows: ledger?.rows.length ?? 0,
    transcribed: ownedFormulas.filter((formula) => ledgerRows.has(formula.id)).length,
    findings: repaired,
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);

  if (repaired.length > 0) {
    for (const entry of repaired) {
      process.stderr.write(`${entry.code}${entry.formulaId ? ` ${entry.formulaId}` : ''}: ${entry.cause}\n`);
    }
    process.stderr.write(`${renderFindings(repaired, { cap: repaired.length })}\n`);
    return 1;
  }
  return 0;
}

process.exit(run(process.argv.slice(2)));
