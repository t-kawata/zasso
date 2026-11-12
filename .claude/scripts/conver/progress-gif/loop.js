import { mtime, readText, ticketsOf, ticketKeyOf, parseTimestamp, parseRunId } from './parse.js';
import { computePackageObligations, countTicketContracts, isReviewedStatus } from './obligations.js';

export const STAGE_ORDER = Object.freeze([
  'educe', 'explain', 'grill', 'smooth', 'graphify', 'boundify', 'split',
  'make', 'plan', 'start', 'review', 'resolve', 'consolidate', 'find',
  'crystalize', 'drill',
]);

export const LOOP_GROUPS = Object.freeze([
  { name: 'workspacify', stages: ['educe'] },
  { name: 'upstream', stages: ['explain', 'grill', 'smooth', 'graphify', 'boundify', 'split'] },
  { name: 'implementation', stages: ['make', 'plan', 'start', 'review', 'resolve', 'consolidate', 'find'] },
  { name: 'shipping', stages: ['crystalize'] },
  { name: 'evolution', stages: ['drill'] },
]);

export const STAGE_GROUP = Object.freeze(Object.fromEntries(
  LOOP_GROUPS.flatMap((group) => group.stages.map((stage) => [stage, group.name])),
));

export const HOLD_START_FRAMES = 4;
export const HOLD_END_FRAMES = 12;
export const STAGE_WEIGHT = Object.freeze([3, 3, 6, 3, 6, 6, 6, 6, 6, 14, 8, 6, 3, 6, 6, 4]);
const STAGE_INDEX = Object.freeze(Object.fromEntries(STAGE_ORDER.map((stage, index) => [stage, index])));
const STAGE_WEIGHT_SUM = STAGE_WEIGHT.reduce((sum, weight) => sum + weight, 0);
// Only command-written evidence is trusted as a clock. An artifact mtime is
// copied by a checkout, so it must yield to these sources.
const TRUSTED_TIME_SOURCES = new Set(['history', 'status']);
// The display date is an estimate, so a clock that runs far past the render is
// not allowed to stretch the axis. Evidence times are still preserved.
const MAX_FUTURE_SKEW_MS = 24 * 60 * 60 * 1000;

const EDuce_PHASES = 18;
// The exact completion instant each implementation stage owns. A stage with no
// explicit field is not drawn; no mtime, origin or detected_at substitute is used.
const STAGE_TIMESTAMP_FIELDS = Object.freeze({
  make: 'made_at',
  plan: 'planned_at',
  start: 'done_at',
  review: 'reviewed_at',
});
const EXPLICIT_COMPLETION_STAGES = new Set(['make', 'plan', 'start', 'review', 'resolve']);
// Phase 1 of the drill has twelve sub-steps (1-1..1-12). Steps 2-1..5-1 are the
// graphify / boundify / split / verify gates that follow it.
const DRILL_PHASE1_STEPS = 12;
const DRILL_PHASE1_STEP = /^1-(\d+)$/;
const DRILL_GATE_STEP = /^[2-5]-1$/;
const GRAPH_STEPS = ['0', '1', '2', '3', '4', '5'];
const BOUNDIFY_STEPS = ['0', '1', '2', '3'];
const SPLIT_STEPS = ['0-1', '0-2', '1', '2', '3', '4-1', '4-2', '5-1', '5-2', '5-3', '6'];
const CRYSTALIZE_STEPS = 4;
const CONSOLIDATE_MANIFEST_PORTION = 0.5;
const PENDING_FIND_PORTION = 0.5;
export const MILLION = 1e6;

// [::TICKET::] PX-352 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-352 --for-spec --no-implementation-order`.
export const ZERO_USAGE = Object.freeze({
  cacheMissInputTokens: 0,
  cacheHitInputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
});

// [::TICKET::] PX-352 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-352 --for-spec --no-implementation-order`.
function padDatePart(value) {
  return String(value).padStart(2, '0');
}

/** Date key that matches the date components formatDate renders for the same precision. */
// [::TICKET::] PX-352 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-352 --for-spec --no-implementation-order`.
export function displayDateKey(timestamp, precision) {
  const date = new Date(timestamp || 0);
  const useUtc = precision === 'day';
  const year = useUtc ? date.getUTCFullYear() : date.getFullYear();
  const month = (useUtc ? date.getUTCMonth() : date.getMonth()) + 1;
  const day = useUtc ? date.getUTCDate() : date.getDate();
  return `${year}-${padDatePart(month)}-${padDatePart(day)}`;
}

/** Return the cumulative usage for the last date bucket at or before dateKey. */
// [::TICKET::] PX-352 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-352 --for-spec --no-implementation-order`.
export function usageAtDate(series, dateKey) {
  let found = null;
  for (const entry of series || []) {
    if (entry.date <= dateKey) found = entry;
    else break;
  }
  return found ? { ...found.cumulative } : { ...ZERO_USAGE };
}

/** Round a token count up to whole millions; display rounding only. */
// [::TICKET::] PX-354 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-354 --for-spec --no-implementation-order`.
function formatMillions(value) {
  return Math.ceil((Number(value) || 0) / MILLION);
}

// [::TICKET::] PX-354 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-354 --for-spec --no-implementation-order`.
function formatDollars(value) {
  return Math.ceil(Number(value) || 0);
}

const UNKNOWN_DENOMINATOR = '?';
// One ideographic space separates the four measurements; a single full-width gap
// keeps them distinct without spending the width of the old three-space run.
const TITLE_SEGMENT_SEPARATOR = '\u3000';
const TITLE_LABEL_TONE = 'label';
const TITLE_VALUE_TONE = 'value';

/**
 * Project the workspace contract progress at one frame instant. A ticket's
 * contracts enter the denominator from the split instant that wrote Tickets.json,
 * not from its make instant, so a workspace that has split but not implemented
 * still reports the contracts it owes. The count is the sum of per-package
 * obligations: a contract id is counted once inside a package, and once more for
 * every other package that owes the same boundary contract, because each side
 * carries its own implementation responsibility. The numerator counts the
 * reviewed subset the same way.
 */
export function contractsAt(model, timestamp) {
  let numerator = 0;
  let denominator = 0;
  let known = false;
  for (const pkg of model.packages || []) {
    const present = new Set();
    const reviewed = new Set();
    for (const entry of pkg.contractLog || []) {
      if (!Number.isFinite(entry.presentAt) || entry.presentAt > timestamp) continue;
      known = true;
      for (const id of entry.contractIds || []) present.add(id);
      if (Number.isFinite(entry.reviewedAt) && entry.reviewedAt <= timestamp) {
        for (const id of entry.contractIds || []) reviewed.add(id);
      }
    }
    denominator += present.size;
    numerator += reviewed.size;
  }
  return { numerator, denominator, unknown: !known };
}

/** Project reviewed tickets over the tickets that already exist at the instant. */
export function ticketsAt(model, timestamp) {
  let numerator = 0;
  let denominator = 0;
  for (const pkg of model.packages || []) {
    for (const entry of pkg.contractLog || []) {
      if (!Number.isFinite(entry.presentAt) || entry.presentAt > timestamp) continue;
      denominator += 1;
      if (Number.isFinite(entry.reviewedAt) && entry.reviewedAt <= timestamp) numerator += 1;
    }
  }
  return { numerator, denominator, unknown: denominator === 0 };
}

/** The contract value shown inside the CONTRACTS brackets; no split means unknown. */
export function contractsValue(contracts) {
  if (!contracts || contracts.unknown) return `0/${UNKNOWN_DENOMINATOR}`;
  return `${contracts.numerator}/${contracts.denominator}`;
}

/** The ticket value shown inside the TICKETS brackets; no split means unknown. */
export function ticketsValue(tickets) {
  if (!tickets || tickets.unknown) return `0/${UNKNOWN_DENOMINATOR}`;
  return `${tickets.numerator}/${tickets.denominator}`;
}

/**
 * Cost per contract: the ICOD dollar integer divided by the contract denominator,
 * rounded up at the first significant decimal place. 1/250 = 0.004, 1/300 = 0.004,
 * and 100/8 = 12.5 rounds up to 20 because the first significant digit is tens.
 * An unknown or zero denominator cannot yield a cost, so it renders as `$?`.
 */
export function costPerContractValue(costUsd, contracts) {
  if (!contracts || contracts.unknown || !(contracts.denominator > 0)) return '$?';
  const dollars = formatDollars(costUsd);
  const quotient = dollars / contracts.denominator;
  if (!(quotient > 0)) return '$0';
  const exponent = Math.floor(Math.log10(quotient));
  const scale = 10 ** exponent;
  // Subtract a relative epsilon so an exact multiple of the scale is not pushed
  // to the next step by floating-point noise.
  const rounded = Math.ceil(quotient / scale - 1e-9) * scale;
  const text = exponent < 0
    ? rounded.toFixed(Math.min(100, -exponent))
    : String(Math.round(rounded));
  return `$${text}`;
}

/** One `LABEL [value]` pair: the label stays plain, the value is toned. */
function titleMetricRuns(label, value) {
  return [
    { text: `${label} `, tone: TITLE_LABEL_TONE },
    { text: `[${value}]`, tone: TITLE_VALUE_TONE },
  ];
}

/**
 * Split the usage title into a left name and a right-aligned metric block.
 *
 * The renderer places `right` against the title bar's right edge, so the block
 * must stay a separate string; `rightParts` carries the label/value tone split
 * the renderer uses to colour the bracketed values; `text` is the plain fallback.
 */
