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
const UPSTREAM_STAGES = [1, 2, 4, 5, 6];
const SMOOTH_STAGE = 3;

const EDuce_PHASES = 18;
const GRAPH_STEPS = ['0', '1', '2', '3', '4', '5'];
const BOUNDIFY_STEPS = ['0', '1', '2', '3'];
const SPLIT_STEPS = ['0-1', '0-2', '1', '2', '3', '4-1', '4-2', '5-1', '5-2', '5-3', '6'];
const CRYSTALIZE_STEPS = 4;

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
function clamp01(value) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
function doneSteps(status, keys) {
  if (!status || !status.steps) return 0;
  return keys.filter((key) => status.steps[key] === 'done').length / keys.length;
}

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
function factSectionCount(text) {
  if (!text) return 0;
  const match = /<!--\s*explain-seed:facts\s*([\s\S]*?)-->/.exec(text);
  if (!match) return 0;
  try {
    return Object.keys(JSON.parse(match[1]).sections || {}).length;
  } catch {
    return 0;
  }
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

/** Derive the 16 stage fractions for one package from the artifacts that exist. */
export function stageProgressOf(artifacts, workspaceArtifacts) {
  const stages = Object.fromEntries(STAGE_ORDER.map((stage) => [stage, 0]));
  const educe = workspaceArtifacts.educeStatus;
  if (educe && Array.isArray(educe.phases)) {
    stages.educe = educe.phases.filter((phase) => phase.status === 'done').length / EDuce_PHASES;
  }
  if (artifacts.info) stages.explain += 0.35;
  if (artifacts.explain) stages.explain += 0.35 + 0.3 * Math.min(1, factSectionCount(artifacts.explain) / 7);
  stages.explain = clamp01(stages.explain);
  const resolved = resolvedQuestions(artifacts.designTree);
  const totalNodes = countNodes(artifacts.designTree);
  if (totalNodes > 0) stages.grill += 0.9 * (resolved.length / totalNodes);
  if (artifacts.status && artifacts.status.state === 'DONE') stages.grill += 0.1;
  stages.grill = clamp01(stages.grill);
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
  }
  if (artifacts.graphPath) stages.graphify = Math.max(0.25, doneSteps(artifacts.graphStatus, GRAPH_STEPS));
  if (artifacts.dirsPath) stages.boundify = Math.max(0.25, doneSteps(artifacts.boundifyStatus, BOUNDIFY_STEPS));
  if (artifacts.tickets) {
    stages.split = artifacts.splitStatus && artifacts.splitStatus.steps
      && artifacts.splitStatus.steps['6'] === 'done'
      ? 1
      : Math.max(0.25, doneSteps(artifacts.splitStatus, SPLIT_STEPS));
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
  const crystalize = artifacts.crystalize;
  if (crystalize) {
    const steps = crystalize.steps ? Object.values(crystalize.steps).filter((value) => value === 'done').length / CRYSTALIZE_STEPS : 0;
    const grill = crystalize.grill || {};
    const nodes = (grill.toc && grill.toc.nodes) || [];
    const sections = grill.sections || [];
    const toc = nodes.length ? nodes.filter((node) => node.status === 'confirmed').length / nodes.length : 0;
    const section = sections.length ? sections.filter((item) => item.state === 'complete' || item.state === 'residue').length / sections.length : 0;
    stages.crystalize = clamp01(0.5 * steps + 0.3 * toc + 0.2 * section);
  }
  if (artifacts.drillStatus) {
    const match = /^1-(\d+)$/.exec(String(artifacts.drillStatus.currentStep || ''));
    stages.drill = artifacts.drillStatus.state === 'DONE' ? 1 : match ? Math.min(1, Number(match[1]) / 12) : 0;
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

/** Build stage events for one package. Root events use packageId null and apply to every cell. */
export function stageEventsOf(pkg, artifacts, workspaceArtifacts) {
  const events = [];
  const initialT = workspaceArtifacts.initialT || 0;
  const educe = workspaceArtifacts.educeStatus;
  if (educe && Array.isArray(educe.phases)) {
    const done = educe.phases.filter((phase) => phase.status === 'done').length / EDuce_PHASES;
    const start = parseTimestamp(educe.generationStartedAt);
    if (start) addEvent(events, { t: start.t, prec: start.prec, stage: 'educe', packageId: null, inc: 0.02, evidence: 'educe-sequences/status.json' });
    const fileTime = workspaceArtifacts.sequencesPath ? parseStampFromMtime(workspaceArtifacts.sequencesPath) : null;
    addEvent(events, { t: (fileTime || start) ? (fileTime || start).t : initialT, prec: (fileTime || start) ? (fileTime || start).prec : 'ms', stage: 'educe', packageId: null, inc: Math.max(0, done - 0.02), evidence: workspaceArtifacts.sequencesPath || 'educe-sequences/status.json' });
  }
  const smooth = workspaceArtifacts.smoothStatus;
  if (smooth) {
    const at = parseTimestamp(smooth.measuredAt) || parseStampFromMtime(workspaceArtifacts.smoothStatusPath);
    const certificate = workspaceArtifacts.smoothCertificate;
    const pass = smooth.verdict && smooth.verdict.exitCode === 0 && smooth.verdict.findings === 0
      && smooth.verdict.blocked === 0 && (smooth.verdict.readings || 0) === 0 && (smooth.verdict.withheld || 0) === 0;
    let fraction = 0;
    if (certificate && certificate.obligations && certificate.obligations.total > 0) {
      fraction = certificate.obligations.closed / certificate.obligations.total;
    } else if (pass) {
      fraction = 1;
    }
    addEvent(events, { t: at ? at.t : initialT, prec: at ? at.prec : 'ms', stage: 'smooth', packageId: null, inc: pass ? fraction : Math.min(fraction, 0.9), evidence: 'smooth-sequences/status.json' });
  }
  const infoTime = artifacts.info ? parseStampFromMtime(artifacts.info) : null;
  if (infoTime) addEvent(events, { t: infoTime.t, prec: infoTime.prec, stage: 'explain', packageId: pkg.id, inc: 0.35, evidence: artifacts.info });
  if (artifacts.explain) {
    const explainTime = parseStampFromMtime(artifacts.explain);
    const sections = factSectionCount(readText(artifacts.explain));
    addEvent(events, { t: (explainTime || infoTime || { t: initialT, prec: 'ms' }).t, prec: (explainTime || infoTime || { prec: 'ms' }).prec, stage: 'explain', packageId: pkg.id, inc: 0.35 + 0.3 * Math.min(1, sections / 7), evidence: artifacts.explain });
  }
  const designTime = artifacts.designTree ? parseStampFromMtime(artifacts.designTreePath || '') : null;
  const resolved = resolvedQuestions(artifacts.designTree);
  const totalNodes = countNodes(artifacts.designTree);
  for (const item of resolved) {
    addEvent(events, { t: (item.at || designTime || { t: initialT, prec: 'ms' }).t, prec: (item.at || designTime || { prec: 'ms' }).prec, stage: 'grill', packageId: pkg.id, inc: totalNodes > 0 ? 0.9 / totalNodes : 0, evidence: 'DesignTree.json' });
  }
  if (artifacts.status && artifacts.status.state === 'DONE') {
    const done = parseTimestamp(artifacts.status.completedAt) || parseTimestamp(artifacts.status.updatedAt) || designTime;
    addEvent(events, { t: done ? done.t : initialT, prec: done ? done.prec : 'ms', stage: 'grill', packageId: pkg.id, inc: 0.1, evidence: 'Status.json' });
  }
  if (artifacts.graphPath) {
    const at = runIdTime(artifacts.graphStatus) || parseStampFromMtime(artifacts.graphPath);
    addEvent(events, { t: at ? at.t : initialT, prec: at ? at.prec : 'ms', stage: 'graphify', packageId: pkg.id, inc: Math.max(0.25, doneSteps(artifacts.graphStatus, GRAPH_STEPS)), evidence: artifacts.graphPath });
  }
  if (artifacts.dirsPath) {
    const doc = artifacts.dirs;
    const at = parseTimestamp(doc && doc.generatedAt) || runIdTime(artifacts.boundifyStatus) || parseStampFromMtime(artifacts.dirsPath);
    addEvent(events, { t: at ? at.t : initialT, prec: at ? at.prec : 'ms', stage: 'boundify', packageId: pkg.id, inc: Math.max(0.25, doneSteps(artifacts.boundifyStatus, BOUNDIFY_STEPS)), evidence: artifacts.dirsPath });
  }
  if (artifacts.tickets) {
    const splitAt = runIdTime(artifacts.splitStatus)
      || parseTimestamp(artifacts.tickets.metadata && artifacts.tickets.metadata.generatedAt)
      || parseStampFromMtime(artifacts.ticketsPath);
    addEvent(events, { t: splitAt ? splitAt.t : initialT, prec: splitAt ? splitAt.prec : 'ms', stage: 'split', packageId: pkg.id, inc: artifacts.splitStatus && artifacts.splitStatus.steps && artifacts.splitStatus.steps['6'] === 'done'
        ? 1
        : Math.max(0.25, doneSteps(artifacts.splitStatus, SPLIT_STEPS)), evidence: artifacts.ticketsPath });
    const tickets = ticketList(artifacts);
    const count = tickets.length || 1;
    for (const ticket of tickets) {
      const created = parseTimestamp(ticket.created_at) || (artifacts.tickets.metadata && parseTimestamp(artifacts.tickets.metadata.generatedAt));
      const updated = parseTimestamp(ticket.updated_at) || created;
      const started = parseTimestamp(ticket.startedAt);
      const completed = parseTimestamp(ticket.completedAt);
      if (ticket.status && ticket.status !== 'todo') addEvent(events, { t: created ? created.t : initialT, prec: created ? created.prec : 'ms', stage: 'make', packageId: pkg.id, inc: 1 / count, evidence: ticketKeyOf(ticket) });
      if (['planned', 'claimed', 'started', 'done', 'reviewed'].includes(ticket.status)) addEvent(events, { t: updated ? updated.t : initialT, prec: updated ? updated.prec : 'ms', stage: 'plan', packageId: pkg.id, inc: 1 / count, evidence: ticketKeyOf(ticket) });
      if (['started', 'done', 'reviewed'].includes(ticket.status)) addEvent(events, { t: started ? started.t : initialT, prec: started ? started.prec : 'ms', stage: 'start', packageId: pkg.id, inc: 1 / count, evidence: ticketKeyOf(ticket) });
      if (ticket.status === 'reviewed' || isReviewedStatus(ticket.status)) addEvent(events, { t: completed ? completed.t : updated ? updated.t : initialT, prec: completed ? completed.prec : updated ? updated.prec : 'ms', stage: 'review', packageId: pkg.id, inc: 1 / count, evidence: ticketKeyOf(ticket) });
    }
  }
  const records = (artifacts.malfeasance && artifacts.malfeasance.records) || [];
  if (records.length > 0) {
    for (const record of records) {
      if (record.status !== 'resolved' && record.status !== 'false_positive') continue;
      const at = parseTimestamp(record.resolved_at) || parseTimestamp(record.detected_at);
      addEvent(events, { t: at ? at.t : initialT, prec: at ? at.prec : 'ms', stage: 'resolve', packageId: pkg.id, inc: 1 / (records.length + (Number(artifacts.unresolvedStubs) || 0)), evidence: `Malfeasance#${record.id}` });
    }
  }
  for (const manifest of artifacts.manifests || []) {
    addEvent(events, { t: manifest.t, prec: manifest.prec, stage: 'consolidate', packageId: pkg.id, inc: 0.5 / Math.max(1, artifacts.manifests.length), evidence: manifest.path });
  }
  for (const omission of artifacts.omissions || []) {
    addEvent(events, { t: omission.t, prec: omission.prec, stage: 'find', packageId: pkg.id, inc: 1 / Math.max(1, artifacts.omissions.length), evidence: omission.path });
  }
  if (artifacts.crystalize) {
    const at = parseStampFromMtime(artifacts.crystalizePath || '');
    addEvent(events, { t: at ? at.t : initialT, prec: at ? at.prec : 'ms', stage: 'crystalize', packageId: pkg.id, inc: stageProgressOf(artifacts, workspaceArtifacts).crystalize, evidence: 'CRYSTALIZE-Status.json' });
  }
  if (artifacts.drillStatus) {
    const at = parseTimestamp(artifacts.drillStatus.updatedAt) || parseStampFromMtime(artifacts.drillStatusPath || '');
    addEvent(events, { t: at ? at.t : initialT, prec: at ? at.prec : 'ms', stage: 'drill', packageId: pkg.id, inc: stageProgressOf(artifacts, workspaceArtifacts).drill, evidence: 'drills/Status.json' });
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
export function buildModel(input) {
  const { workspaceRoot, tree, allocate, packages, events, growthEvents, warnings, initialT } = input;
  const sortedEvents = [...events].sort((left, right) => left.t - right.t || STAGE_ORDER.indexOf(left.stage) - STAGE_ORDER.indexOf(right.stage));
  const sortedGrowth = [...(growthEvents || [])].sort((left, right) => left.t - right.t);
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
    totals,
    warnings: warnings || [],
  };
}

/** Diff ticket snapshots, omission files, consolidation manifests and drill rounds. */
export function reconstructTicketGrowth({ snapshots = [], omissions = [], manifests = [], drills = [], tickets = [] }) {
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

// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
function repairUpstreamOrder(events, packageIds) {
  const endTime = new Map(packageIds.map((id) => [id, new Array(STAGE_ORDER.length).fill(0)]));
  for (const stageIndex of UPSTREAM_STAGES) {
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

// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
function computeEventWeight(count) {
  return count > 0 ? (1 + Math.log(1 + count)) / count : 0;
}

// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
function computeDensity(progress) {
  let weighted = 0;
  for (let index = 0; index < STAGE_ORDER.length; index += 1) weighted += STAGE_WEIGHT[index] * progress[index];
  return weighted / STAGE_WEIGHT_SUM;
}

/**
 * Build frames with the sample's stage-weighted clock. Raw event count is a poor clock:
 * a stage with thousands of grill questions would otherwise consume the whole animation.
 */
export function buildFrames(model, options = {}) {
  const frameCount = Math.max(1, Number(options.frames) || 120);
  const holdStart = Math.min(HOLD_START_FRAMES, Math.floor(frameCount / 4));
  const holdEnd = Math.min(HOLD_END_FRAMES, Math.floor(frameCount / 4));
  const span = Math.max(1, frameCount - 1 - holdStart - holdEnd);
  const packageModels = (model.packages || []).map((pkg, index) => ({
    id: pkg.id,
    name: pkg.name,
    path: pkg.path,
    index,
    total: Math.max(0, (pkg.obligations.total || 0) - computeGrowthMassOf(model.growthEvents, pkg.id)),
    reviewed: Math.max(0, pkg.obligations.reviewed || 0),
    progress: new Array(STAGE_ORDER.length).fill(0),
  }));
  const byId = new Map(packageModels.map((pkg) => [pkg.id, pkg]));
  const timeline = [];
  for (const event of model.events || []) {
    if (!Number.isFinite(event.t) || !(event.inc > 0)) continue;
    if (STAGE_INDEX[event.stage] === undefined) continue;
    timeline.push({ kind: 'stage', t: event.t, prec: event.prec || 'ms', stage: event.stage, packageId: event.packageId, inc: event.inc, seq: timeline.length });
  }
  for (const event of model.growthEvents || []) {
    if (!Number.isFinite(event.t) || STAGE_INDEX[event.stage] === undefined) continue;
    timeline.push({ kind: 'growth', t: event.t, prec: event.prec || 'ms', stage: event.stage, packageId: event.packageId, addedMass: computeGrowthMass(event), seq: timeline.length, evidence: event.evidence });
  }
  repairUpstreamOrder(timeline, packageModels.map((pkg) => pkg.id));
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
  const timelineStart = timeline.length > 0 ? timeline[0].t : (model.initialT || 0);
  let lastT = timelineStart;
  let lastStage = STAGE_ORDER[0];
  let lastPrec = 'ms';
  let cursor = 0;
  const frames = [];
  for (let index = 0; index < frameCount; index += 1) {
    const rawProgress = span <= 0 ? (index === frameCount - 1 ? 1 : 0) : (index - holdStart) / span;
    const progress = Math.max(0, Math.min(1, rawProgress));
    const targetWeight = progress >= 1 ? totalWeight : progress * totalWeight;
    const applied = [];
    while (cursor < timeline.length && cumulative[cursor] <= targetWeight) {
      applied.push(timeline[cursor]);
      cursor += 1;
    }
    const growthThisFrame = [];
    const active = [];
    let rootPulse = false;
    for (const event of applied) {
      lastT = event.t;
      lastPrec = event.prec || 'ms';
      // Root events (educe, smooth) advance every cell, but they are background
      // prerequisites, not the command the project is currently executing.
      if (event.kind === 'growth' || (event.packageId !== null && event.packageId !== undefined)) {
        lastStage = event.stage;
      }
      if (event.kind === 'stage') {
        const targets = event.packageId === null || event.packageId === undefined
          ? packageModels
          : [byId.get(event.packageId)].filter(Boolean);
        const stageIndex = STAGE_INDEX[event.stage];
        for (const pkg of targets) {
          pkg.progress[stageIndex] = clamp01(pkg.progress[stageIndex] + event.inc);
          active.push(event.packageId === null || event.packageId === undefined ? -100 - stageIndex : pkg.index * STAGE_ORDER.length + stageIndex);
        }
        if (event.packageId === null || event.packageId === undefined) rootPulse = true;
      } else {
        const pkg = byId.get(event.packageId);
        if (pkg) pkg.total = Math.max(0, pkg.total + event.addedMass);
        growthThisFrame.push({ packageId: event.packageId, stage: event.stage, addedMass: event.addedMass, evidence: event.evidence });
      }
    }
    const packageFrames = packageModels.map((pkg) => {
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
      const weighted = packageModels.reduce((sum, pkg) => sum + pkg.progress[stageIndex] * Math.max(1, pkg.total), 0);
      return weighted / weight;
    });
    frames.push({
      index,
      t: lastT,
      prec: lastPrec,
      stage: lastStage,
      packages: packageFrames,
      pi: packageModels.map((pkg) => pkg.progress.slice()),
      globalStage,
      active,
      rootPulse,
      growth: growthThisFrame,
      density: packageFrames.length > 0
        ? packageFrames.reduce((sum, pkg) => sum + pkg.density, 0) / packageFrames.length
        : 0,
    });
  }
  return frames;
}

/** Derive one package's obligations, stage fractions and events. */
export function derivePackageState(pkg, artifacts, workspaceArtifacts, registry, warnings) {
  const computed = computePackageObligations(pkg, artifacts, registry);
  for (const message of computed.warnings) warnings.push(message);
  const stages = stageProgressOf(artifacts, workspaceArtifacts);
  const events = stageEventsOf(pkg, artifacts, workspaceArtifacts);
  for (const stage of STAGE_ORDER) {
    if (stages[stage] <= 0) continue;
    if (!events.some((event) => event.stage === stage && event.packageId === pkg.id)) {
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
