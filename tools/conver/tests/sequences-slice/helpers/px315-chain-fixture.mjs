/**
 * PX-315 test fixture: a package chain whose phases are explicit.
 *
 * The fixture computes every digest from the view and the phase records, so a test can
 * change one layer and observe the verifier's named finding rather than a fixture error.
 */
import { createRequire } from 'node:module';

import {
  kindOfUnit,
  mapDigest,
  viewDigest,
} from '../../../.claude/scripts/sequences-slice/lib/distribution-map.mjs';
import { digestValue } from '../../../.claude/scripts/sequences-slice/lib/digest.mjs';

const require = createRequire(import.meta.url);
const { digestTicketDistribution } = require('../../../.claude/scripts/tickets/add-tickets-for-phase.js');

// [::TICKET::] PX-315 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-315) --for-spec --no-implementation-order`.
function mapUnitsFor(view) {
  const fields = ['ownedOperationUnits', 'ownedSequenceUnits', 'crossBoundarySequenceUnits', 'obligationUnits'];
  const byUnit = new Map();
  for (const field of fields) {
    for (const unit of Array.isArray(view?.[field]) ? view[field] : []) {
      if (typeof unit?.unitId !== 'string' || byUnit.has(unit.unitId)) continue;
      byUnit.set(unit.unitId, unit.unitId);
    }
  }
  return [...byUnit.keys()].sort().map((unitId) => ({
    unitId,
    kind: kindOfUnit(unitId),
    owners: [view.packageId],
    sections: ['1'],
    ground: 'fixture',
  }));
}

/**
 * Build a consistent chain.
 *
 * @param {{ view: object, nodes: Array<object>, edges?: Array<object>, sequences: Array<object>,
 *   steps: Array<object>, phases: Array<{ id: number, tickets: Array<{ id: number, unitIds: string[], obligations?: object }> }> }} input
 */
export function buildChainFixture({ view, nodes, edges = [], sequences, steps, phases }) {
  const map = {
    schemaVersion: 1,
    packageId: view.packageId,
    sourceViewDigest: viewDigest(view),
    units: mapUnitsFor(view),
    residuals: [],
  };
  map.digest = mapDigest(map);

  const graph = { distributionDigest: map.digest, nodes, edges };

  const units = {};
  for (const node of nodes) {
    for (const unitId of node.unitIds ?? []) {
      const entry = units[unitId] ?? { nodeIds: [], paths: [] };
      entry.nodeIds.push(node.id);
      entry.paths.push(`src/${node.id}.rs`);
      units[unitId] = entry;
    }
  }
  const dirsTree = { distribution: { digest: map.digest, units } };

  const builtPhases = phases.map((phase) => ({
    id: phase.id,
    nodeIds: phase.nodeIds ?? [],
    tickets: phase.tickets.map((ticket) => {
      const ticketUnits = ticket.unitIds.map((unitId) => ({
        unitId,
        kind: kindOfUnit(unitId),
        obligation: ticket.obligations?.[unitId] ?? { mode: 'obligation' },
      }));
      const digest = digestTicketDistribution({
        sourceMapDigest: map.digest,
        sourceViewDigest: map.sourceViewDigest,
        units: ticketUnits,
      });
      return {
        id: ticket.id,
        phaseId: phase.id,
        nodeIds: [...(ticket.nodeIds ?? []), ...ticket.unitIds],
        distribution: {
          sourceMapDigest: map.digest,
          sourceViewDigest: map.sourceViewDigest,
          units: ticketUnits,
          digest,
        },
        contracts: ticket.contracts ?? [],
      };
    }),
  }));

  const ticketDigests = {};
  for (const phase of builtPhases) {
    for (const ticket of phase.tickets) {
      const key = phase.id === -1 ? `PX-${ticket.id}` : `P${phase.id}-${ticket.id}`;
      ticketDigests[key] = ticket.distribution.digest;
    }
  }
  const tickets = {
    distribution: {
      sourceMapDigest: map.digest,
      sourceViewDigest: map.sourceViewDigest,
      ticketDigests,
      digest: digestValue({ ticketDigests }),
    },
    phases: builtPhases,
  };

  const artifact = { sequences, steps };
  return { view, map, graph, dirsTree, tickets, artifact };
}