// [::TICKET::] PX-352, PX-354 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-352|PX-354) --for-spec --no-implementation-order`.
export function usageTitleSegments(name, cumulative, contracts = '0/?', tickets = '0/?', cpc = '$?') {
  const left = name || 'PROGRESS';
  const metrics = `${formatMillions(cumulative.cacheMissInputTokens)}M / `
    + `${formatMillions(cumulative.cacheHitInputTokens)}M / `
    + `${formatMillions(cumulative.outputTokens)}M / `
    + `$${formatDollars(cumulative.costUsd)}`;
  const sections = [
    titleMetricRuns('TICKETS', tickets),
    titleMetricRuns('CONTRACTS', contracts),
    titleMetricRuns('CPC', cpc),
    titleMetricRuns('ICOD', metrics),
  ];
  const rightParts = [];
  sections.forEach((runs, index) => {
    if (index > 0) rightParts.push({ text: TITLE_SEGMENT_SEPARATOR, tone: TITLE_LABEL_TONE });
    rightParts.push(...runs);
  });
  const right = rightParts.map((run) => run.text).join('');
  return { left, right, rightParts, text: `${left} | ${right}` };
}

// [::TICKET::] PX-352, PX-354 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-352|PX-354) --for-spec --no-implementation-order`.
export function formatUsageTitle(name, cumulative, contracts = '0/?', tickets = '0/?', cpc = '$?') {
  return usageTitleSegments(name, cumulative, contracts, tickets, cpc).text;
}

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
// [::TICKET::] PX-370 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-370 --for-spec --no-implementation-order`.
export function clamp01(value) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

/**
 * The reviewed share of one package's contract obligations at one instant.
 *
 * The numerator is the union of contract ids whose ticket carries a reviewed_at
 * at or before the instant; the denominator is the package's whole obligation
 * total, so a late discovery of new obligations cannot make the completion cue
 * recede. A legacy model without a contract log falls back to its final reviewed
 * count instead of pretending the package was never reviewed.
 */
// [::TICKET::] PX-411 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-411 --for-spec --no-implementation-order`.
export function packageReviewedRatioAt(pkg, timestamp) {
  const total = Math.max(0, Number(pkg && pkg.obligations && pkg.obligations.total) || 0);
  if (total <= 0) return 0;
  if (!Array.isArray(pkg.contractLog)) {
    return clamp01(Math.max(0, Number(pkg.obligations.reviewed) || 0) / total);
  }
  const reviewed = new Set();
  for (const entry of pkg.contractLog) {
    if (!Number.isFinite(entry.reviewedAt) || entry.reviewedAt > timestamp) continue;
    for (const id of entry.contractIds || []) reviewed.add(id);
  }
  return clamp01(reviewed.size / total);
}

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
function doneSteps(status, keys) {
  if (!status || !status.steps) return 0;
  return keys.filter((key) => status.steps[key] === 'done').length / keys.length;
}

// [::TICKET::] PX-374 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-374 --for-spec --no-implementation-order`.
const DAY_PRECISION = 'day';
const SOURCE_RANK = Object.freeze({ history: 0, status: 1, artifact: 2, initial: 3 });
const STATUS_STAGES = new Set(['educe', 'grill', 'smooth', 'graphify', 'boundify', 'split', 'crystalize', 'drill']);

/** Append a warning once; the same gating check can run from progress and event derivation. */
// [::TICKET::] PX-374 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-374 --for-spec --no-implementation-order`.
function warnOnce(warnings, message) {
  if (!Array.isArray(warnings) || warnings.includes(message)) return;
  warnings.push(message);
}

/** Read text without letting an unreadable artifact abort the draw. */
// [::TICKET::] PX-374 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-374 --for-spec --no-implementation-order`.
function readTextOrEmpty(file) {
  try {
    return readText(file);
  } catch {
    return '';
  }
}

/** Count explain fact sections in file text. A path is not text and yields zero. */
export function countFactSectionsIn(text) {
  if (typeof text !== 'string' || text.length === 0) return 0;
  const match = /<!--\s*explain-seed:facts\s*([\s\S]*?)-->/.exec(text);
  if (!match) return 0;
  try {
    return Object.keys(JSON.parse(match[1]).sections || {}).length;
  } catch {
    return 0;
  }
}

/** Parse an embedded date only when it carries a time; day precision is not an instant. */
// [::TICKET::] PX-374 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-374 --for-spec --no-implementation-order`.
function parseInstant(value) {
  const parsed = parseTimestamp(value);
  return parsed && parsed.prec !== DAY_PRECISION ? parsed : null;
}

/** The stage's explicit completion instant, or null when the field is absent. */
// [::TICKET::] PX-401 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-401 --for-spec --no-implementation-order`.
function readTicketStageInstant(ticket, stage) {
  const field = STAGE_TIMESTAMP_FIELDS[stage];
  return field ? parseInstant(ticket[field]) : null;
}

/** The earliest COMPLETE finish for one stage, or null when history has none. */
// [::TICKET::] PX-374 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-374 --for-spec --no-implementation-order`.
function findEarliestHistoryFinish(records, packageId, stage) {
  const matches = (record) => record
    && record.event === 'finish'
    && record.status === 'COMPLETE'
    && record.stage === stage
    && (packageId === null
      ? record.packageId === null || record.packageId === undefined
      : record.packageId === packageId);
  const times = (records ?? [])
    .filter(matches)
    .map((record) => parseTimestamp(record.at))
    .filter(Boolean)
    .sort((left, right) => left.t - right.t);
  return times[0] ?? null;
}

/** The command-written status time: runId epoch first, then an ISO field with a time. */
// [::TICKET::] PX-374 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-374 --for-spec --no-implementation-order`.
function resolveStatusTime(status) {
  if (!status) return null;
  const runId = runIdTime(status);
  if (runId) return runId;
  for (const candidateTimestamp of [status.completedAt, status.updatedAt, status.measuredAt, status.generationStartedAt, status.generatedAt]) {
    const parsed = parseInstant(candidateTimestamp);
    if (parsed) return parsed;
  }
  return null;
}

/** An artifact write time, or null when the file is missing or older than the model origin. */
// [::TICKET::] PX-374 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-374 --for-spec --no-implementation-order`.
function resolveArtifactTime(file, initialT) {
  if (!file) return null;
  const fileMtime = mtime(file);
  if (fileMtime === null) return null;
  if (Number.isFinite(initialT) && fileMtime < initialT) return null;
  return { t: fileMtime, prec: 'ms' };
}

/**
 * The stage completion time. Command evidence (history then status) is trusted;
 * an artifact mtime is used only when neither supplies a time, so a later touch
 * or a copied mtime cannot move a command completion.
 */
// [::TICKET::] PX-374, PX-381 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-374|PX-381) --for-spec --no-implementation-order`.
function resolveCompletionEvidence({ evidence = {}, artifactPath = null, context = {} } = {}) {
  const { initialT = 0, warnings = null, label = '' } = context;
  const candidates = [];
  if (evidence.history) candidates.push({ ...evidence.history, source: 'history' });
  const statusCandidate = evidence.statusTime || (evidence.status ? resolveStatusTime(evidence.status) : null);
  if (statusCandidate) candidates.push({ ...statusCandidate, source: 'status' });
  if (candidates.length > 0) {
    return candidates.sort((left, right) => left.t - right.t
      || SOURCE_RANK[left.source] - SOURCE_RANK[right.source])[0];
  }
  if (!artifactPath) return null;
  const fileMtime = mtime(artifactPath);
  if (fileMtime === null) return null;
  if (Number.isFinite(initialT) && fileMtime < initialT) {
    // A checkout copies mtimes forward, so an artifact older than the model
    // origin is still real evidence; clamp it to the origin with a warning
    // instead of letting the stage disappear from the animation.
    const message = `[evidence] ${label || artifactPath}: artifact mtime ${new Date(fileMtime).toISOString()} precedes the model origin; clamped to ${new Date(initialT).toISOString()}`;
    if (warnings && !warnings.includes(message)) warnings.push(message);
    return { t: initialT, prec: 'ms', source: 'initial' };
  }
  return { t: fileMtime, prec: 'ms', source: 'artifact' };
}

/** The status file that evidences one stage, or null for artifact-only stages. */
// [::TICKET::] PX-374 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-374 --for-spec --no-implementation-order`.
function resolveStageStatus(artifacts, workspaceArtifacts, stage) {
  switch (stage) {
    case 'educe': return workspaceArtifacts.educeStatus;
    case 'smooth': return workspaceArtifacts.smoothStatus;
    case 'grill': return artifacts.status;
    case 'graphify': return artifacts.graphStatus;
    case 'boundify': return artifacts.boundifyStatus;
    case 'split': return artifacts.splitStatus;
    case 'crystalize': return artifacts.crystalize;
    case 'drill': return artifacts.drillStatus;
    default: return null;
  }
}

/** The output artifact that a stage writes, or null when the stage owns no artifact. */
// [::TICKET::] PX-374 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-374 --for-spec --no-implementation-order`.
function resolveStageArtifact(artifacts, workspaceArtifacts, stage) {
  switch (stage) {
    case 'educe': return workspaceArtifacts.sequencesPath;
    case 'smooth': return workspaceArtifacts.smoothStatusPath;
    case 'grill': return artifacts.designTreePath;
    case 'graphify': return artifacts.graphPath;
    case 'boundify': return artifacts.dirsPath;
    case 'split': return artifacts.ticketsPath;
    case 'crystalize': return artifacts.crystalizePath;
    case 'drill': return artifacts.drillStatusPath;
    case 'explain': return artifacts.explain || artifacts.info;
    default: return null;
  }
}

/** History is workspace-scoped for workspace stages and package-scoped otherwise. */
// [::TICKET::] PX-374 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-374 --for-spec --no-implementation-order`.
function selectHistoryRecords(artifacts, workspaceArtifacts, stage) {
  return stage === 'educe' || stage === 'smooth'
    ? workspaceArtifacts.historyRecords
    : artifacts.historyRecords;
}

