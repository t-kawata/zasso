// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
// PX-350 @verifies C001 @verifies C002 @verifies C003 @verifies C004 @verifies C005 @verifies C006 @verifies C007 @verifies C008
import { STAGE_ORDER } from '../../.claude/scripts/conver/progress-gif/loop.js';

export const INITIAL_TIME = Date.parse('2026-11-01T00:00:00Z');

/** Build one package model with contract obligations, optionally reviewed. */
export function packageModel({ id, name = id, path = id, total = 10, covered = 0, reviewed = 0 }) {
  return {
    id,
    name,
    path,
    obligations: { graph: total, boundary: 0, ticketOnly: 0, total, covered, reviewed, ratio: total > 0 ? reviewed / total : 0 },
    tickets: { total: 0, reviewed: 0, remanded: 0 },
    stages: Object.fromEntries(STAGE_ORDER.map((stage) => [stage, 0])),
  };
}

/** Build a model with no events so tests control every input. */
export function makeModel(overrides = {}) {
  const packages = overrides.packages || [];
  return {
    schema: 'conver-progress-model-v1',
    workspaceRoot: '/tmp/workspace',
    generatedAt: '2026-11-01T00:00:00.000Z',
    initialT: INITIAL_TIME,
    packages,
    events: [],
    growthEvents: [],
    totals: {
      packages: packages.length,
      splitPackages: packages.filter((pkg) => (pkg.tickets ? pkg.tickets.total > 0 : false)).length,
      obligations: packages.reduce((sum, pkg) => sum + (pkg.obligations ? pkg.obligations.total : 0), 0),
      covered: packages.reduce((sum, pkg) => sum + (pkg.obligations ? pkg.obligations.covered : 0), 0),
      reviewed: packages.reduce((sum, pkg) => sum + (pkg.obligations ? pkg.obligations.reviewed : 0), 0),
    },
    warnings: [],
    ...overrides,
  };
}

export function withPackageCount(count, options = {}) {
  return makeModel({
    packages: Array.from({ length: count }, (_, index) => packageModel({
      id: `pkg-${index + 1}`,
      name: `package-${index + 1}`,
      total: options.total === undefined ? 10 + index : options.total,
      reviewed: options.reviewed || 0,
    })),
  });
}

export function stageEvent(stage, t, packageId, inc = 1) {
  return { stage, t, prec: 'ms', packageId, inc, evidence: 'test' };
}

/** One event per stage for every package, in the fixed stage order. */
export function eventsForEveryStage(packages, startTime = INITIAL_TIME) {
  const events = [];
  let tick = startTime;
  for (const pkg of packages) {
    for (const stage of STAGE_ORDER) {
      events.push(stageEvent(stage, tick, pkg.id, 1));
      tick += 1000;
    }
  }
  return events;
}
