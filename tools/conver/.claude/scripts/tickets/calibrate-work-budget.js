#!/usr/bin/env node
'use strict';

// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-443 --for-spec --no-implementation-order`.
/**
 * calibrate-work-budget.js — measure a ticket-work-budget from reviewed tickets.
 *
 * The ceiling is the nearest-rank P75 of the tickets that actually reached
 * review and carry test work. Todo tickets and zero-work records (for example,
 * the transient omission tickets that were closed without implementation) never
 * enter the sample. Components without a positive sample keep the base ceiling
 * and are reported as preserved.
 *
 * Usage:
 *   node calibrate-work-budget.js --cwd=. [--tickets=Tickets.json]
 *     [--budget=ticket-work-budget.json] [--out=ticket-work-budget.json]
 *     [--graph=...] [--dirs-tree=...] [--view=...]
 *     [--percentile=75] [--now=<ISO>] [--write]
 */

const fs = require('node:fs');
const path = require('node:path');

const {
  CALIBRATED_WORKLOAD_COMPONENTS,
  parseWorkBudget,
  workloadOfTicket,
} = require('./lib/ticket-workload.js');
const { isCompletedStatus } = require('./lib/ticket-status.js');

const DEFAULT_BUDGET_FILE = path.join(__dirname, 'ticket-work-budget.json');
const DEFAULT_PERCENTILE = 75;
const DEFAULT_CONTRACT_COUNT = 6;

/** Read `--name=value` from the argument list. */
function argumentValue(args, name) {
  const prefix = '--' + name + '=';
  const match = args.find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

/** Read JSON or a fallback. */
function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/** The nearest-rank percentile: the smallest value covering p% of the sorted sample. */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-443 --for-spec --no-implementation-order`.
function nearestRank(values, percentile = DEFAULT_PERCENTILE) {
  const sorted = (values ?? []).filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  const bounded = Math.min(100, Math.max(1, percentile));
  const index = Math.max(0, Math.ceil((bounded / 100) * sorted.length) - 1);
  return sorted[index];
}

/** Flatten a Tickets.json document into its ticket records. */
function flattenTickets(document) {
  return (document?.phases ?? []).flatMap((phase) => phase.tickets ?? []);
}

/** A completed ticket that carries test work is a calibration sample. */
function isSample(ticket, context) {
  if (!isCompletedStatus(ticket?.status)) return false;
  const workload = workloadOfTicket(ticket, context);
  return (workload.testUnit ?? 0) + (workload.testIntegration ?? 0) > 0;
}

/**
 * Calibrate a v4 budget from a Tickets.json document.
 *
 * @returns {{document:object, sampleSize:number, calibrated:string[], preserved:string[]}}
 */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-443 --for-spec --no-implementation-order`.
function calibrateBudget({
  ticketsDocument,
  baseBudget,
  context = {},
  components = CALIBRATED_WORKLOAD_COMPONENTS,
  percentile = DEFAULT_PERCENTILE,
  now = new Date().toISOString(),
  source = 'Tickets.json',
}) {
  const base = baseBudget?.budget ?? {};
  const baseDocument = baseBudget?.document ?? {};
  const samples = flattenTickets(ticketsDocument)
    .filter((ticket) => isSample(ticket, context))
    .map((ticket) => workloadOfTicket(ticket, context));

  const budget = {};
  const calibrated = [];
  const preserved = [];
  for (const component of components) {
    const values = samples.map((workload) => workload?.[component] ?? 0);
    const p75 = nearestRank(values, percentile);
    if (p75 !== null && p75 > 0) {
      budget[component] = Math.max(1, Math.ceil(p75));
      calibrated.push(component);
    } else {
      budget[component] = base[component] ?? (component === 'contractCount' ? DEFAULT_CONTRACT_COUNT : 1);
      preserved.push(component);
    }
  }

  const provenance = 'Measured P75 (nearest-rank) over ' + samples.length
    + ' completed measured ticket(s) at ' + now
    + '; sample=' + samples.length
    + '; source: ' + source
    + '; percentile=' + percentile
    + '; calibrated: ' + (calibrated.join(', ') || 'none')
    + '; preserved: ' + (preserved.join(', ') || 'none')
    + '. Run again after the next review round.';

  return {
    sampleSize: samples.length,
    calibrated,
    preserved,
    document: {
      version: 4,
      components: [...components],
      budget,
      excluded: Array.isArray(baseDocument.excluded) ? baseDocument.excluded : [],
      partitionPolicy: 'contiguous-minimum',
      splitReasons: Array.isArray(baseDocument.splitReasons)
        ? baseDocument.splitReasons
        : ['budget', 'ownership-boundary'],
      provenance,
    },
  };
}

/** CLI entry point. */
function main() {
  const args = process.argv.slice(2);
  const cwd = path.resolve(argumentValue(args, 'cwd') ?? process.cwd());
  const ticketsPath = path.resolve(cwd, argumentValue(args, 'tickets') ?? 'Tickets.json');
  const budgetPath = path.resolve(cwd, argumentValue(args, 'budget') ?? DEFAULT_BUDGET_FILE);
  const outPath = path.resolve(cwd, argumentValue(args, 'out') ?? budgetPath);
  const percentile = Number.parseInt(argumentValue(args, 'percentile') ?? String(DEFAULT_PERCENTILE), 10);
  const now = argumentValue(args, 'now') ?? new Date().toISOString();
  const write = args.includes('--write');

  const ticketsDocument = readJson(ticketsPath, null);
  if (ticketsDocument === null) {
    console.error('[ERROR] Tickets.json not found: ' + ticketsPath);
    process.exit(1);
  }
  const parsed = parseWorkBudget(readJson(budgetPath, null));
  if (!parsed.valid) {
    console.error('[ERROR] WORK_BUDGET_INVALID: ' + parsed.errors.join('; '));
    process.exit(1);
  }
  const context = {};
  for (const [flag, field] of [['graph', 'graph'], ['dirs-tree', 'dirsTree'], ['view', 'view']]) {
    const filePath = argumentValue(args, flag);
    if (filePath !== undefined) context[field] = readJson(path.resolve(cwd, filePath), null);
  }

  const result = calibrateBudget({
    ticketsDocument,
    baseBudget: { budget: parsed.budget, components: parsed.components, document: readJson(budgetPath, {}) },
    context,
    components: CALIBRATED_WORKLOAD_COMPONENTS,
    percentile: Number.isFinite(percentile) ? percentile : DEFAULT_PERCENTILE,
    now,
    source: path.relative(cwd, ticketsPath) || ticketsPath,
  });

  if (write) {
    fs.writeFileSync(outPath, JSON.stringify(result.document, null, 2) + '\n', 'utf8');
  }
  process.stdout.write(JSON.stringify(result.document, null, 2) + '\n');
}

if (require.main === module) {
  main();
}

module.exports = {
  calibrateBudget,
  flattenTickets,
  isSample,
  nearestRank,
};