/** Did the stage command run, and which evidence exists for it? */
// [::TICKET::] PX-374 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-374 --for-spec --no-implementation-order`.
function resolveExecutionEvidence(artifacts, workspaceArtifacts, stage, packageId) {
  const scopedPackageId = stage === 'educe' || stage === 'smooth' ? null : packageId;
  const history = findEarliestHistoryFinish(selectHistoryRecords(artifacts, workspaceArtifacts, stage), scopedPackageId, stage);
  const status = resolveStageStatus(artifacts, workspaceArtifacts, stage);
  const artifactPath = resolveStageArtifact(artifacts, workspaceArtifacts, stage);
  const statusExecuted = STATUS_STAGES.has(stage)
    ? Boolean(status)
    : Boolean(artifactPath);
  return {
    history,
    status,
    artifactPath,
    executed: Boolean(history) || statusExecuted,
    hasHistory: Boolean(history),
    hasStatus: Boolean(status),
  };
}


// [::TICKET::] PX-349, PX-381 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-349|PX-381) --for-spec --no-implementation-order`.
function resolvedQuestions(designTree, warnings = [], packageId = null) {
  const resolved = [];
  const dayPrecision = new Set();
  const visit = (nodes) => {
    for (const node of nodes || []) {
      if (node.status === 'resolved') {
        let best = null;
        for (const question of node.questions || []) {
          const parsed = parseInstant(question.resolvedAt);
          if (!parsed && typeof question.resolvedAt === 'string' && question.resolvedAt.trim() !== '') {
            const repeated = dayPrecision.has(question.resolvedAt);
            if (!repeated) {
              dayPrecision.add(question.resolvedAt);
              const message = `[evidence] grill ${packageId}: day precision resolvedAt ${question.resolvedAt} ignored`;
              if (!warnings.includes(message)) warnings.push(message);
            }
          }
          if (parsed && (!best || parsed.t > best.t)) best = parsed;
        }
        resolved.push({ node, at: best });
      }
      visit(node.children);
    }
  };
  visit(designTree && designTree.nodes);
  return resolved;
}

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
function ticketList(artifacts) {
  return artifacts.tickets ? ticketsOf(artifacts.tickets) : [];
}

/** The earliest COMPLETE drill finish, or null when history has none. */
// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
export function historyDrillTime(records, packageId) {
  const finishes = (records ?? [])
    .filter((record) => record.event === 'finish'
      && record.stage === 'drill'
      && record.packageId === packageId
      && record.status === 'COMPLETE')
    .map((record) => parseTimestamp(record.at))
    .filter(Boolean)
    .sort((left, right) => left.t - right.t);
  return finishes[0] ?? null;
}

/**
 * How much of the drill the status file evidences. Only Step 5 declares the drill
 * COMPLETE, so a COMPLETE status always credits the whole stage. Before that, the
 * phase-one sub-steps carry the fraction and the later gates keep it complete, so
 * a drill that advanced past phase one is never shown as zero.
 */
function drillProgressFraction(status) {
  if (status.state === 'COMPLETE') return 1;
  const step = String(status.currentStep || '');
  const phaseOneStep = DRILL_PHASE1_STEP.exec(step);
  if (phaseOneStep) return Math.min(1, Number(phaseOneStep[1]) / DRILL_PHASE1_STEPS);
  return DRILL_GATE_STEP.test(step) ? 1 : 0;
}

/** Derive the 16 stage fractions for one package from evidence and artifacts. */
// [::TICKET::] PX-374 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-374 --for-spec --no-implementation-order`.
export function stageProgressOf(artifacts, workspaceArtifacts = {}, packageId = null, warnings = []) {
  const stages = Object.fromEntries(STAGE_ORDER.map((stage) => [stage, 0]));
  const educeEvidence = resolveExecutionEvidence(artifacts, workspaceArtifacts, 'educe', packageId);
  const educe = workspaceArtifacts.educeStatus;
  if (educe && Array.isArray(educe.phases)) {
    stages.educe = educe.phases.filter((phase) => phase.status === 'done').length / EDuce_PHASES;
  } else if (educeEvidence.hasHistory) {
    stages.educe = 1;
  }
  if (artifacts.info) stages.explain += 0.35;
  if (artifacts.explain) {
    const sections = countFactSectionsIn(readTextOrEmpty(artifacts.explain));
    stages.explain += 0.35 + 0.3 * Math.min(1, sections / 7);
  }
  stages.explain = clamp01(stages.explain);

  const grillEvidence = resolveExecutionEvidence(artifacts, workspaceArtifacts, 'grill', packageId);
  if (grillEvidence.hasStatus) {
    const resolved = resolvedQuestions(artifacts.designTree, warnings, packageId);
    const totalNodes = countNodes(artifacts.designTree);
    if (totalNodes > 0) stages.grill += 0.9 * (resolved.length / totalNodes);
    if (artifacts.status.state === 'DONE') stages.grill += 0.1;
  } else if (grillEvidence.hasHistory) {
    stages.grill = 1;
  } else if (artifacts.designTree) {
    warnOnce(warnings, `[evidence] grill ${packageId ?? 'workspace'}: DesignTree.json present without Status.json or a grill history finish; grill not credited`);
  }
  stages.grill = clamp01(stages.grill);

  const smoothEvidence = resolveExecutionEvidence(artifacts, workspaceArtifacts, 'smooth', packageId);
  const smooth = workspaceArtifacts.smoothStatus;
  if (smooth) {
    const verdict = smooth.verdict || {};
    const pass = verdict.exitCode === 0 && verdict.findings === 0 && verdict.blocked === 0
      && (verdict.readings || 0) === 0 && (verdict.withheld || 0) === 0;
    const certificate = workspaceArtifacts.smoothCertificate;
    let fraction = 0;
    if (certificate && certificate.obligations && certificate.obligations.total > 0) {
      fraction = certificate.obligations.closed / certificate.obligations.total;
    } else if (pass) {
      fraction = 1;
    }
    stages.smooth = clamp01(pass ? fraction : Math.min(fraction, 0.9));
  } else if (smoothEvidence.hasHistory) {
    stages.smooth = 1;
  }

  const graphifyEvidence = resolveExecutionEvidence(artifacts, workspaceArtifacts, 'graphify', packageId);
  if (graphifyEvidence.hasStatus) {
    stages.graphify = Math.max(0.25, doneSteps(artifacts.graphStatus, GRAPH_STEPS));
  } else if (graphifyEvidence.hasHistory) {
    stages.graphify = 1;
  } else if (artifacts.graphPath) {
    warnOnce(warnings, `[evidence] graphify ${packageId ?? 'workspace'}: RFC-GRAPH.json present without RFC-GRAPHIFY-Status.json or a graphify history finish; graphify not credited`);
  }

  const boundifyEvidence = resolveExecutionEvidence(artifacts, workspaceArtifacts, 'boundify', packageId);
  if (boundifyEvidence.hasStatus) {
    stages.boundify = Math.max(0.25, doneSteps(artifacts.boundifyStatus, BOUNDIFY_STEPS));
  } else if (boundifyEvidence.hasHistory) {
    stages.boundify = 1;
  } else if (artifacts.dirsPath) {
    warnOnce(warnings, `[evidence] boundify ${packageId ?? 'workspace'}: RFC-Dirs-Tree.json present without RFC-BOUNDIFY-Status.json or a boundify history finish; boundify not credited`);
  }

  const splitEvidence = resolveExecutionEvidence(artifacts, workspaceArtifacts, 'split', packageId);
  if (splitEvidence.hasStatus) {
    stages.split = artifacts.splitStatus.steps && artifacts.splitStatus.steps['6'] === 'done'
      ? 1
      : Math.max(0.25, doneSteps(artifacts.splitStatus, SPLIT_STEPS));
  } else if (splitEvidence.hasHistory) {
    stages.split = 1;
  } else if (artifacts.tickets) {
    warnOnce(warnings, `[evidence] split ${packageId ?? 'workspace'}: ${artifacts.ticketsPath} present without RFC-SPLIT-Status.json or a split history finish; split not credited`);
  }

  if (artifacts.tickets) {
    const tickets = ticketList(artifacts);
    const count = tickets.length || 1;
    for (const ticket of tickets) {
      const status = ticket.status;
      if (['made', 'planned', 'started', 'done', 'reviewed'].includes(status) || isReviewedStatus(status)) {
        stages.make += 1 / count;
      }
      if (['planned', 'started', 'done', 'reviewed'].includes(status) || isReviewedStatus(status)) {
        stages.plan += 1 / count;
      }
      if (['started', 'done', 'reviewed'].includes(status) || isReviewedStatus(status)) {
        stages.start += 1 / count;
      }
      if (status === 'reviewed' || isReviewedStatus(status)) {
        stages.review += 1 / count;
      }
    }
    stages.make = clamp01(stages.make);
    stages.plan = clamp01(stages.plan);
    stages.start = clamp01(stages.start);
    stages.review = clamp01(stages.review);
  }
  const records = (artifacts.malfeasance && artifacts.malfeasance.records) || [];
  const unresolvedStubs = Number(artifacts.unresolvedStubs) || 0;
  const resolveTotal = records.length + unresolvedStubs;
  if (resolveTotal > 0) {
    const resolved = records.filter((record) => record.status === 'resolved' || record.status === 'false_positive').length;
    stages.resolve = resolved / resolveTotal;
  }
  const manifests = artifacts.manifests || [];
  const omissions = artifacts.omissions || [];
  if (manifests.length > 0) stages.consolidate = CONSOLIDATE_MANIFEST_PORTION;
  if (omissions.length > 0) {
    stages.consolidate = 1;
    const tickets = ticketList(artifacts);
    const pending = tickets.some((ticket) => ticket.status === 'remanded' || ticket.forNextRound);
    stages.find = pending ? PENDING_FIND_PORTION : 1;
  }

  const crystalizeEvidence = resolveExecutionEvidence(artifacts, workspaceArtifacts, 'crystalize', packageId);
  const crystalize = artifacts.crystalize;
  if (crystalize) {
    const steps = crystalize.steps ? Object.values(crystalize.steps).filter((value) => value === 'done').length / CRYSTALIZE_STEPS : 0;
    const grill = crystalize.grill || {};
    const nodes = (grill.toc && grill.toc.nodes) || [];
    const sections = grill.sections || [];
    const toc = nodes.length ? nodes.filter((node) => node.status === 'confirmed').length / nodes.length : 0;
    const section = sections.length ? sections.filter((item) => item.state === 'complete' || item.state === 'residue').length / sections.length : 0;
    stages.crystalize = clamp01(0.5 * steps + 0.3 * toc + 0.2 * section);
  } else if (crystalizeEvidence.hasHistory) {
    stages.crystalize = 1;
  }

  const drillEvidence = resolveExecutionEvidence(artifacts, workspaceArtifacts, 'drill', packageId);
  if (artifacts.drillStatus) {
    stages.drill = drillProgressFraction(artifacts.drillStatus);
  } else if (drillEvidence.hasHistory) {
    stages.drill = 1;
  }
  return stages;
}

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
function countNodes(designTree) {
  let count = 0;
  const visit = (nodes) => {
    for (const node of nodes || []) {
      count += 1;
      visit(node.children);
    }
  };
  visit(designTree && designTree.nodes);
  return count;
}

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
function addEvent(events, event) {
  if (!Number.isFinite(event.t) || !(event.inc > 0)) return;
  events.push({ ...event, prec: event.prec || 'ms' });
}

