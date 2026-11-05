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
const UPSTREAM_STAGES = Object.freeze([
  STAGE_INDEX.explain,
  STAGE_INDEX.grill,
  STAGE_INDEX.graphify,
  STAGE_INDEX.boundify,
  STAGE_INDEX.split,
]);
const SMOOTH_STAGE = STAGE_INDEX.smooth;
const DRILL_STAGE_INDEX = STAGE_INDEX.drill;
// Drill is not upstream, but it must be clamped last so a drill event cannot
// overtake the split that produced the tickets it consumes.
const ORDERED_STAGE_INDEXES = Object.freeze([...UPSTREAM_STAGES, DRILL_STAGE_INDEX]);
// Only command-written evidence is trusted as a clock. An artifact mtime is
// copied by a checkout, so it must yield to these sources.
const TRUSTED_TIME_SOURCES = new Set(['history', 'status']);
// Both explain and grill fall back to a file mtime when no command wrote a time,
// so a checkout can move them past a completed drill. Their times must yield to
// the earliest trusted downstream stage of the same package. Grill itself is not
// a bound: orderGrillAfterExplain rewrites grill to follow explain, so using a
// grill timestamp as a bound would form a cycle.
const ARTIFACT_CLAMPED_STAGES = Object.freeze(['explain', 'grill']);
const ARTIFACT_CLAMP_BOUND_STAGES = Object.freeze(['graphify', 'boundify', 'split']);
const PRE_SMOOTH_STAGES = Object.freeze(['explain', 'grill']);

const EDuce_PHASES = 18;
// Phase 1 of the drill has twelve sub-steps (1-1..1-12). Steps 2-1..5-1 are the
// graphify / boundify / split / verify gates that follow it.
const DRILL_PHASE1_STEPS = 12;
const DRILL_PHASE1_STEP = /^1-(\d+)$/;
const DRILL_GATE_STEP = /^[2-5]-1$/;
const GRAPH_STEPS = ['0', '1', '2', '3', '4', '5'];
const BOUNDIFY_STEPS = ['0', '1', '2', '3'];
const SPLIT_STEPS = ['0-1', '0-2', '1', '2', '3', '4-1', '4-2', '5-1', '5-2', '5-3', '6'];
const CRYSTALIZE_STEPS = 4;
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

const USAGE_TITLE_PREFIX = 'PROGRESS: ';
const USAGE_TITLE_LABEL = 'I/C/O/D = ';

/** Round a token count up to whole millions; display rounding only. */
// [::TICKET::] PX-354 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-354 --for-spec --no-implementation-order`.
function formatMillions(value) {
  return Math.ceil((Number(value) || 0) / MILLION);
}

// [::TICKET::] PX-354 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-354 --for-spec --no-implementation-order`.
function formatDollars(value) {
  return Math.ceil(Number(value) || 0);
}

/**
 * Split the usage title into a left name and a right-aligned metric block.
 *
 * The renderer places `right` against the title bar's right edge, so the block
 * must stay a separate string; `text` is only the plain-text fallback.
 */
// [::TICKET::] PX-352, PX-354 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-352|PX-354) --for-spec --no-implementation-order`.
export function usageTitleSegments(name, cumulative) {
  const left = `${USAGE_TITLE_PREFIX}${name || 'PROGRESS'}`;
  const right = `${USAGE_TITLE_LABEL}${formatMillions(cumulative.cacheMissInputTokens)}M / `
    + `${formatMillions(cumulative.cacheHitInputTokens)}M / `
    + `${formatMillions(cumulative.outputTokens)}M / `
    + `$${formatDollars(cumulative.costUsd)}`;
  return { left, right, text: `${left} | ${right}` };
}

