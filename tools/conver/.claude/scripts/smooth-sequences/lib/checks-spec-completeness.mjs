/**
 * S8 — the workspace formula completeness family.
 *
 * The per-package gate proves a package transcribed what it owns. This family proves the
 * workspace as a whole: the denominator comes from the specification, every formula has
 * an owner, every owner carries a row, and no ledger invents a formula. A finding here
 * is repairable only by the command that owns the surface; it cannot be waived.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  computeRfcDigest,
  extractFormulas,
  parseSeedIdentity,
  readFormulaLedger,
  uniqueFormulas,
} from '../../spec-formula/index.mjs';
import { sha256Hex } from '../../workspacify-tree/lib/hash.mjs';

/** The finding family every S8 record carries. */
export const S8_FAMILY = 'spec-completeness';

/** The workspace worklist this family writes. */
export const SPEC_COMPLETENESS_WORKLIST_PATH = 'smooth-sequences/SPEC-COMPLETENESS-WORKLIST.json';

/** The waiver file, which cannot remove a formula from the denominator. */
export const WAIVERS_FILE_NAME = 'SMOOTH-SEQUENCES-WAIVERS.json';

/** The producer that repairs one package's transcription. */
// [::TICKET::] PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-360|PX-361) --for-spec --no-implementation-order`.
function grillCommand(packagePath) {
  return `/grill-me-for-rfc ${packagePath}`;
}

/** The command that re-measures one package after the repair. */
// [::TICKET::] PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-360|PX-361) --for-spec --no-implementation-order`.
function perPackageRerun(packagePath) {
  return `node "$(git rev-parse --show-toplevel)/.claude/scripts/grill-me-for-rfc/check-formula-coverage.js" ${packagePath}`;
}

/** The command that opens a regeneration transaction for the specification. */
const REGENERATION_COMMAND = 'node "$(git rev-parse --show-toplevel)/.claude/scripts/regeneration/run.mjs" open --spec=<candidate> --reason=<reason>';

/** The command that opens an allocate regeneration. */
const ALLOCATE_COMMAND = 'node "$(git rev-parse --show-toplevel)/.claude/scripts/regeneration/run.mjs" open --allocate-decisions=<candidate> --reason=<reason>';

/** The command that opens a tree-decision regeneration. */
const TREE_DECISIONS_COMMAND = 'node "$(git rev-parse --show-toplevel)/.claude/scripts/regeneration/run.mjs" open --tree-decisions=<candidate> --reason=<reason>';

/** The detector that re-measures the workspace after an in-place repair. */
const DETECTOR_COMMAND = 'node "$(git rev-parse --show-toplevel)/.claude/scripts/smooth-sequences/run.mjs"';

/** One S8 finding, always carrying package, formula and spec line when they exist. */
// [::TICKET::] PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-360|PX-361) --for-spec --no-implementation-order`.
function finding(checkId, details) {
  const {
    packageId = null,
    packagePath = null,
    formulaId = null,
    specLine = null,
    missingField = null,
    reason,
    producer,
    rerun,
    repairClass,
  } = details;

  return {
    checkId,
    family: S8_FAMILY,
    surface: 'package-rfc',
    subject: `${packageId ?? 'workspace'}:${formulaId ?? checkId}:${missingField ?? checkId}`,
    packageId,
    packagePath,
    formulaId,
    specLine,
    missingField,
    reason,
    producer,
    rerun,
    repairClass,
  };
}

/** The formula a package owns from its seed's segment claims. */
// [::TICKET::] PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-360|PX-361) --for-spec --no-implementation-order`.
function ownedFormulas(seed, treeManifest, specFormulas) {
  const segmentIds = seed.sourceSegments ?? [];
  const segments = treeManifest?.structure?.segments ?? [];
  const byId = new Map(segments.map((segment) => [segment.id, segment]));
  const ranges = segmentIds.map((id) => byId.get(id)).filter((segment) => segment !== undefined);
  return specFormulas.filter((formula) => ranges.some((range) => (
    formula.lineStart <= range.line_end && formula.lineEnd >= range.line_start
  )));
}

/** Whether a ledger row carries the theory and verification the gate requires. */
// [::TICKET::] PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-360|PX-361) --for-spec --no-implementation-order`.
function theoryDefects(row) {
  const defects = [];
  if (row.theory.symbols.length === 0 || row.theory.normative.length === 0) defects.push('theory');
  if (row.tests.length === 0) defects.push('tests');
  return defects;
}