/** Add one stage event at the earliest command/artifact evidence time. */
// [::TICKET::] PX-374, PX-381 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-374|PX-381) --for-spec --no-implementation-order`.
function emitStageEvent(events, input) {
  const { stage, packageId, inc, evidence, evidenceInfo, initialT, warnings = [] } = input;
  if (!evidenceInfo || !evidenceInfo.executed) return false;
  const when = resolveCompletionEvidence({
    evidence: { history: evidenceInfo.history, status: evidenceInfo.status },
    artifactPath: evidenceInfo.artifactPath,
    context: { initialT, warnings, label: `${stage} ${packageId}` },
  });
  if (!when) return false;
  addEvent(events, {
    t: when.t,
    prec: when.prec,
    stage,
    packageId,
    inc,
    evidence,
    timeSource: when.source,
  });
  return true;
}

/** Build stage events for one package. Root events use packageId null and apply to every cell. */
// [::TICKET::] PX-374, PX-411 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-374|PX-411) --for-spec --no-implementation-order`.
export function stageEventsOf(pkg, artifacts, workspaceArtifacts = {}, warnings = []) {
  const events = [];
  const initialT = workspaceArtifacts.initialT || 0;
  const stages = stageProgressOf(artifacts, workspaceArtifacts, pkg.id, warnings);

  const educeEvidence = resolveExecutionEvidence(artifacts, workspaceArtifacts, 'educe', pkg.id);
  const educe = workspaceArtifacts.educeStatus;
  if (educe && Array.isArray(educe.phases)) {
    const done = educe.phases.filter((phase) => phase.status === 'done').length / EDuce_PHASES;
    const when = resolveCompletionEvidence({
      evidence: { history: educeEvidence.history, status: educe },
      artifactPath: workspaceArtifacts.sequencesPath,
      context: { initialT, warnings, label: `educe ${pkg.id}` },
    });
    if (when) {
      addEvent(events, { t: when.t, prec: when.prec, stage: 'educe', packageId: null, inc: 0.02, evidence: 'educe-sequences/status.json', timeSource: when.source });
      addEvent(events, {
        t: when.t,
        prec: when.prec,
        stage: 'educe',
        packageId: null,
        inc: Math.max(0, done - 0.02),
        evidence: workspaceArtifacts.sequencesPath || 'educe-sequences/status.json',
        timeSource: when.source,
      });
    }
  } else if (educeEvidence.hasHistory) {
    addEvent(events, { t: educeEvidence.history.t, prec: 'ms', stage: 'educe', packageId: null, inc: 1, evidence: 'history', timeSource: 'history' });
  }

  const smoothEvidence = resolveExecutionEvidence(artifacts, workspaceArtifacts, 'smooth', pkg.id);
  const smooth = workspaceArtifacts.smoothStatus;
  if (smooth) {
    const when = resolveCompletionEvidence({
      evidence: { history: smoothEvidence.history, status: smooth },
      artifactPath: workspaceArtifacts.smoothStatusPath,
      context: { initialT, warnings, label: `smooth ${pkg.id}` },
    });
    if (when) {
      const certificate = workspaceArtifacts.smoothCertificate;
      const pass = smooth.verdict && smooth.verdict.exitCode === 0 && smooth.verdict.findings === 0
        && smooth.verdict.blocked === 0 && (smooth.verdict.readings || 0) === 0 && (smooth.verdict.withheld || 0) === 0;
      let fraction = 0;
      if (certificate && certificate.obligations && certificate.obligations.total > 0) {
        fraction = certificate.obligations.closed / certificate.obligations.total;
      } else if (pass) {
        fraction = 1;
      }
      addEvent(events, {
        t: when.t,
        prec: when.prec,
        stage: 'smooth',
        packageId: null,
        inc: pass ? fraction : Math.min(fraction, 0.9),
        evidence: 'smooth-sequences/status.json',
        timeSource: when.source,
      });
    }
  } else if (smoothEvidence.hasHistory) {
    addEvent(events, { t: smoothEvidence.history.t, prec: 'ms', stage: 'smooth', packageId: null, inc: 1, evidence: 'history', timeSource: 'history' });
  }

  const explainEvidence = resolveExecutionEvidence(artifacts, workspaceArtifacts, 'explain', pkg.id);
  if (artifacts.info) {
    const when = resolveCompletionEvidence({ evidence: { history: explainEvidence.history }, artifactPath: artifacts.info, context: { initialT, warnings, label: `explain ${pkg.id}` } });
    if (when) addEvent(events, { t: when.t, prec: when.prec, stage: 'explain', packageId: pkg.id, inc: 0.35, evidence: artifacts.info, timeSource: when.source });
  }
  if (artifacts.explain) {
    const when = resolveCompletionEvidence({ evidence: { history: explainEvidence.history }, artifactPath: artifacts.explain, context: { initialT, warnings, label: `explain ${pkg.id}` } });
    if (when) {
      const sections = countFactSectionsIn(readTextOrEmpty(artifacts.explain));
      addEvent(events, {
        t: when.t,
        prec: when.prec,
        stage: 'explain',
        packageId: pkg.id,
        inc: 0.35 + 0.3 * Math.min(1, sections / 7),
        evidence: artifacts.explain,
        timeSource: when.source,
      });
    }
  }

  const grillEvidence = resolveExecutionEvidence(artifacts, workspaceArtifacts, 'grill', pkg.id);
  if (grillEvidence.hasStatus) {
    const designTime = artifacts.designTree ? parseStampFromMtime(artifacts.designTreePath || '') : null;
    const resolved = resolvedQuestions(artifacts.designTree, warnings, pkg.id);
    const totalNodes = countNodes(artifacts.designTree);
    for (const item of resolved) {
      const at = item.at || designTime || { t: initialT, prec: 'ms' };
      addEvent(events, {
        t: at.t,
        prec: at.prec,
        stage: 'grill',
        packageId: pkg.id,
        inc: totalNodes > 0 ? 0.9 / totalNodes : 0,
        evidence: 'DesignTree.json',
        timeSource: item.at ? 'status' : designTime ? 'artifact' : 'initial',
      });
    }
    if (artifacts.status.state === 'DONE') {
      const when = resolveCompletionEvidence({
        evidence: { history: grillEvidence.history, status: artifacts.status },
        artifactPath: artifacts.designTreePath,
        context: { initialT, warnings, label: `grill ${pkg.id}` },
      });
      if (when) addEvent(events, { t: when.t, prec: when.prec, stage: 'grill', packageId: pkg.id, inc: 0.1, evidence: 'Status.json', timeSource: when.source });
    }
  } else if (grillEvidence.hasHistory) {
    addEvent(events, { t: grillEvidence.history.t, prec: 'ms', stage: 'grill', packageId: pkg.id, inc: 1, evidence: 'history', timeSource: 'history' });
  }

  const graphifyEvidence = resolveExecutionEvidence(artifacts, workspaceArtifacts, 'graphify', pkg.id);
  if (graphifyEvidence.executed) {
    emitStageEvent(events, {
      stage: 'graphify',
      packageId: pkg.id,
      inc: stages.graphify,
      evidence: artifacts.graphPath || 'RFC-GRAPHIFY-Status.json',
      evidenceInfo: graphifyEvidence,
      initialT,
      warnings,
    });
  }

  const boundifyEvidence = resolveExecutionEvidence(artifacts, workspaceArtifacts, 'boundify', pkg.id);
  if (boundifyEvidence.executed) {
    const dirsTime = parseInstant(artifacts.dirs && artifacts.dirs.generatedAt);
    const statusTime = resolveStatusTime(artifacts.boundifyStatus);
    const earliestStatus = [dirsTime, statusTime].filter(Boolean).sort((left, right) => left.t - right.t)[0] || null;
    const when = resolveCompletionEvidence({
      evidence: { history: boundifyEvidence.history, statusTime: earliestStatus },
      artifactPath: artifacts.dirsPath,
      context: { initialT, warnings, label: `boundify ${pkg.id}` },
    });
    if (when) {
      addEvent(events, {
        t: when.t,
        prec: when.prec,
        stage: 'boundify',
        packageId: pkg.id,
        inc: stages.boundify,
        evidence: artifacts.dirsPath || 'RFC-BOUNDIFY-Status.json',
        timeSource: when.source,
      });
    }
  }

  const splitEvidence = resolveExecutionEvidence(artifacts, workspaceArtifacts, 'split', pkg.id);
  if (splitEvidence.executed) {
    emitStageEvent(events, {
      stage: 'split',
      packageId: pkg.id,
      inc: stages.split,
      evidence: artifacts.ticketsPath || 'RFC-SPLIT-Status.json',
      evidenceInfo: splitEvidence,
      initialT,
      warnings,
    });
  }

  if (artifacts.tickets) {
    const tickets = ticketList(artifacts);
    const count = tickets.length || 1;
    for (const ticket of tickets) {
      const status = ticket.status;
      // The explicit instants are the evidence. A status string is not a clock:
      // R1-R4 and remanded tickets carry the same fields as the nominal states.
      const madeAt = readTicketStageInstant(ticket, 'make');
      const plannedAt = readTicketStageInstant(ticket, 'plan');
      const startedAt = readTicketStageInstant(ticket, 'start');
      const reviewedAt = readTicketStageInstant(ticket, 'review');
      if (isReviewedStatus(status) && !reviewedAt) {
        warnOnce(warnings, `[evidence] review ${pkg.id}: ${ticketKeyOf(ticket)} has no reviewed_at; review not credited`);
      }
      if (madeAt) {
        addEvent(events, { t: madeAt.t, prec: madeAt.prec, stage: 'make', packageId: pkg.id, inc: 1 / count, evidence: ticketKeyOf(ticket), timeSource: 'status' });
      }
      if (plannedAt) {
        addEvent(events, { t: plannedAt.t, prec: plannedAt.prec, stage: 'plan', packageId: pkg.id, inc: 1 / count, evidence: ticketKeyOf(ticket), timeSource: 'status' });
      }
      if (startedAt) {
        addEvent(events, { t: startedAt.t, prec: startedAt.prec, stage: 'start', packageId: pkg.id, inc: 1 / count, evidence: ticketKeyOf(ticket), timeSource: 'status' });
      }
      if (reviewedAt) {
        addEvent(events, { t: reviewedAt.t, prec: reviewedAt.prec, stage: 'review', packageId: pkg.id, inc: 1 / count, evidence: ticketKeyOf(ticket), timeSource: 'status' });
      }
    }
  }

  const records = (artifacts.malfeasance && artifacts.malfeasance.records) || [];
  if (records.length > 0) {
    for (const record of records) {
      if (record.status !== 'resolved' && record.status !== 'false_positive') continue;
      const at = parseInstant(record.resolved_at);
      if (!at) {
        warnOnce(warnings, `[evidence] resolve ${pkg.id}: Malfeasance#${record.id} has no resolved_at; resolve not credited`);
        continue;
      }
      addEvent(events, {
        t: at.t,
        prec: at.prec,
        stage: 'resolve',
        packageId: pkg.id,
        inc: 1 / (records.length + (Number(artifacts.unresolvedStubs) || 0)),
        evidence: `Malfeasance#${record.id}`,
        timeSource: 'status',
      });
    }
  }

  for (const manifest of artifacts.manifests || []) {
    const when = resolveCompletionEvidence({
      evidence: {
        history: findEarliestHistoryFinish(artifacts.historyRecords, pkg.id, 'consolidate'),
        statusTime: { t: manifest.t, prec: manifest.prec },
      },
      artifactPath: manifest.path,
      context: { initialT, warnings, label: `consolidate ${pkg.id}` },
    });
    if (when) addEvent(events, { t: when.t, prec: when.prec, stage: 'consolidate', packageId: pkg.id, inc: CONSOLIDATE_MANIFEST_PORTION / Math.max(1, artifacts.manifests.length), evidence: manifest.path, timeSource: when.source });
  }
  // An omission file is the second half of consolidation: stageProgressOf sets
  // consolidate to 1 when any omission exists, so the manifest half needs its
  // complement at the omission instant or the ladder never reaches the snapshot.
  const manifestPortion = (artifacts.manifests || []).length > 0 ? CONSOLIDATE_MANIFEST_PORTION : 0;
  const consolidateRemainder = clamp01(stages.consolidate - manifestPortion);
  const firstOmission = (artifacts.omissions || [])[0];
  if (consolidateRemainder > 0 && firstOmission) {
    const when = resolveCompletionEvidence({
      evidence: {
        history: findEarliestHistoryFinish(artifacts.historyRecords, pkg.id, 'consolidate'),
        statusTime: { t: firstOmission.t, prec: firstOmission.prec },
      },
      artifactPath: firstOmission.path,
      context: { initialT, warnings, label: `consolidate ${pkg.id}` },
    });
    if (when) addEvent(events, { t: when.t, prec: when.prec, stage: 'consolidate', packageId: pkg.id, inc: consolidateRemainder, evidence: firstOmission.path, timeSource: when.source });
  }
  for (const omission of artifacts.omissions || []) {
    const when = resolveCompletionEvidence({
      evidence: {
        history: findEarliestHistoryFinish(artifacts.historyRecords, pkg.id, 'find'),
        statusTime: { t: omission.t, prec: omission.prec },
      },
      artifactPath: omission.path,
      context: { initialT, warnings, label: `find ${pkg.id}` },
    });
    if (when) addEvent(events, { t: when.t, prec: when.prec, stage: 'find', packageId: pkg.id, inc: clamp01(stages.find) / Math.max(1, artifacts.omissions.length), evidence: omission.path, timeSource: when.source });
  }

  const crystalizeEvidence = resolveExecutionEvidence(artifacts, workspaceArtifacts, 'crystalize', pkg.id);
  if (crystalizeEvidence.executed) {
    emitStageEvent(events, {
      stage: 'crystalize',
      packageId: pkg.id,
      inc: stages.crystalize,
      evidence: 'CRYSTALIZE-Status.json',
      evidenceInfo: crystalizeEvidence,
      initialT,
      warnings,
    });
  }

  const drillEvidence = resolveExecutionEvidence(artifacts, workspaceArtifacts, 'drill', pkg.id);
  if (drillEvidence.executed) {
    emitStageEvent(events, {
      stage: 'drill',
      packageId: pkg.id,
      inc: stages.drill,
      evidence: drillEvidence.hasHistory ? artifacts.historyPath : 'drills/Status.json',
      evidenceInfo: drillEvidence,
      initialT,
      warnings,
    });
  }

  return events;
}

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
function runIdTime(status) {
  return status ? parseRunId(status.runId) : null;
}

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
function parseStampFromMtime(file) {
  if (!file) return null;
  const fileMtime = mtime(file);
  if (fileMtime === null) return null;
  return { t: fileMtime, prec: 'ms', mtime: true };
}

