#!/usr/bin/env node
/**
 * sequences-ledger.js <project-dir> [--stage=<conformance|upstream|implementation|ship|evolution>]
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
 * Verdicts use the machine vocabulary the README fixes at line 130: proved and not proved
 * only. The words success and failure are not verdicts here.
 *
 * Design context: tools/conver/README.md — 上流ループ, and the five consistencies.
 */

import path from 'node:path';

import { LEDGER_TITLE_SUFFIX } from '../sequences-slice/lib/distribution-ledger.mjs';
import { VIEW_JSON_NAME, VIEW_MARKDOWN_NAME } from '../sequences-slice/lib/material.mjs';

const EXIT_OK = 0;
const EXIT_FAILED = 1;

/** The machine vocabulary. Two words, and nothing else is a verdict. */
export const MACHINE_VERDICTS = Object.freeze(['proved', 'not proved']);

/** The one obligation this registry knows: the distribution material obliges a ledger. */
export const DISTRIBUTION_OBLIGATION = Object.freeze({
  kind: 'distribution',
  subject: 'sequences-and-operations',
  ledgerTitle: LEDGER_TITLE_SUFFIX,
});

const STAGES = Object.freeze(['conformance', 'upstream', 'implementation', 'ship', 'evolution']);

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
// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
function renderStageReport({ stage, units }) {
  const lines = [`# Distribution ledger at ${stage}`, ''];
  if (units.length === 0) {
    lines.push(`${MACHINE_VERDICTS[1]}: no unit is distributed to this package, so there is nothing to discharge`);
    return `${lines.join('\n')}\n`;
  }
  for (const unit of units) lines.push(reportUnit(unit, stage));
  return `${lines.join('\n')}\n`;
}

// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
function main(argv = process.argv.slice(2)) {
  const stageArgument = argv.find((argument) => argument.startsWith('--stage='));
  const stage = stageArgument === undefined ? 'upstream' : stageArgument.slice('--stage='.length);

  if (!STAGES.includes(stage)) {
    process.stderr.write(`usage: sequences-ledger.js <project-dir> --stage=<${STAGES.join('|')}>\n`);
    return EXIT_FAILED;
  }
  // The units come from the package's own view; with none distributed there is nothing to
  // report and the verdict says so rather than reporting an empty run as a pass.
  process.stdout.write(renderStageReport({ stage, units: [] }));
  return EXIT_OK;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  process.exit(main());
}

export { main, renderStageReport };