/** Whether a ledger row carries a concrete realization. */
// [::TICKET::] PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-360|PX-361) --for-spec --no-implementation-order`.
function implementationDefects(row) {
  const defects = [];
  if (row.implementation.design.length === 0) defects.push('implementation.design');
  if (row.implementation.symbols.length === 0) defects.push('implementation.symbols');
  if (!['computational', 'structural', 'constraint', 'notation'].includes(row.implementation.class)) {
    defects.push('implementation.class');
  }
  return defects;
}

/** Read and parse a package's RFC, or null with the path that was tried. */
// [::TICKET::] PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-360|PX-361) --for-spec --no-implementation-order`.
function readPackageRfc(packagePath) {
  const rfcPath = join(packagePath, 'RFC.md');
  return existsSync(rfcPath) ? readFileSync(rfcPath, 'utf8') : null;
}

/** The waivers a reader wrote, or none. */
// [::TICKET::] PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-360|PX-361) --for-spec --no-implementation-order`.
function readWaivers(root) {
  const path = join(root, WAIVERS_FILE_NAME);
  if (!existsSync(path)) return [];
  const body = JSON.parse(readFileSync(path, 'utf8'));
  return Array.isArray(body?.waivers) ? body.waivers : [];
}

/** Reject a waiver that tries to remove a formula omission. */
// [::TICKET::] PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-360|PX-361) --for-spec --no-implementation-order`.
function waiverFindings(root, findings) {
  const keys = new Set(findings.map((entry) => `${entry.checkId}\u0000${entry.subject}`));
  return readWaivers(root)
    .filter((waiver) => (
      typeof waiver.findingKey === 'string'
      && (waiver.findingKey.startsWith('S8.') || waiver.findingKey.includes('fx-') || keys.has(waiver.findingKey))
    ))
    .map((waiver) => finding('S8.waiver-refused', {
      packageId: null,
      formulaId: /fx-[0-9a-f]{12}/.exec(waiver.findingKey)?.[0] ?? null,
      missingField: 'waiver',
      reason: `a formula omission cannot be waived: ${waiver.findingKey}`,
      producer: `remove ${waiver.findingKey} from ${WAIVERS_FILE_NAME}`,
      rerun: DETECTOR_COMMAND,
      repairClass: 'judgment-required',
    }));
}

/** The one root sequences artifact, or null when it is absent or ambiguous. */
// [::TICKET::] PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-360|PX-361) --for-spec --no-implementation-order`.
function rootArtifact(root) {
  const candidates = readdirSync(root).filter((name) => name.endsWith('-sequences.json')).sort();
  if (candidates.length !== 1) return null;
  try {
    return JSON.parse(readFileSync(join(root, candidates[0]), 'utf8'));
  } catch {
    return null;
  }
}