// [::TICKET::] PX-352, PX-354 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-352|PX-354) --for-spec --no-implementation-order`.
export function formatUsageTitle(name, cumulative) {
  return usageTitleSegments(name, cumulative).text;
}

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
// [::TICKET::] PX-370 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-370 --for-spec --no-implementation-order`.
export function clamp01(value) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
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
  for (const value of [status.completedAt, status.updatedAt, status.measuredAt, status.generationStartedAt, status.generatedAt]) {
    const parsed = parseInstant(value);
    if (parsed) return parsed;
  }
  return null;
}

/** An artifact write time, or null when the file is missing or older than the model origin. */
// [::TICKET::] PX-374 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-374 --for-spec --no-implementation-order`.
function resolveArtifactTime(file, initialT) {
  if (!file) return null;
  const value = mtime(file);
  if (value === null) return null;
  if (Number.isFinite(initialT) && value < initialT) return null;
  return { t: value, prec: 'ms' };
}

/**
 * The stage completion time. Command evidence (history then status) is trusted;
 * an artifact mtime is used only when neither supplies a time, so a later touch
 * or a copied mtime cannot move a command completion.
 */
// [::TICKET::] PX-374 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-374 --for-spec --no-implementation-order`.
function resolveCompletionEvidence({ history = null, status = null, statusTime = null, artifactPath = null, initialT = 0 } = {}) {
  const candidates = [];
  if (history) candidates.push({ ...history, source: 'history' });
  const statusCandidate = statusTime || (status ? resolveStatusTime(status) : null);
  if (statusCandidate) candidates.push({ ...statusCandidate, source: 'status' });
  if (candidates.length > 0) {
    return candidates.sort((left, right) => left.t - right.t
      || SOURCE_RANK[left.source] - SOURCE_RANK[right.source])[0];
  }
  const artifact = resolveArtifactTime(artifactPath, initialT);
  return artifact ? { ...artifact, source: 'artifact' } : null;
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


// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
function resolvedQuestions(designTree) {
  const resolved = [];
  const visit = (nodes) => {
    for (const node of nodes || []) {
      if (node.status === 'resolved') {
        let best = null;
        for (const question of node.questions || []) {
          const parsed = parseTimestamp(question.resolvedAt);
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
    const resolved = resolvedQuestions(artifacts.designTree);
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
  if (manifests.length > 0) stages.consolidate = 0.5;
  if (omissions.length > 0) {
    stages.consolidate = 1;
    const tickets = ticketList(artifacts);
    const pending = tickets.some((ticket) => ticket.status === 'remanded' || ticket.forNextRound);
    stages.find = pending ? 0.5 : 1;
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
// [::TICKET::] PX-374 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-374 --for-spec --no-implementation-order`.
function emitStageEvent(events, input) {
  const { stage, packageId, inc, evidence, evidenceInfo, initialT } = input;
  if (!evidenceInfo || !evidenceInfo.executed) return false;
  const when = resolveCompletionEvidence({
    history: evidenceInfo.history,
    status: evidenceInfo.status,
    artifactPath: evidenceInfo.artifactPath,
    initialT,
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
// [::TICKET::] PX-374 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-374 --for-spec --no-implementation-order`.
export function stageEventsOf(pkg, artifacts, workspaceArtifacts = {}, warnings = []) {
  const events = [];
  const initialT = workspaceArtifacts.initialT || 0;
  const stages = stageProgressOf(artifacts, workspaceArtifacts, pkg.id, warnings);

  const educeEvidence = resolveExecutionEvidence(artifacts, workspaceArtifacts, 'educe', pkg.id);
  const educe = workspaceArtifacts.educeStatus;
  if (educe && Array.isArray(educe.phases)) {
    const done = educe.phases.filter((phase) => phase.status === 'done').length / EDuce_PHASES;
    const when = resolveCompletionEvidence({
      history: educeEvidence.history,
      status: educe,
      artifactPath: workspaceArtifacts.sequencesPath,
      initialT,
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
      history: smoothEvidence.history,
      status: smooth,
      artifactPath: workspaceArtifacts.smoothStatusPath,
      initialT,
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
    const when = resolveCompletionEvidence({ history: explainEvidence.history, artifactPath: artifacts.info, initialT });
    if (when) addEvent(events, { t: when.t, prec: when.prec, stage: 'explain', packageId: pkg.id, inc: 0.35, evidence: artifacts.info, timeSource: when.source });
  }
  if (artifacts.explain) {
    const when = resolveCompletionEvidence({ history: explainEvidence.history, artifactPath: artifacts.explain, initialT });
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
    const resolved = resolvedQuestions(artifacts.designTree);
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
        history: grillEvidence.history,
        status: artifacts.status,
        artifactPath: artifacts.designTreePath,
        initialT,
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
    });
  }

  const boundifyEvidence = resolveExecutionEvidence(artifacts, workspaceArtifacts, 'boundify', pkg.id);
  if (boundifyEvidence.executed) {
    const dirsTime = parseInstant(artifacts.dirs && artifacts.dirs.generatedAt);
    const statusTime = resolveStatusTime(artifacts.boundifyStatus);
    const earliestStatus = [dirsTime, statusTime].filter(Boolean).sort((left, right) => left.t - right.t)[0] || null;
    const when = resolveCompletionEvidence({
      history: boundifyEvidence.history,
      statusTime: earliestStatus,
      artifactPath: artifacts.dirsPath,
      initialT,
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
    });
  }

  if (artifacts.tickets) {
    const ticketsMtime = resolveArtifactTime(artifacts.ticketsPath, initialT);
    const tickets = ticketList(artifacts);
    const count = tickets.length || 1;
    for (const ticket of tickets) {
      const createdAt = parseInstant(ticket.created_at);
      const updatedAt = parseInstant(ticket.updated_at);
      const startedAt = parseInstant(ticket.startedAt);
      const completedAt = parseInstant(ticket.completedAt);
      const created = createdAt || ticketsMtime || { t: initialT, prec: 'ms' };
      const createdSource = createdAt ? 'status' : ticketsMtime ? 'artifact' : 'initial';
      const updated = updatedAt || created;
      const updatedSource = updatedAt ? 'status' : createdSource;
      const started = startedAt || created;
      const startedSource = startedAt ? 'status' : createdSource;
      const completed = completedAt || updated;
      const completedSource = completedAt ? 'status' : updatedSource;
      if (ticket.status && ticket.status !== 'todo') {
        addEvent(events, { t: created.t, prec: created.prec, stage: 'make', packageId: pkg.id, inc: 1 / count, evidence: ticketKeyOf(ticket), timeSource: createdSource });
      }
      if (['planned', 'claimed', 'started', 'done', 'reviewed'].includes(ticket.status)) {
        addEvent(events, { t: updated.t, prec: updated.prec, stage: 'plan', packageId: pkg.id, inc: 1 / count, evidence: ticketKeyOf(ticket), timeSource: updatedSource });
      }
      if (['started', 'done', 'reviewed'].includes(ticket.status)) {
        addEvent(events, { t: started.t, prec: started.prec, stage: 'start', packageId: pkg.id, inc: 1 / count, evidence: ticketKeyOf(ticket), timeSource: startedSource });
      }
      if (ticket.status === 'reviewed' || isReviewedStatus(ticket.status)) {
        addEvent(events, { t: completed.t, prec: completed.prec, stage: 'review', packageId: pkg.id, inc: 1 / count, evidence: ticketKeyOf(ticket), timeSource: completedSource });
      }
    }
  }

  const records = (artifacts.malfeasance && artifacts.malfeasance.records) || [];
  if (records.length > 0) {
    for (const record of records) {
      if (record.status !== 'resolved' && record.status !== 'false_positive') continue;
      const at = parseInstant(record.resolved_at) || parseInstant(record.detected_at);
      addEvent(events, {
        t: at ? at.t : initialT,
        prec: at ? at.prec : 'ms',
        stage: 'resolve',
        packageId: pkg.id,
        inc: 1 / (records.length + (Number(artifacts.unresolvedStubs) || 0)),
        evidence: `Malfeasance#${record.id}`,
        timeSource: at ? 'status' : 'initial',
      });
    }
  }

  for (const manifest of artifacts.manifests || []) {
    const when = resolveCompletionEvidence({
      history: findEarliestHistoryFinish(artifacts.historyRecords, pkg.id, 'consolidate'),
      statusTime: { t: manifest.t, prec: manifest.prec },
      artifactPath: manifest.path,
      initialT,
    });
    if (when) addEvent(events, { t: when.t, prec: when.prec, stage: 'consolidate', packageId: pkg.id, inc: 0.5 / Math.max(1, artifacts.manifests.length), evidence: manifest.path, timeSource: when.source });
  }
  for (const omission of artifacts.omissions || []) {
    const when = resolveCompletionEvidence({
      history: findEarliestHistoryFinish(artifacts.historyRecords, pkg.id, 'find'),
      statusTime: { t: omission.t, prec: omission.prec },
      artifactPath: omission.path,
      initialT,
    });
    if (when) addEvent(events, { t: when.t, prec: when.prec, stage: 'find', packageId: pkg.id, inc: 1 / Math.max(1, artifacts.omissions.length), evidence: omission.path, timeSource: when.source });
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
  const value = mtime(file);
  if (value === null) return null;
  return { t: value, prec: 'ms', mtime: true };
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
function computeGrowthMassOf(events, packageId) {
  return (events || [])
    .filter((event) => event.packageId === packageId)
    .reduce((sum, event) => sum + computeGrowthMass(event), 0);
}

// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
function computeGrowthMass(event) {
  if (Number.isFinite(event.addedMass)) return Math.max(0, event.addedMass);
  const contracts = Math.max(0, Number(event.addedContracts) || 0);
  if (contracts > 0) return contracts;
  return (event.addedTicketKeys || []).length;
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

/**
 * Explain and grill have no command-written clock unless their tool recorded one,
 * so their only signal can be a seed-file or DesignTree mtime. A checkout rewrites
 * that mtime, so an artifact-only event yields to the earliest downstream stage
 * that does have command evidence. This runs before the upstream repair: otherwise
 * a late event drags grill, smooth and every later upstream stage with it, and a
 * drill that already completed is overtaken by stages it produced.
 */
// [::TICKET::] PX-375 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-375 --for-spec --no-implementation-order`.
function clampUntrustedStageTimes(events, initialT, warnings) {
  const boundByPackage = new Map();
  for (const event of events) {
    if (event.kind !== 'stage' || !event.packageId) continue;
    if (!ARTIFACT_CLAMP_BOUND_STAGES.includes(event.stage)) continue;
    if (!TRUSTED_TIME_SOURCES.has(event.timeSource)) continue;
    const current = boundByPackage.get(event.packageId);
    if (current === undefined || event.t < current) boundByPackage.set(event.packageId, event.t);
  }
  const warned = new Set();
  for (const event of events) {
    if (event.kind !== 'stage' || !ARTIFACT_CLAMPED_STAGES.includes(event.stage) || !event.packageId) continue;
    if (TRUSTED_TIME_SOURCES.has(event.timeSource)) continue;
    const bound = boundByPackage.get(event.packageId);
    if (bound === undefined || event.t <= bound) continue;
    const floor = Number.isFinite(initialT) ? initialT : 0;
    const clamped = Math.max(floor, bound);
    const warningKey = `${event.stage}:${event.packageId}`;
    if (!warned.has(warningKey)) {
      warned.add(warningKey);
      warnings.push(
        `[order] ${event.stage} ${event.packageId}: artifact time ${new Date(event.t).toISOString()} clamped to ${new Date(clamped).toISOString()}`,
      );
    }
    event.t = clamped;
  }
}

// [::TICKET::] PX-350, PX-375 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-350|PX-375) --for-spec --no-implementation-order`.
function repairUpstreamOrder(events, packageIds) {
  const endTime = new Map(packageIds.map((id) => [id, new Array(STAGE_ORDER.length).fill(0)]));
  // Globalize grill and smooth before the per-stage sweep. The sweep clamps each
  // stage to the previous stage of the same package, so it must see the final grill
  // time; otherwise a package whose grill lands late keeps an earlier graphify and
  // the display order regresses to graphify, grill.
  orderGrillAfterExplain(events);
  placeSmoothAfterExplainAndGrill(events);
  for (const stageIndex of ORDERED_STAGE_INDEXES) {
    const stageEvents = events
      .filter((event) => event.kind === 'stage' && STAGE_INDEX[event.stage] === stageIndex && event.packageId)
      .sort((left, right) => left.t - right.t);
    for (const event of stageEvents) {
      const times = endTime.get(event.packageId);
      if (!times) continue;
      let previous = 0;
      for (let candidate = stageIndex - 1; candidate >= 1; candidate -= 1) {
        if (candidate === SMOOTH_STAGE) continue;
        if (times[candidate] > 0) {
          previous = times[candidate];
          break;
        }
      }
      if (event.t < previous) event.t = previous;
      times[stageIndex] = Math.max(times[stageIndex], event.t);
    }
  }
}

/**
 * The ladder is displayed globally, so every package must finish explain before
 * grill begins. Per-package ordering alone lets one package's grill run while
 * another package is still explaining.
 */
function orderGrillAfterExplain(events) {
  const explainEnd = events.reduce((latest, event) => (
    event.kind === 'stage' && event.stage === 'explain' ? Math.max(latest, event.t) : latest
  ), -Infinity);
  if (!Number.isFinite(explainEnd)) return;
  for (const event of events) {
    if (event.kind === 'stage' && event.stage === 'grill') event.t = Math.max(event.t, explainEnd);
  }
}

/**
 * Smooth is a workspace-level step that applies to every cell. Its artifact can be
 * measured after graphify or fall back to the initial time; either way the animation
 * must show it after explain and grill and before graphify.
 */
function placeSmoothAfterExplainAndGrill(events) {
  const predecessorEnd = events.reduce((latest, event) => {
    if (event.kind !== 'stage' || !PRE_SMOOTH_STAGES.includes(event.stage)) return latest;
    return Math.max(latest, event.t);
  }, -Infinity);
  if (!Number.isFinite(predecessorEnd)) return;
  for (const event of events) {
    if (event.kind === 'stage' && event.stage === 'smooth') event.t = predecessorEnd;
  }
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
// [::TICKET::] PX-374 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-374 --for-spec --no-implementation-order`.
function createPackageModels(model) {
  const packageModels = (model.packages || []).map((pkg, index) => ({
    id: pkg.id,
    name: pkg.name,
    path: pkg.path,
    index,
    total: Math.max(0, (pkg.obligations.total || 0) - computeGrowthMassOf(model.growthEvents, pkg.id)),
    reviewed: Math.max(0, pkg.obligations.reviewed || 0),
    progress: new Array(STAGE_ORDER.length).fill(0),
  }));
  return { packageModels, byId: new Map(packageModels.map((pkg) => [pkg.id, pkg])) };
}

/** Build the repaired, sorted event timeline and its frame weights. */
// [::TICKET::] PX-374 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-374 --for-spec --no-implementation-order`.
export function buildTimeline(model) {
  const timeline = [];
  for (const event of model.events || []) {
    if (!Number.isFinite(event.t) || !(event.inc > 0)) continue;
    if (STAGE_INDEX[event.stage] === undefined) continue;
    timeline.push({
      kind: 'stage',
      t: event.t,
      prec: event.prec || 'ms',
      stage: event.stage,
      packageId: event.packageId,
      inc: event.inc,
      seq: timeline.length,
      timeSource: event.timeSource,
      evidence: event.evidence,
    });
  }
  for (const event of model.growthEvents || []) {
    if (!Number.isFinite(event.t) || STAGE_INDEX[event.stage] === undefined) continue;
    timeline.push({
      kind: 'growth',
      t: event.t,
      prec: event.prec || 'ms',
      stage: event.stage,
      packageId: event.packageId,
      addedMass: computeGrowthMass(event),
      addedTicketKeys: event.addedTicketKeys || [],
      seq: timeline.length,
      evidence: event.evidence,
    });
  }
  for (const run of model.runs || []) {
    if (!Number.isFinite(run.t) || STAGE_INDEX[run.stage] === undefined) continue;
    timeline.push({
      kind: 'run',
      t: run.t,
      prec: run.prec || 'ms',
      stage: run.stage,
      packageId: run.packageId,
      status: run.status,
      runId: run.runId,
      seq: timeline.length,
      evidence: run.evidence,
    });
  }
  const warnings = [];
  clampUntrustedStageTimes(timeline, model.initialT, warnings);
  repairUpstreamOrder(timeline, (model.packages || []).map((pkg) => pkg.id));
  timeline.sort((left, right) =>
    left.t - right.t || STAGE_INDEX[left.stage] - STAGE_INDEX[right.stage] || left.seq - right.seq);
  const stageCounts = stageIndexesOf(timeline);
  const weights = timeline.map((event) => computeEventWeight(stageCounts[STAGE_INDEX[event.stage]]));
  const cumulative = [];
  let totalWeight = 0;
  for (const weight of weights) {
    totalWeight += weight;
    cumulative.push(totalWeight);
  }
  return { timeline, stageCounts, weights, cumulative, totalWeight, warnings };
}

/** Create one fresh frame state over a built timeline. */
// [::TICKET::] PX-374 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-374 --for-spec --no-implementation-order`.
export function createFrameState(model, timeline) {
  const { packageModels, byId } = createPackageModels(model);
  const timelineStart = timeline.timeline.length > 0 ? timeline.timeline[0].t : (model.initialT || 0);
  return {
    model,
    timeline: timeline.timeline,
    packageModels,
    byId,
    lastT: timelineStart,
    lastStageIndex: 0,
    lastStage: STAGE_ORDER[0],
    lastPrec: 'ms',
    cursor: 0,
    seenGrowthKeys: new Set(),
    active: [],
    rootPulse: false,
    growthThisFrame: [],
    runsThisFrame: [],
  };
}

/**
 * Advance the displayed stage frontier. Only a stage event carries real progress;
 * a run marker records that a command started or failed (a drill BLOCKED_PREREQUISITE
 * is precisely the case where the upstream stages are not done yet), and a growth
 * marker records ticket mass. Letting either move the frontier would show a stage
 * the workspace has not reached.
 */
// [::TICKET::] PX-375 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-375 --for-spec --no-implementation-order`.
function advanceStageFrontier(state, event) {
  if (event.kind !== 'stage') return;
  state.lastStageIndex = Math.max(state.lastStageIndex, STAGE_INDEX[event.stage]);
  state.lastStage = STAGE_ORDER[state.lastStageIndex];
}

/** Apply one timeline event to the frame state. */
// [::TICKET::] PX-374 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-374 --for-spec --no-implementation-order`.
export function applyEvent(state, event) {
  state.lastT = event.t;
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
    if (pkg) pkg.total = Math.max(0, pkg.total + event.addedMass);
    state.growthThisFrame.push({
      packageId: event.packageId,
      stage: event.stage,
      addedMass: event.addedMass,
      evidence: event.evidence,
    });
  }
}

/** Project the current state into one frame payload. */
// [::TICKET::] PX-374 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-374 --for-spec --no-implementation-order`.
export function frameFromState(state, model, index) {
  const packageFrames = state.packageModels.map((pkg) => {
    const reviewed = Math.min(pkg.reviewed, pkg.total);
    return {
      id: pkg.id,
      name: pkg.name,
      path: pkg.path,
      total: pkg.total,
      reviewed,
      fill: pkg.total > 0 ? reviewed / pkg.total : 0,
      density: computeDensity(pkg.progress),
    };
  });
  const globalStage = STAGE_ORDER.map((stage, stageIndex) => {
    const weight = packageFrames.reduce((sum, pkg) => sum + Math.max(1, pkg.total), 0);
    if (weight <= 0) return 0;
    const weighted = state.packageModels.reduce((sum, pkg) => sum + pkg.progress[stageIndex] * Math.max(1, pkg.total), 0);
    return weighted / weight;
  });
  // Models built before the availability flag keep the old "records mean available" rule.
  const hasUsageRecords = (model.usage || []).length > 0;
  const usageAvailable = model.usageAvailable === undefined ? hasUsageRecords : model.usageAvailable === true;
  const cumulativeUsage = usageAvailable
    ? usageAtDate(model.usage, displayDateKey(state.lastT, state.lastPrec))
    : null;
  const usageTitle = cumulativeUsage && model.titleName
    ? usageTitleSegments(model.titleName, cumulativeUsage)
    : null;
  const frame = {
    index,
    t: state.lastT,
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
    titleParts: usageTitle ? { left: usageTitle.left, right: usageTitle.right } : undefined,
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
 * The animation state at one timestamp. The marker and the animation must share
 * this state machine; a snapshot value computed by an older model cannot.
 */
// [::TICKET::] PX-374 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-374 --for-spec --no-implementation-order`.
export function progressAt(model, timestamp) {
  const timeline = buildTimeline(model);
  const state = createFrameState(model, timeline);
  for (const event of timeline.timeline) {
    if (event.t > timestamp) break;
    applyEvent(state, event);
  }
  return frameFromState(state, model, 0).overallProgress;
}

/**
 * Build frames with the sample's stage-weighted clock. Raw event count is a poor clock:
 * a stage with thousands of grill questions would otherwise consume the whole animation.
 */
// [::TICKET::] PX-370 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-370 --for-spec --no-implementation-order`.
// [::TICKET::] PX-374 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-374 --for-spec --no-implementation-order`.
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
  const frames = [];
  for (let index = 0; index < frameCount; index += 1) {
    const rawProgress = span <= 0 ? (index === frameCount - 1 ? 1 : 0) : (index - holdStart) / span;
    const progress = Math.max(0, Math.min(1, rawProgress));
    const targetWeight = progress >= 1 ? timeline.totalWeight : progress * timeline.totalWeight;
    state.active = [];
    state.rootPulse = false;
    state.growthThisFrame = [];
    state.runsThisFrame = [];
    while (state.cursor < timeline.timeline.length && timeline.cumulative[state.cursor] <= targetWeight) {
      applyEvent(state, timeline.timeline[state.cursor]);
      state.cursor += 1;
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

/** Derive one package's obligations, stage fractions and events. */
export function derivePackageState(pkg, artifacts, workspaceArtifacts, registry, warnings) {
  const computed = computePackageObligations(pkg, artifacts, registry);
  for (const message of computed.warnings) warnings.push(message);
  const stages = stageProgressOf(artifacts, workspaceArtifacts, pkg.id, warnings);
  const events = stageEventsOf(pkg, artifacts, workspaceArtifacts, warnings);
  for (const stage of STAGE_ORDER) {
    if (stages[stage] <= 0) continue;
    if (!isStageCoveredFor(events, stage, pkg.id)) {
      events.push({ t: workspaceArtifacts.initialT || 0, prec: 'ms', stage, packageId: pkg.id, inc: stages[stage], evidence: 'artifact-presence' });
    }
  }
  return {
    packageModel: {
      id: pkg.id,
      name: pkg.name,
      path: pkg.path,
      obligations: computed.obligations,
      tickets: computed.tickets,
      stages,
    },
    events,
    artifacts,
  };
}
