'use strict';

/**
 * workload-package — a synthetic package shaped like a large provider library.
 *
 * The package has eight phases, 73 graph nodes, 53 distinct implementation
 * files, 40 provider-side boundary units and 118 unit tests / 33 integration
 * tests. It is deliberately synthetic: no package id, path, phase name or
 * contract count comes from a real project.
 *
 * The proposed partition is [1, 1, 2, 1, 2, 1, 1, 1]: P2 and P4 split because
 * their merged workloads exceed the v2 budget, and every other phase fits one
 * ticket. The file and test counts are chosen so the v2 budget produces exactly
 * those ten tickets.
 */

const PHASE_SHAPES = Object.freeze([
  { nodeCount: 11, files: 5, modules: 4, testUnit: 16, testIntegration: 6, tickets: 1 },
  { nodeCount: 3, files: 3, modules: 2, testUnit: 11, testIntegration: 3, tickets: 1 },
  { nodeCount: 15, files: 14, modules: 6, testUnit: 25, testIntegration: 6, tickets: 2 },
  { nodeCount: 10, files: 8, modules: 4, testUnit: 13, testIntegration: 4, tickets: 1 },
  { nodeCount: 11, files: 10, modules: 5, testUnit: 13, testIntegration: 3, tickets: 2 },
  { nodeCount: 12, files: 4, modules: 4, testUnit: 13, testIntegration: 4, tickets: 1 },
  { nodeCount: 7, files: 5, modules: 4, testUnit: 16, testIntegration: 4, tickets: 1 },
  { nodeCount: 4, files: 4, modules: 2, testUnit: 11, testIntegration: 3, tickets: 1 },
]);

const BUDGET = Object.freeze({
  version: 2,
  components: [
    'operations', 'sequenceSteps', 'ownedContracts', 'files',
    'testUnit', 'testIntegration', 'modules',
  ],
  budget: {
    operations: 8,
    sequenceSteps: 8,
    ownedContracts: 4,
    files: 15,
    testUnit: 18,
    testIntegration: 6,
    modules: 4,
  },
  excluded: ['providerBoundaryContracts', 'kinds', 'graphNodes'],
  provenance: 'synthetic fixture for PX-347',
});

/** Split an ordered node list across the requested number of tickets. */
// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function splitNodes(nodeIds, ticketCount) {
  if (ticketCount === 1) return [nodeIds];
  const middle = Math.ceil(nodeIds.length / 2);
  return [nodeIds.slice(0, middle), nodeIds.slice(middle)];
}

/** Split a count across the requested number of tickets, keeping every ticket non-empty. */
// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function splitCount(count, ticketCount) {
  if (ticketCount === 1) return [count];
  const first = Math.ceil(count / 2);
  return [first, count - first];
}