/** Build a workspace model from package states and events. */
// [::TICKET::] PX-370 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-370 --for-spec --no-implementation-order`.
export function buildModel(input) {
  const {
    workspaceRoot, tree, allocate, packages, events, growthEvents, runs = [],
    warnings, initialT, previousProgress = null,
  } = input;
  const normalizedPreviousProgress = Number.isFinite(previousProgress)
    ? clamp01(previousProgress)
    : null;
  const sortedEvents = [...events].sort((left, right) => left.t - right.t || STAGE_ORDER.indexOf(left.stage) - STAGE_ORDER.indexOf(right.stage));
  const sortedGrowth = [...(growthEvents || [])].sort((left, right) => left.t - right.t);
  const sortedRuns = [...runs].sort((left, right) => left.t - right.t);
  const firstEvent = sortedEvents[0] || sortedGrowth[0];
  const manifestTime = (tree && tree.run && parseTimestamp(tree.run.generated_at))
    || (allocate && allocate.run && parseTimestamp(allocate.run.generated_at));
  const inferred = initialT || (firstEvent && firstEvent.t) || (manifestTime && manifestTime.t) || 0;
  const totals = {
    packages: packages.length,
    splitPackages: packages.filter((pkg) => pkg.tickets.total > 0).length,
    obligations: packages.reduce((sum, pkg) => sum + pkg.obligations.total, 0),
    covered: packages.reduce((sum, pkg) => sum + pkg.obligations.covered, 0),
    reviewed: packages.reduce((sum, pkg) => sum + pkg.obligations.reviewed, 0),
  };
  return {
    schema: 'conver-progress-model-v1',
    workspaceRoot,
    generatedAt: new Date(inferred || 0).toISOString(),
    initialT: inferred,
    packages,
    events: sortedEvents,
    growthEvents: sortedGrowth,
    runs: sortedRuns,
    previousProgress: normalizedPreviousProgress,
    totals,
    warnings: warnings || [],
  };
}