/** The workspace tree manifest, or null. */
// [::TICKET::] PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-360|PX-361) --for-spec --no-implementation-order`.
function readTreeManifest(root) {
  const path = join(root, 'WORKSPACIFY-TREE-MANIFEST.json');
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

/**
 * Compare every package ledger with the specification formula set.
 *
 * @param {{root: string, artifact?: object, treeManifest?: object}} input
 * @returns {{ok: boolean, specDigest: string|null, summary: object, findings: Array<object>, worklist: Array<object>}}
 */
// [::TICKET::] PX-389 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-389 --for-spec --no-implementation-order`.
export function runSpecCompleteness({ root, artifact = null, treeManifest = null }) {
  const resolvedArtifact = artifact ?? rootArtifact(root);
  const resolvedTree = treeManifest ?? readTreeManifest(root);
  const findings = [];
  const worklist = [];
  const emptySummary = {
    status: 'fail',
    specFormulas: 0,
    transcribed: 0,
    missing: 0,
    invented: 0,
    unowned: 0,
    packages: 0,
  };

  const specRelative = resolvedArtifact?.spec?.path;
  if (typeof specRelative !== 'string' || specRelative.length === 0) {
    return {
      ok: false,
      specDigest: null,
      summary: emptySummary,
      findings: [finding('S8.spec-unreadable', {
        reason: 'the artifact records no spec.path',
        producer: REGENERATION_COMMAND,
        rerun: DETECTOR_COMMAND,
        repairClass: 'regeneration',
      })],
      worklist: [],
    };
  }

  const specPath = resolve(root, specRelative);
  if (!existsSync(specPath)) {
    return {
      ok: false,
      specDigest: null,
      summary: emptySummary,
      findings: [finding('S8.spec-unreadable', {
        reason: `the specification cannot be read: ${specRelative}`,
        producer: REGENERATION_COMMAND,
        rerun: DETECTOR_COMMAND,
        repairClass: 'regeneration',
      })],
      worklist: [],
    };
  }

  const specBytes = readFileSync(specPath);
  const specDigest = sha256Hex(specBytes);
  if (typeof resolvedArtifact.spec.sha256 === 'string' && resolvedArtifact.spec.sha256 !== specDigest) {
    return {
      ok: false,
      specDigest,
      summary: emptySummary,
      findings: [finding('S8.spec-hash-mismatch', {
        reason: `the artifact records ${resolvedArtifact.spec.sha256} and the specification is ${specDigest}`,
        producer: REGENERATION_COMMAND,
        rerun: DETECTOR_COMMAND,
        repairClass: 'regeneration',
      })],
      worklist: [],
    };
  }

  const specFormulas = uniqueFormulas(extractFormulas(specBytes.toString('utf8')));
  const specIds = new Set(specFormulas.map((formula) => formula.id));
  const formulaById = new Map(specFormulas.map((formula) => [formula.id, formula]));
  const packages = resolvedTree?.workspace?.packages ?? [];
  const ownersByFormula = new Map();
  const ledgerPackagesByFormula = new Map();
  const union = new Set();

  for (const pkg of packages) {
    const packageId = pkg.id;
    const packagePath = join(root, pkg.path);
    const seedPath = join(packagePath, 'RFC-SEED.md');
    if (!existsSync(seedPath)) {
      findings.push(finding('S8.segment-coverage', {
        packageId,
        reason: `the package carries no seed: ${pkg.path}/RFC-SEED.md`,
        producer: ALLOCATE_COMMAND,
        rerun: DETECTOR_COMMAND,
        repairClass: 'regeneration',
      }));
      continue;
    }

    let seed;
    try {
      seed = parseSeedIdentity(readFileSync(seedPath, 'utf8'));
    } catch (error) {
      findings.push(finding('S8.segment-coverage', {
        packageId,
        reason: error.message,
        producer: ALLOCATE_COMMAND,
        rerun: DETECTOR_COMMAND,
        repairClass: 'regeneration',
      }));
      continue;
    }

    const owned = ownedFormulas(seed, resolvedTree, specFormulas);
    for (const formula of owned) {
      if (!ownersByFormula.has(formula.id)) ownersByFormula.set(formula.id, new Set());
      ownersByFormula.get(formula.id).add(packageId);
    }

    const rfcText = readPackageRfc(packagePath);
    const ledger = rfcText === null ? null : readFormulaLedger(rfcText);
    if (ledger === null) {
      for (const formula of owned) {
        findings.push(finding('S8.formula-missing', {
          packageId,
          packagePath: pkg.path,
          formulaId: formula.id,
          specLine: formula.lineStart,
          missingField: 'ledger',
          reason: `${packageId} owns ${formula.id} and carries no formula ledger`,
          producer: grillCommand(pkg.path),
          rerun: perPackageRerun(pkg.path),
          repairClass: 'judgment-required',
        }));
      }
      continue;
    }

    if (ledger.specDigest !== specDigest) {
      findings.push(finding('S8.ledger-stale', {
        packageId,
        packagePath: pkg.path,
        reason: `the ledger records specDigest ${ledger.specDigest} and the specification is ${specDigest}`,
        producer: grillCommand(pkg.path),
        rerun: perPackageRerun(pkg.path),
        repairClass: 'in-place',
      }));
    }
    if (ledger.rfcDigest !== computeRfcDigest(rfcText)) {
      findings.push(finding('S8.ledger-stale', {
        packageId,
        packagePath: pkg.path,
        reason: 'the ledger rfcDigest does not reproduce the RFC body',
        producer: grillCommand(pkg.path),
        rerun: perPackageRerun(pkg.path),
        repairClass: 'in-place',
      }));
    }

    const rows = new Map(ledger.rows.map((row) => [row.id, row]));
    for (const formula of owned) {
      const row = rows.get(formula.id);
      if (row === undefined) {
        findings.push(finding('S8.formula-missing', {
          packageId,
          packagePath: pkg.path,
          formulaId: formula.id,
          specLine: formula.lineStart,
          missingField: 'ledgerRow',
          reason: `${packageId} owns ${formula.id} and carries no ledger row`,
          producer: grillCommand(pkg.path),
          rerun: perPackageRerun(pkg.path),
          repairClass: 'judgment-required',
        }));
        continue;
      }
      if (row.digest !== formula.digest) {
        findings.push(finding('S8.formula-digest-mismatch', {
          packageId,
          packagePath: pkg.path,
          formulaId: formula.id,
          specLine: formula.lineStart,
          reason: `${packageId} transcribes different content for ${formula.id}`,
          producer: grillCommand(pkg.path),
          rerun: perPackageRerun(pkg.path),
          repairClass: 'judgment-required',
        }));
      }
      for (const missingField of theoryDefects(row)) {
        findings.push(finding('S8.theory-incomplete', {
          packageId,
          packagePath: pkg.path,
          formulaId: formula.id,
          specLine: formula.lineStart,
          missingField,
          reason: `${formula.id} records no ${missingField}`,
          producer: grillCommand(pkg.path),
          rerun: perPackageRerun(pkg.path),
          repairClass: 'judgment-required',
        }));
      }
      for (const missingField of implementationDefects(row)) {
        findings.push(finding('S8.implementation-design-missing', {
          packageId,
          packagePath: pkg.path,
          formulaId: formula.id,
          specLine: formula.lineStart,
          missingField,
          reason: `${formula.id} records no concrete ${missingField}`,
          producer: grillCommand(pkg.path),
          rerun: perPackageRerun(pkg.path),
          repairClass: 'judgment-required',
        }));
      }
    }

    for (const row of ledger.rows) {
      union.add(row.id);
      if (!ledgerPackagesByFormula.has(row.id)) ledgerPackagesByFormula.set(row.id, new Set());
      ledgerPackagesByFormula.get(row.id).add(packageId);
    }
  }

  for (const [formulaId, owners] of ownersByFormula) {
    if (owners.size > 1) {
      for (const packageId of owners) {
        const carried = ledgerPackagesByFormula.get(formulaId)?.has(packageId) ?? false;
        if (!carried) {
          const formula = formulaById.get(formulaId);
          findings.push(finding('S8.cross-package-row-missing', {
            packageId,
            packagePath: packages.find((pkg) => pkg.id === packageId)?.path ?? packageId,
            formulaId,
            specLine: formula?.lineStart ?? null,
            missingField: 'crossPackageRow',
            reason: `${packageId} co-owns ${formulaId} and carries no row`,
            producer: grillCommand(packages.find((pkg) => pkg.id === packageId)?.path ?? packageId),
            rerun: perPackageRerun(packages.find((pkg) => pkg.id === packageId)?.path ?? packageId),
            repairClass: 'judgment-required',
          }));
        }
      }
    }
  }

  for (const formula of specFormulas) {
    if (!ownersByFormula.has(formula.id)) {
      findings.push(finding('S8.formula-unowned', {
        formulaId: formula.id,
        specLine: formula.lineStart,
        missingField: 'owner',
        reason: `${formula.id} is in the specification and no package claims its line`,
        producer: TREE_DECISIONS_COMMAND,
        rerun: DETECTOR_COMMAND,
        repairClass: 'regeneration',
      }));
    }
  }

  for (const formulaId of union) {
    if (!specIds.has(formulaId)) {
      findings.push(finding('S8.formula-invented', {
        formulaId,
        reason: `${formulaId} is in a ledger and absent from the specification`,
        producer: DETECTOR_COMMAND,
        rerun: DETECTOR_COMMAND,
        repairClass: 'judgment-required',
      }));
    }
  }

  const refused = waiverFindings(root, findings);
  findings.push(...refused);

  const missingFindings = findings.filter((entry) => entry.checkId === 'S8.formula-missing').length;
  const inventedFindings = findings.filter((entry) => entry.checkId === 'S8.formula-invented').length;
  const summary = {
    status: findings.length === 0 ? 'pass' : 'fail',
    specFormulas: specFormulas.length,
    transcribed: specFormulas.filter((formula) => union.has(formula.id)).length,
    missing: missingFindings,
    invented: inventedFindings,
    unowned: new Set(findings.filter((entry) => entry.checkId === 'S8.formula-unowned').map((entry) => entry.formulaId)).size,
    packages: packages.length,
  };

  for (const entry of findings) {
    worklist.push({
      package: entry.packageId,
      formulaId: entry.formulaId,
      specLocation: entry.specLine === null ? null : `${specRelative}:L${entry.specLine}`,
      missingField: entry.missingField,
      producer: entry.producer,
      rerun: entry.rerun,
      repairClass: entry.repairClass,
      checkId: entry.checkId,
    });
  }

  return { ok: findings.length === 0, specDigest, summary, findings, worklist };
}

/**
 * Write the workspace worklist.
 *
 * @param {string} root
 * @param {{specDigest: string|null, summary: object, worklist: Array<object>}} result
 * @returns {string}
 */
export function writeSpecCompletenessWorklist(root, result) {
  const target = join(root, SPEC_COMPLETENESS_WORKLIST_PATH);
  const directory = join(root, 'smooth-sequences');
  mkdirSync(directory, { recursive: true });
  const staged = `${target}.partial.${process.pid}`;
  writeFileSync(staged, `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    specDigest: result.specDigest,
    summary: result.summary,
    worklist: result.worklist,
  }, null, 2)}\n`);
  renameSync(staged, target);
  return target;
}