/** Build the synthetic graph, view, Dirs-Tree and phases. */
// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function buildWorkloadPackage() {
  const nodes = [];
  const phases = [];
  const obligationUnits = [];
  const distributionUnits = {};
  let nodeIndex = 0;
  let boundaryIndex = 0;
  let fileIndex = 0;
  let unitTests = 0;
  let integrationTests = 0;

  PHASE_SHAPES.forEach((shape, phaseIndex) => {
    const phaseNodeIds = [];
    for (let offset = 0; offset < shape.nodeCount; offset += 1) {
      nodeIndex += 1;
      const id = `N${String(nodeIndex).padStart(4, '0')}`;
      phaseNodeIds.push(id);
      const unitIds = [];
      if (boundaryIndex < 40) {
        boundaryIndex += 1;
        const boundaryId = `ctr-boundary-${String(boundaryIndex).padStart(3, '0')}`;
        unitIds.push(boundaryId);
        obligationUnits.push({
          unitId: boundaryId,
          kind: 'contract',
          subject: `boundary-${String(boundaryIndex).padStart(3, '0')}`,
          direction: 'provides',
          counterpart: `pkg-consumer-${String(boundaryIndex).padStart(3, '0')}`,
          ownerPackageIds: ['pkg-synthetic'],
        });
        distributionUnits[boundaryId] = {
          nodeIds: [id],
          paths: [`src/api`, `src/api/boundary-${String(boundaryIndex).padStart(3, '0')}.js`],
          obligation: {
            direction: 'provides',
            counterpart: `pkg-consumer-${String(boundaryIndex).padStart(3, '0')}`,
          },
        };
      }
      nodes.push({
        id,
        title: `§${phaseIndex + 1} synthetic node ${nodeIndex}`,
        kind: ['requirement', 'api_contract', 'data_model', 'test_policy'][nodeIndex % 4],
        unitIds,
      });
    }

    const [firstNodes, secondNodes] = splitNodes(phaseNodeIds, shape.tickets);
    const [firstFiles, secondFiles] = splitCount(shape.files, shape.tickets);
    const [firstUnitTests, secondUnitTests] = splitCount(shape.testUnit, shape.tickets);
    const [firstIntegrationTests, secondIntegrationTests] = splitCount(shape.testIntegration, shape.tickets);
    const firstModules = Math.min(4, Math.ceil(shape.modules / shape.tickets));
    const secondModules = Math.max(1, shape.modules - firstModules);
    const firstFileList = Array.from({ length: firstFiles }, (_, offset) => {
      const file = `src/p${phaseIndex}m${offset % firstModules}/f${fileIndex + offset}.js`;
      return file;
    });
    fileIndex += firstFiles;
    const secondFileList = Array.from({ length: secondFiles ?? 0 }, (_, offset) => {
      const file = `src/p${phaseIndex}m${firstModules + (offset % secondModules)}/f${fileIndex + offset}.js`;
      return file;
    });
    fileIndex += secondFiles ?? 0;

    const firstTicket = {
      id: 1,
      phaseId: phaseIndex,
      title: `P${phaseIndex}-1`,
      status: 'todo',
      nodeIds: firstNodes,
      default_files: firstFileList,
      testUnit: Array.from({ length: firstUnitTests }, (_, offset) => `UT: p${phaseIndex} first ${offset}`),
      testIntegration: Array.from({ length: firstIntegrationTests }, (_, offset) => `IT: p${phaseIndex} first ${offset}`),
    };
    const tickets = [firstTicket];
    if (shape.tickets === 2) {
      tickets.push({
        id: 2,
        phaseId: phaseIndex,
        title: `P${phaseIndex}-2`,
        status: 'todo',
        nodeIds: secondNodes,
        default_files: secondFileList,
        testUnit: Array.from({ length: secondUnitTests }, (_, offset) => `UT: p${phaseIndex} second ${offset}`),
        testIntegration: Array.from({ length: secondIntegrationTests }, (_, offset) => `IT: p${phaseIndex} second ${offset}`),
        splitReason: 'cohesion',
      });
      tickets[0].splitReason = 'cohesion';
    }
    unitTests += shape.testUnit;
    integrationTests += shape.testIntegration;

    phases.push({
      id: phaseIndex,
      name: `P${phaseIndex}`,
      summary: `synthetic phase ${phaseIndex}`,
      nodeIds: phaseNodeIds,
      tickets,
    });
  });

  const context = {
    graph: { sourceFile: 'RFC.md', nodes, edges: [] },
    view: {
      packageId: 'pkg-synthetic',
      ownedOperationUnits: [],
      ownedSequenceUnits: [],
      crossBoundarySequenceUnits: [],
      obligationUnits,
    },
    dirsTree: { distribution: { units: distributionUnits } },
    nodeToFileMap: {},
  };

  return {
    phases,
    context,
    budget: BUDGET.budget,
    stats: {
      nodes: nodes.length,
      files: fileIndex,
      boundaryUnits: boundaryIndex,
      testUnit: unitTests,
      testIntegration: integrationTests,
      tickets: phases.reduce((total, phase) => total + phase.tickets.length, 0),
    },
  };
}

module.exports = { buildWorkloadPackage, BUDGET, PHASE_SHAPES };