/** Diff ticket snapshots, omission files, consolidation manifests and drill rounds. */
export function reconstructTicketGrowth(input = {}) {
  const {
    snapshots = [], omissions = [], manifests = [], drills = [], tickets = [], priorityDrills = [],
  } = input;
  const events = [];
  const known = new Set();
  const contractById = new Map();
  for (const ticket of tickets) {
    const key = ticket.key || ticketKeyOf(ticket);
    contractById.set(key, countTicketContracts([ticket]).size);
  }
  const add = (t, prec, stage, addedTicketKeys, evidence, confidence) => {
    const added = [...new Set(addedTicketKeys)].filter((key) => !known.has(key));
    if (added.length === 0) return;
    for (const key of added) known.add(key);
    const addedContracts = added.reduce((sum, key) => sum + (contractById.get(key) || 0), 0);
    events.push({ t, prec: prec || 'ms', stage, addedTicketKeys: added, addedContracts,
      addedReviewed: 0, evidence, confidence });
  };
  // History runs are authoritative for the keys they record, so they are applied
  // before the snapshot/omission sources that might otherwise claim the same key.
  for (const drill of priorityDrills) add(drill.t, drill.prec, 'drill', drill.ticketKeys || [], drill.path, 'drill');
  if (snapshots.length > 0) {
    const first = snapshots[0];
    for (const ticket of first.tickets || []) known.add(ticket.key || ticketKeyOf(ticket));
    for (let index = 1; index < snapshots.length; index += 1) {
      const previous = new Set((snapshots[index - 1].tickets || []).map((ticket) => ticket.key || ticketKeyOf(ticket)));
      const added = (snapshots[index].tickets || [])
        .map((ticket) => ticket.key || ticketKeyOf(ticket))
        .filter((key) => !previous.has(key));
      add(snapshots[index].t, snapshots[index].prec, 'find', added, snapshots[index].path, 'snapshot');
    }
  }
  for (const omission of omissions) add(omission.t, omission.prec, 'find', omission.ticketKeys || [], omission.path, 'omission');
  for (const manifest of manifests) add(manifest.t, manifest.prec, 'find', manifest.ticketKeys || [], manifest.path, 'consolidation');
  for (const drill of drills) add(drill.t, drill.prec, 'drill', drill.ticketKeys || [], drill.path, 'drill');
  return events;
}

// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
function computeGrowthMass(event) {
  if (Number.isFinite(event.addedMass)) return Math.max(0, event.addedMass);
  const contracts = Math.max(0, Number(event.addedContracts) || 0);
  if (contracts > 0) return contracts;
  return (event.addedTicketKeys || []).length;
}

/**
 * Cap one package's growth mass at the ticket-only obligations it may add.
 *
 * A ticket can repeat contract ids already owned by the graph or the registry,
 * so the raw per-ticket sum is an incidence count, not a scope delta. The cap
 * keeps the animated area in the same unit as obligations.total and prevents a
 * package from growing past its final obligation count.
 */
// [::TICKET::] PX-411 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-411 --for-spec --no-implementation-order`.
export function capGrowthMass(events, ticketOnly) {
  let remaining = Math.max(0, Math.floor(Number(ticketOnly) || 0));
  return events.map((event) => {
    const mass = Math.min(computeGrowthMass(event), remaining);
    remaining -= mass;
    return { ...event, addedMass: mass };
  });
}

// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
function stageIndexesOf(events) {
  const counts = new Array(STAGE_ORDER.length).fill(0);
  for (const event of events) {
    const index = STAGE_INDEX[event.stage];
    if (index !== undefined) counts[index] += 1;
  }
  return counts;
}

// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
function computeEventWeight(count) {
  return count > 0 ? (1 + Math.log(1 + count)) / count : 0;
}

// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
export function computeDensity(progress) {
// [::TICKET::] PX-351 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-351 --for-spec --no-implementation-order`.
  let weighted = 0;
  for (let index = 0; index < STAGE_ORDER.length; index += 1) weighted += STAGE_WEIGHT[index] * progress[index];
  return weighted / STAGE_WEIGHT_SUM;
}

/**
 * Build frames with the sample's stage-weighted clock. Raw event count is a poor clock:
 * a stage with thousands of grill questions would otherwise consume the whole animation.
 */
// [::TICKET::] PX-370 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-370 --for-spec --no-implementation-order`.
/** Build the mutable package progress state for one model. */
// [::TICKET::] PX-374, PX-411 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-374|PX-411) --for-spec --no-implementation-order`.
function createPackageModels(model) {
  const packageModels = (model.packages || []).map((pkg, index) => {
    const cap = Math.max(0, Number(pkg.obligations.total) || 0);
    // Seed the area with the obligations that are not ticket-only, so the
    // circle starts at graph/boundary scale and only ticket-only scope grows.
    const seededMass = capGrowthMass(
      (model.growthEvents || []).filter((event) => event.packageId === pkg.id),
      pkg.obligations.ticketOnly,
    ).reduce((sum, event) => sum + event.addedMass, 0);
    return {
      id: pkg.id,
      name: pkg.name,
      path: pkg.path,
      index,
      cap,
      total: Math.max(0, cap - seededMass),
      weight: Math.max(1, cap),
      progress: new Array(STAGE_ORDER.length).fill(0),
    };
  });
  return { packageModels, byId: new Map(packageModels.map((pkg) => [pkg.id, pkg])) };
}

/**
 * Group the model by stage. The ordinal order clock only needs the stage groups;
 * run and growth markers are decorations that never advance the stage frontier.
 */
// [::TICKET::] PX-381 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-381 --for-spec --no-implementation-order`.
function collectStageGroups(model) {
  const stageGroups = new Map();
  const decorations = [];
  let seq = 0;
  for (const event of model.events || []) {
    if (!Number.isFinite(event.t) || !(event.inc > 0)) continue;
    if (STAGE_INDEX[event.stage] === undefined) continue;
    const entry = {
      kind: 'stage',
      stage: event.stage,
      packageId: event.packageId,
      evidenceT: event.t,
      prec: event.prec || 'ms',
      inc: event.inc,
      seq: seq++,
      timeSource: event.timeSource,
      evidence: event.evidence,
    };
    const group = stageGroups.get(event.stage) || [];
    group.push(entry);
    stageGroups.set(event.stage, group);
  }
  for (const event of model.growthEvents || []) {
    if (!Number.isFinite(event.t) || STAGE_INDEX[event.stage] === undefined) continue;
    decorations.push({
      kind: 'growth',
      stage: event.stage,
      packageId: event.packageId,
      evidenceT: event.t,
      prec: event.prec || 'ms',
      addedMass: computeGrowthMass(event),
      addedTicketKeys: event.addedTicketKeys || [],
      seq: seq++,
      evidence: event.evidence,
    });
  }
  for (const run of model.runs || []) {
    if (!Number.isFinite(run.t) || STAGE_INDEX[run.stage] === undefined) continue;
    decorations.push({
      kind: 'run',
      stage: run.stage,
      packageId: run.packageId,
      evidenceT: run.t,
      prec: run.prec || 'ms',
      status: run.status,
      runId: run.runId,
      seq: seq++,
      evidence: run.evidence,
    });
  }
  return { stageGroups, decorations };
}

// [::TICKET::] PX-381 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-381 --for-spec --no-implementation-order`.
function trustedStageTimes(events) {
  return events
    .filter((event) => event.kind === 'stage' && TRUSTED_TIME_SOURCES.has(event.timeSource))
    .map((event) => event.evidenceT);
}

/**
 * A display date is an estimate, never an ordering key. Trusted command evidence
 * seeds it; an untrusted stage yields to the next trusted stage so a copied mtime
 * cannot drag the axis, and a forward pass keeps the header date monotonic.
 */
// [::TICKET::] PX-381 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-381 --for-spec --no-implementation-order`.
function computeStageDisplayDates(stageGroups, model, warnings) {
  const presentStages = STAGE_ORDER.filter((stage) => stageGroups.has(stage));
  const analysisTime = Number.isFinite(model.analysisTime) ? model.analysisTime : null;
  const bound = analysisTime === null ? null : analysisTime + MAX_FUTURE_SKEW_MS;
  const trustedByStage = new Map(presentStages.map((stage) => [stage, trustedStageTimes(stageGroups.get(stage))]));
  const estimates = new Map();
  for (const stage of presentStages) {
    const events = stageGroups.get(stage);
    const trusted = trustedByStage.get(stage);
    let estimate = trusted.length > 0
      ? Math.min(...trusted)
      : Math.min(...events.map((event) => event.evidenceT));
    if (trusted.length === 0) {
      const position = presentStages.indexOf(stage);
      for (const downstream of presentStages.slice(position + 1)) {
        const downstreamTrusted = trustedByStage.get(downstream);
        if (downstreamTrusted.length === 0) continue;
        const wall = Math.min(...downstreamTrusted);
        if (estimate > wall) {
          warnings.push(`[order] ${stage}: display date ${new Date(estimate).toISOString()} clamped to ${new Date(wall).toISOString()}`);
          estimate = wall;
        }
        break;
      }
    }
    if (Number.isFinite(model.initialT)) estimate = Math.max(model.initialT, estimate);
    if (bound !== null) {
      const latest = Math.max(...events.map((event) => event.evidenceT));
      if (latest > bound) {
        warnings.push(`[evidence] ${stage}: future timestamp ${new Date(latest).toISOString()} exceeds analysisTime + 24h; display clamped`);
        estimate = Math.min(estimate, bound);
      }
    }
    estimates.set(stage, estimate);
  }
  const displayDate = new Map();
  let previous = -Infinity;
  for (const stage of presentStages) {
    previous = Math.max(previous, estimates.get(stage));
    displayDate.set(stage, previous);
  }
  return { displayDate, presentStages };
}

/**
 * Attach the stage-weighted clock to an ordered timeline. The weights depend on
 * how many events each stage contributes, never on the order of the stages, so
 * the ordinal and execution-order timelines share this arithmetic.
 */
// [::TICKET::] PX-391 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-391 --for-spec --no-implementation-order`.
function weighTimeline(timeline) {
  const stageCounts = stageIndexesOf(timeline);
  const weights = timeline.map((event) => computeEventWeight(stageCounts[STAGE_INDEX[event.stage]]));
  const cumulative = [];
  const stageStartIndex = new Map();
  const stageStartWeight = new Map();
  let totalWeight = 0;
  for (let index = 0; index < timeline.length; index += 1) {
    const stage = timeline[index].stage;
    if (!stageStartIndex.has(stage)) {
      stageStartIndex.set(stage, index);
      stageStartWeight.set(stage, totalWeight);
    }
    totalWeight += weights[index];
    cumulative.push(totalWeight);
  }
  return { stageCounts, weights, cumulative, totalWeight, stageStartIndex, stageStartWeight };
}

