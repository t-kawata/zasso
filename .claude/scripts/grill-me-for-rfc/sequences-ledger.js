#!/usr/bin/env node
/**
 * sequences-ledger.js <project-dir> [--units=<path>] [--stage=<conformance|upstream|implementation|ship|evolution>]
 *
 * The obligation registry, and the stage report every layer can ask for.
 *
 * The design rule this file exists to hold: an obligation is registered by a material
 * arriving, and the gates loop over whatever the registry returns. An absent material
 * therefore yields an empty loop, and the gate is a no-op — which is why no gate contains
 * a branch on a material's file name. A gate that read "if sequences are present, then
 * require something" would make the material a precondition of operation, and the whole
 * reinforcement would stop being additive.
 *
 * The report reads the units from the package's own view and decides each one's discharge
 * from the artifact its stage produces. Only `upstream` has such an artifact today — a row in
 * this package's RFC.md — so a later stage reports not proved for every unit rather than
 * proved for a check nobody ran. The view's file name is the default path of that reading and
 * not a condition on whether to read: the condition is the obligation set.
 *
 * Verdicts use the machine vocabulary the README fixes at line 130: proved and not proved
 * only. The words success and failure are not verdicts here.
 *
 * Design context: tools/conver/README.md — 上流ループ, and the five consistencies.
 */

import fs from 'node:fs';
import path from 'node:path';

import { LEDGER_TITLE_SUFFIX, readDistributionLedger } from '../sequences-slice/lib/distribution-ledger.mjs';
import { VIEW_JSON_NAME, VIEW_MARKDOWN_NAME, collectUnitIds, findSequenceMaterial } from '../sequences-slice/lib/material.mjs';
import { obligationSourceOf } from '../sequences-slice/lib/view.mjs';

const EXIT_OK = 0;
const EXIT_FAILED = 1;

/** The file the package's own Distribution ledger lives in. */
const RFC_FILENAME = 'RFC.md';

/** The two flags the report reads, spelled as the sibling gate spells the units flag. */
const STAGE_FLAG_PREFIX = '--stage=';
const UNITS_FLAG_PREFIX = '--units=';

/** The stage named when none is, and the one stage whose discharge artifact this module reads. */
const DEFAULT_STAGE = 'upstream';
const DISCHARGE_ARTIFACT_STAGE = 'upstream';

/**
 * The machine vocabulary. Three words, and nothing else is a verdict.
 *
 * `undeclared` is a named state rather than a failure: it says this package's manifest declares no
 * interface, so it owes no surface and the workspace has not adopted the surface mapping. Reading
 * that as `not proved` would make an unadopted workspace look like a failing one, and reading the
 * silence as satisfied is the defect the obligation relations exist to remove.
 */
export const MACHINE_VERDICTS = Object.freeze(['proved', 'not proved', 'undeclared']);

/** The one obligation this registry knows: the distribution material obliges a ledger. */
export const DISTRIBUTION_OBLIGATION = Object.freeze({
  kind: 'distribution',
  subject: 'sequences-and-operations',
  ledgerTitle: LEDGER_TITLE_SUFFIX,
});

const STAGES = Object.freeze(['conformance', 'upstream', 'implementation', 'ship', 'evolution']);

const USAGE = `usage: sequences-ledger.js <project-dir> [${UNITS_FLAG_PREFIX}<path>] ${STAGE_FLAG_PREFIX}<${STAGES.join('|')}>`;

/**
 * The descriptor a material kind registers.
 *
 * @param {string} materialKind
 * @returns {{ kind: string, subject: string, ledgerTitle: string }}
 */
// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
export function registerObligation(materialKind) {
  if (materialKind !== DISTRIBUTION_OBLIGATION.kind) {
    throw new Error(`${materialKind} is not an obligation this registry knows`);
  }
  return { ...DISTRIBUTION_OBLIGATION };
}

/** The material paths a session record holds, by the rule init.js and list-files.js apply. */
// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
function materialPathsOf(record) {
  if (Array.isArray(record?.materialPaths)) return record.materialPaths;
  return record?.researchPath ? [record.researchPath] : [];
}

/**
 * The obligations a session's material record carries.
 *
 * Empty when no distribution material is recorded, which is what makes the gates that loop
 * over this a no-op for every package that has not been handed the material.
 *
 * @param {{ materialPaths?: string[], researchPath?: string }} statusRecord
 * @returns {Array<{ kind: string, subject: string, ledgerTitle: string }>}
 */
// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
export function obligationsFor(statusRecord) {
  const carriesDistributionMaterial = materialPathsOf(statusRecord).some((materialPath) => {
    const name = path.basename(materialPath);
    return name === VIEW_MARKDOWN_NAME || name === VIEW_JSON_NAME;
  });
  return carriesDistributionMaterial ? [registerObligation(DISTRIBUTION_OBLIGATION.kind)] : [];
}

/**
 * What one unit's discharge looks like at one layer, in the machine vocabulary.
 *
 * @param {{ unitId: string, discharged: boolean }} unit
 * @param {string} layer
 * @returns {string} one line, beginning with proved or not proved
 */
// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
export function reportUnit(unit, layer) {
  return `${unit.discharged ? MACHINE_VERDICTS[0] : MACHINE_VERDICTS[1]}: ${unit.unitId} at ${layer}`;
}

/** The stage report, one line per unit, in the machine vocabulary. */
// [::TICKET::] PX-257, PX-259 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-257|PX-259) --for-spec --no-implementation-order`.
function renderStageReport({ stage, units, obligationSource = null }) {
  const lines = [`# Distribution ledger at ${stage}`, ''];
  if (units.length === 0) {
    lines.push(obligationSource === MACHINE_VERDICTS[2]
      ? `${MACHINE_VERDICTS[2]}: this package's manifest declares no interface, so it owes no surface, and the workspace has not adopted the surface mapping`
      : `${MACHINE_VERDICTS[1]}: no unit is distributed to this package, so there is nothing to discharge`);
    return `${lines.join('\n')}\n`;
  }
  for (const unit of units) lines.push(reportUnit(unit, stage));
  return `${lines.join('\n')}\n`;
}

/** The real file system, in the shape `findSequenceMaterial` takes its io in. */
const FILE_SYSTEM = {
  readFile(filePath) {
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch {
      return null;
    }
  },
  fileExists(filePath) {
    return fs.existsSync(filePath);
  },
  basename: path.basename,
  join: path.join,
};

/**
 * The unit ids the package's view distributes, or none when there is no readable view.
 *
 * Design context: docs/FIX-PLAN005.md.
 */
// [::TICKET::] PX-259 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-259 --for-spec --no-implementation-order`.
function readObligationSource(unitsPath) {
  try {
    return obligationSourceOf(JSON.parse(fs.readFileSync(unitsPath, 'utf8')));
  } catch {
    return null;
  }
}

// [::TICKET::] PX-259 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-259 --for-spec --no-implementation-order`.
function readDistributedUnitIds(unitsPath) {
  try {
    return collectUnitIds(JSON.parse(fs.readFileSync(unitsPath, 'utf8')));
  } catch {
    return [];
  }
}

/**
 * The units this package's ledger discharges at the stage asked about.
 *
 * A ledger that is absent, unreadable, or not well formed discharges nothing: a row carried
 * by a record the gate refuses proves no unit, and reporting it as proved would state a check
 * that no one can repeat.
 *
 * Design context: docs/FIX-PLAN005.md.
 */
function dischargedUnitIds({ stage, rfcDir, unitIds }) {
  if (stage !== DISCHARGE_ARTIFACT_STAGE) return new Set();

  let rfcText;
  try {
    rfcText = fs.readFileSync(path.join(rfcDir, RFC_FILENAME), 'utf8');
  } catch {
    return new Set();
  }

  const verdict = readDistributionLedger(rfcText, new Set(unitIds));
  if (verdict === null || !verdict.ok) return new Set();
  return new Set(verdict.rows.map((row) => row.unit));
}

// [::TICKET::] PX-257, PX-259 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-257|PX-259) --for-spec --no-implementation-order`.
function main(argv = process.argv.slice(2)) {
  const stageArgument = argv.find((argument) => argument.startsWith(STAGE_FLAG_PREFIX));
  const stage = stageArgument === undefined ? DEFAULT_STAGE : stageArgument.slice(STAGE_FLAG_PREFIX.length);

  const [rfcDirArgument] = argv.filter((argument) => !argument.startsWith('--'));
  if (rfcDirArgument === undefined || !STAGES.includes(stage)) {
    process.stderr.write(`${USAGE}\n`);
    return EXIT_FAILED;
  }

  const rfcDir = path.resolve(rfcDirArgument);
  const unitsArgument = argv.find((argument) => argument.startsWith(UNITS_FLAG_PREFIX));
  const unitsPath = unitsArgument === undefined
    ? path.join(rfcDir, VIEW_JSON_NAME)
    : path.resolve(unitsArgument.slice(UNITS_FLAG_PREFIX.length));

  // The view states whether this package declares a surface, which is what tells an undeclared
  // workspace from a failing one; it is read once and passed to both branches of the report.
  const obligationSource = readObligationSource(unitsPath);

  // The obligation set decides whether there is anything to report, so a package that was
  // never handed the material reads exactly as it did before this report read units.
  const obligations = obligationsFor(findSequenceMaterial({ rfcDir, io: FILE_SYSTEM }));
  if (obligations.length === 0) {
    process.stdout.write(renderStageReport({ stage, units: [], obligationSource }));
    return EXIT_OK;
  }

  const unitIds = readDistributedUnitIds(unitsPath);
  const discharged = dischargedUnitIds({ stage, rfcDir, unitIds });
  const units = unitIds.map((unitId) => ({ unitId, discharged: discharged.has(unitId) }));
  process.stdout.write(renderStageReport({ stage, units, obligationSource }));
  return EXIT_OK;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  process.exit(main());
}

export { main, renderStageReport };