/**
 * Walk the stages in STAGE_ORDER. Within a stage the evidence clock orders the
 * events; decorations whose stage has no stage event attach to the nearest
 * present stage so a run marker is still drawn somewhere meaningful.
 */
// [::TICKET::] PX-381 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-381 --for-spec --no-implementation-order`.
function buildOrdinalTimeline(stageGroups, decorations, displayDate, presentStages) {
  const assigned = new Map(presentStages.map((stage) => [stage, stageGroups.get(stage).slice()]));
  for (const event of decorations) {
    let target = assigned.has(event.stage) ? event.stage : null;
    if (target === null) {
      for (let index = STAGE_INDEX[event.stage]; index >= 0; index -= 1) {
        const candidate = STAGE_ORDER[index];
        if (assigned.has(candidate)) { target = candidate; break; }
      }
    }
    if (target === null) {
      for (let index = STAGE_INDEX[event.stage] + 1; index < STAGE_ORDER.length; index += 1) {
        const candidate = STAGE_ORDER[index];
        if (assigned.has(candidate)) { target = candidate; break; }
      }
    }
    if (target !== null) assigned.get(target).push(event);
  }
  const timeline = [];
  for (const stage of presentStages) {
    const events = assigned.get(stage).sort((left, right) =>
      left.evidenceT - right.evidenceT
      || String(left.packageId ?? '').localeCompare(String(right.packageId ?? ''))
      || left.seq - right.seq);
    for (const event of events) {
      // The ordinal path keeps the evidence time as the progress prefix key so
      // previousProgress stays identical to PX-374/PX-381.
      // [::TICKET::] PX-391 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-391 --for-spec --no-implementation-order`.
      timeline.push({ ...event, t: displayDate.get(stage), orderT: event.evidenceT, orderIndex: timeline.length });
    }
  }
  return { timeline, ...weighTimeline(timeline) };
}

/** Runs grouped by stage and package, each group ordered by its command time. */
// [::TICKET::] PX-391 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-391 --for-spec --no-implementation-order`.
function executionRunMap(runs) {
  const byStageAndPackage = new Map();
  for (const run of runs || []) {
    if (!Number.isFinite(run.t) || STAGE_INDEX[run.stage] === undefined) continue;
    const key = `${run.stage}\u0000${run.packageId ?? ''}`;
    const group = byStageAndPackage.get(key) || [];
    group.push(run);
    byStageAndPackage.set(key, group);
  }
  for (const group of byStageAndPackage.values()) {
    group.sort((left, right) => left.t - right.t);
  }
  return byStageAndPackage;
}

/**
 * The execution-order key for one stage or growth event.
 *
 * A run is the command that produced the event, so an event inside the run
 * coverage follows the latest run at or before it. An event before the first run,
 * or one whose stage/package has no run at all, keeps the display estimate: that
 * is the only clock a workspace created before history has.
 */
// [::TICKET::] PX-391, PX-392 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-391|PX-392) --for-spec --no-implementation-order`.
function executionOrderTime(event, runMap, displayDate) {
  if (event.kind === 'run' || event.timeSource === 'history') return event.evidenceT;
  const key = `${event.stage}\u0000${event.packageId ?? ''}`;
  const runs = runMap.get(key);
  if (runs && runs.length > 0) {
    if (event.evidenceT >= runs[0].t) {
      let anchor = runs[0].t;
      for (const run of runs) {
        if (run.t > event.evidenceT) break;
        anchor = run.t;
      }
      return anchor;
    }
    const estimate = displayDate.get(event.stage);
    if (Number.isFinite(estimate)) return estimate;
    return Number.isFinite(event.evidenceT) ? event.evidenceT : null;
  }
  const estimate = displayDate.get(event.stage);
  if (Number.isFinite(estimate)) return estimate;
  return Number.isFinite(event.evidenceT) ? event.evidenceT : null;
}

/** Build the execution-order timeline: timestamps order the events, stage visits may repeat. */
// [::TICKET::] PX-391, PX-392 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-391|PX-392) --for-spec --no-implementation-order`.
function buildExecutionTimeline(stageGroups, decorations, displayDate, model) {
  const runMap = executionRunMap(model.runs || []);
  const entries = [];
  for (const group of stageGroups.values()) {
    for (const event of group) {
      const orderT = executionOrderTime(event, runMap, displayDate);
      if (Number.isFinite(orderT)) entries.push({ ...event, orderT, displayT: orderT });
    }
  }
  for (const event of decorations) {
    const orderT = executionOrderTime(event, runMap, displayDate);
    if (Number.isFinite(orderT)) entries.push({ ...event, orderT, displayT: orderT });
  }
  entries.sort((left, right) =>
    left.orderT - right.orderT
    || STAGE_INDEX[left.stage] - STAGE_INDEX[right.stage]
    || left.evidenceT - right.evidenceT
    || String(left.packageId ?? '').localeCompare(String(right.packageId ?? ''))
    || left.seq - right.seq);
  const timeline = entries.map((entry, index) => ({ ...entry, t: entry.displayT, orderIndex: index }));
  return { timeline, ...weighTimeline(timeline) };
}

/** Build the timeline: execution order when history exists, the ordinal estimate otherwise. */
// [::TICKET::] PX-381, PX-391 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-381|PX-391) --for-spec --no-implementation-order`.
export function buildTimeline(model) {
  const { stageGroups, decorations } = collectStageGroups(model);
  const warnings = [];
  const { displayDate, presentStages } = computeStageDisplayDates(stageGroups, model, warnings);
  const chronological = (model.runs || []).length > 0;
  if (presentStages.length === 0) {
    if (chronological) {
      const built = buildExecutionTimeline(stageGroups, decorations, displayDate, model);
      return { ...built, displayDate, stageOrder: [], warnings, chronological: true };
    }
    const timeline = decorations
      .slice()
      .sort((left, right) => left.evidenceT - right.evidenceT || left.seq - right.seq)
      .map((event, index) => ({ ...event, t: event.evidenceT, orderT: event.evidenceT, orderIndex: index }));
    return { timeline, ...weighTimeline(timeline), displayDate, stageOrder: [], warnings, chronological: false };
  }
  const built = chronological
    ? buildExecutionTimeline(stageGroups, decorations, displayDate, model)
    : buildOrdinalTimeline(stageGroups, decorations, displayDate, presentStages);
  return { ...built, displayDate, stageOrder: presentStages, warnings, chronological };
}

/** Create one fresh frame state over a built timeline. */
// [::TICKET::] PX-374, PX-381 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-374|PX-381) --for-spec --no-implementation-order`.
export function createFrameState(model, timeline) {
  const { packageModels, byId } = createPackageModels(model);
  const first = timeline.timeline.length > 0 ? timeline.timeline[0] : null;
  return {
    model,
    timeline: timeline.timeline,
    // A chronological timeline lets a run marker move the displayed stage; the
    // ordinal path keeps the monotonic frontier PX-381 established.
    // [::TICKET::] PX-391 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-391 --for-spec --no-implementation-order`.
    chronological: timeline.chronological === true,
    packageModels,
    byId,
    lastT: first ? first.t : (model.initialT || 0),
    lastEvidenceT: first ? first.evidenceT : (model.initialT || 0),
    lastStageIndex: first ? STAGE_INDEX[first.stage] : 0,
    lastStage: first ? first.stage : STAGE_ORDER[0],
    lastPrec: first ? first.prec : 'ms',
    cursor: 0,
    seenGrowthKeys: new Set(),
    active: [],
    rootPulse: false,
    growthThisFrame: [],
    runsThisFrame: [],
  };
}

/**
 * Advance the displayed stage frontier.
 *
 * The ordinal path keeps the PX-381 rule: only a stage event moves the frontier,
 * monotonically, because a run records an attempt and must not claim a stage the
 * workspace has not reached. The execution-order path follows the command that
 * just ran: a stage or run event sets the displayed stage, including a revisit of
 * an earlier stage. A growth marker never moves the frontier in either path.
 */
// [::TICKET::] PX-375, PX-391 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-375|PX-391) --for-spec --no-implementation-order`.
function advanceStageFrontier(state, event) {
  if (state.chronological) {
    if (event.kind === 'stage' || event.kind === 'run') {
      state.lastStageIndex = STAGE_INDEX[event.stage];
      state.lastStage = STAGE_ORDER[state.lastStageIndex];
    }
    return;
  }
  if (event.kind !== 'stage') return;
  state.lastStageIndex = Math.max(state.lastStageIndex, STAGE_INDEX[event.stage]);
  state.lastStage = STAGE_ORDER[state.lastStageIndex];
}

/** Apply one timeline event to the frame state. */
// [::TICKET::] PX-374, PX-381, PX-411 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-374|PX-381|PX-411) --for-spec --no-implementation-order`.
export function applyEvent(state, event) {
  state.lastT = event.t;
  state.lastEvidenceT = Math.max(state.lastEvidenceT, event.evidenceT);
  state.lastPrec = event.prec || 'ms';
  advanceStageFrontier(state, event);
  const packageScoped = event.packageId !== null && event.packageId !== undefined;
  if (event.kind === 'stage') {
    const targets = packageScoped ? [state.byId.get(event.packageId)].filter(Boolean) : state.packageModels;
    const stageIndex = STAGE_INDEX[event.stage];
    for (const pkg of targets) {
      pkg.progress[stageIndex] = clamp01(pkg.progress[stageIndex] + event.inc);
      state.active.push(packageScoped ? pkg.index * STAGE_ORDER.length + stageIndex : -100 - stageIndex);
    }
    if (!packageScoped) state.rootPulse = true;
  } else if (event.kind === 'run') {
    state.runsThisFrame.push({
      packageId: event.packageId,
      stage: event.stage,
      status: event.status,
      runId: event.runId,
    });
  } else {
    const ticketKeys = event.addedTicketKeys ?? [];
    const unseen = ticketKeys.filter((key) => !state.seenGrowthKeys.has(key));
    if (ticketKeys.length > 0 && unseen.length === 0) return;
    for (const key of unseen) state.seenGrowthKeys.add(key);
    const pkg = state.byId.get(event.packageId);
    if (pkg) pkg.total = Math.min(pkg.cap, Math.max(0, pkg.total + event.addedMass));
    state.growthThisFrame.push({
      packageId: event.packageId,
      stage: event.stage,
      addedMass: event.addedMass,
      evidence: event.evidence,
    });
  }
}

/** Project the current state into one frame payload. */
// [::TICKET::] PX-374, PX-381, PX-411 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-374|PX-381|PX-411) --for-spec --no-implementation-order`.
export function frameFromState(state, model, index) {
  const packageFrames = state.packageModels.map((pkg) => ({
    id: pkg.id,
    name: pkg.name,
    path: pkg.path,
    total: pkg.total,
    reviewedRatio: packageReviewedRatioAt((model.packages || [])[pkg.index], state.lastT),
    density: computeDensity(pkg.progress),
  }));
  const globalStage = STAGE_ORDER.map((stage, stageIndex) => {
    const weight = state.packageModels.reduce((sum, pkg) => sum + pkg.weight, 0);
    if (weight <= 0) return 0;
    const weighted = state.packageModels.reduce((sum, pkg) => sum + pkg.progress[stageIndex] * pkg.weight, 0);
    return weighted / weight;
  });
  // Models built before the availability flag keep the old "records mean available" rule.
  const hasUsageRecords = (model.usage || []).length > 0;
  const usageAvailable = model.usageAvailable === undefined ? hasUsageRecords : model.usageAvailable === true;
  const cumulativeUsage = usageAvailable
    ? usageAtDate(model.usage, displayDateKey(state.lastT, state.lastPrec))
    : null;
  const contractProgress = contractsAt(model, state.lastT);
  const usageTitle = cumulativeUsage && model.titleName
    ? usageTitleSegments(
      model.titleName,
      cumulativeUsage,
      contractsValue(contractProgress),
      ticketsValue(ticketsAt(model, state.lastT)),
      costPerContractValue(cumulativeUsage.costUsd, contractProgress),
    )
    : null;
  const frame = {
    index,
    t: state.lastT,
    evidenceT: state.lastEvidenceT,
    prec: state.lastPrec,
    stage: state.lastStage,
    packages: packageFrames,
    pi: state.packageModels.map((pkg) => pkg.progress.slice()),
    globalStage,
    overallProgress: computeDensity(globalStage),
    active: state.active.slice(),
    rootPulse: state.rootPulse,
    growth: state.growthThisFrame.slice(),
    title: usageTitle ? usageTitle.text : undefined,
    titleParts: usageTitle
      ? { left: usageTitle.left, right: usageTitle.right, rightParts: usageTitle.rightParts }
      : undefined,
    density: packageFrames.length > 0
      ? packageFrames.reduce((sum, pkg) => sum + pkg.density, 0) / packageFrames.length
      : 0,
  };
  // A frame with no run keeps the pre-change shape, so a no-history workspace
  // stays byte-identical rather than gaining an empty array.
  if (state.runsThisFrame.length > 0) frame.runs = state.runsThisFrame.slice();
  // The previous-run boundary is omitted when unknown so legacy frames keep
  // their exact key set.
  if (Number.isFinite(model.previousProgress)) frame.previousProgress = clamp01(model.previousProgress);
  return frame;
}

/**
 * The animation state at one timestamp. Only events whose order time is at or
 * before the stamp may contribute: an ordinal prefix would also sweep in work
 * from an early stage that happened after the stamp, which is exactly the work
 * the previous-render marker must exclude. The ordinal path carries
 * orderT === evidenceT, so its prefix is unchanged.
 */
// [::TICKET::] PX-374, PX-381, PX-391 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-374|PX-381|PX-391) --for-spec --no-implementation-order`.
export function progressAt(model, timestamp) {
  const timeline = buildTimeline(model);
  const state = createFrameState(model, timeline);
  for (const event of timeline.timeline) {
    const orderTime = Number.isFinite(event.orderT) ? event.orderT : event.evidenceT;
    if (orderTime > timestamp) continue;
    applyEvent(state, event);
  }
  return frameFromState(state, model, 0).overallProgress;
}

/**
 * Build frames with the sample's stage-weighted clock. Raw event count is a poor clock:
 * a stage with thousands of grill questions would otherwise consume the whole animation.
 */
// [::TICKET::] PX-370, PX-374, PX-381 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-370|PX-374|PX-381) --for-spec --no-implementation-order`.
export function buildFrames(model, options = {}) {
  const frameCount = Math.max(1, Number(options.frames) || 120);
  const holdStart = Math.min(HOLD_START_FRAMES, Math.floor(frameCount / 4));
  const holdEnd = Math.min(HOLD_END_FRAMES, Math.floor(frameCount / 4));
  const span = Math.max(1, frameCount - 1 - holdStart - holdEnd);
  const timeline = buildTimeline(model);
  if (Array.isArray(model.warnings)) {
    for (const message of timeline.warnings) warnOnce(model.warnings, message);
  }
  const state = createFrameState(model, timeline);
  // The ordinal clock ends at the last stage's estimate, which is always in the
  // past. The final frames must still reach the analysis instant so the header
  // date and the cumulative token figure cover every recorded day, including
  // the day the render ran.
  const lastDisplayT = timeline.timeline.length > 0 ? timeline.timeline.at(-1).t : (model.initialT || 0);
  const tailEndT = Number.isFinite(model.analysisTime) && model.analysisTime > lastDisplayT
    ? model.analysisTime
    : lastDisplayT;
  const tailStart = frameCount - 1 - holdEnd;
  const frames = [];
  for (let index = 0; index < frameCount; index += 1) {
    const rawProgress = span <= 0 ? (index === frameCount - 1 ? 1 : 0) : (index - holdStart) / span;
    const progress = Math.max(0, Math.min(1, rawProgress));
    const targetWeight = progress >= 1 ? timeline.totalWeight : progress * timeline.totalWeight;
    state.active = [];
    state.rootPulse = false;
    state.growthThisFrame = [];
    state.runsThisFrame = [];
    while (state.cursor < timeline.timeline.length) {
      const event = timeline.timeline[state.cursor];
      const entersStage = timeline.stageStartIndex.get(event.stage) === state.cursor;
      const threshold = entersStage ? timeline.stageStartWeight.get(event.stage) : timeline.cumulative[state.cursor];
      if (progress < 1 && threshold >= targetWeight) break;
      applyEvent(state, event);
      state.cursor += 1;
    }
    if (progress >= 1 && tailEndT > lastDisplayT) {
      const tailSpan = frameCount - 1 - tailStart;
      const ratio = tailSpan > 0 ? (index - tailStart) / tailSpan : 1;
      state.lastT = lastDisplayT + (tailEndT - lastDisplayT) * Math.max(0, Math.min(1, ratio));
    }
    frames.push(frameFromState(state, model, index));
  }
  return frames;
}

/**
 * A workspace-level event advances every cell, so it already covers the package.
 * Treating it as missing would add a duplicate at the initial time and pull the
 * stage to the front of the animation.
 */
function isStageCoveredFor(events, stage, packageId) {
  return events.some((event) => event.stage === stage
    && (event.packageId === packageId || event.packageId === null || event.packageId === undefined));
}

/** The earliest instant this package's events place a stage at. */
function earliestStageTime(events, stage) {
  let earliest = null;
  for (const event of events) {
    if (event.stage !== stage || !Number.isFinite(event.t)) continue;
    if (earliest === null || event.t < earliest) earliest = event.t;
  }
  return earliest;
}

/** Derive one package's obligations, stage fractions and events. */
export function derivePackageState(pkg, artifacts, workspaceArtifacts, registry, warnings) {
  const computed = computePackageObligations(pkg, artifacts, registry);
  for (const message of computed.warnings) warnings.push(message);
  const stages = stageProgressOf(artifacts, workspaceArtifacts, pkg.id, warnings);
  const events = stageEventsOf(pkg, artifacts, workspaceArtifacts, warnings);
  for (const stage of STAGE_ORDER) {
    if (stages[stage] <= 0) continue;
    // An implementation stage is drawn only from its explicit completion field.
    if (EXPLICIT_COMPLETION_STAGES.has(stage)) continue;
    if (!isStageCoveredFor(events, stage, pkg.id)) {
      events.push({ t: workspaceArtifacts.initialT || 0, prec: 'ms', stage, packageId: pkg.id, inc: stages[stage], evidence: 'artifact-presence' });
    }
  }
  // The split instant is when Tickets.json appeared, so every ticket it lists is
  // owed from then on. An honest artifact time is the fallback when the split
  // status is missing; without either, presence stays unknown.
  const ticketsPresentAt = earliestStageTime(events, 'split')
    ?? parseStampFromMtime(artifacts.ticketsPath)?.t
    ?? null;
  const contractLog = (artifacts.tickets ? ticketsOf(artifacts.tickets) : []).map((ticket) => ({
    presentAt: ticketsPresentAt,
    reviewedAt: parseInstant(ticket.reviewed_at)?.t ?? null,
    contractIds: [...countTicketContracts([ticket])],
  }));
  return {
    packageModel: {
      id: pkg.id,
      name: pkg.name,
      path: pkg.path,
      obligations: computed.obligations,
      tickets: computed.tickets,
      stages,
      contractLog,
    },
    events,
    artifacts,
  };
}
