'use strict';

/**
 * PX-406 — a synthetic workspace for omission-detector tests and calibration.
 *
 * The fixture is clean: every contract, acceptance criterion, unit, file and
 * formula is named by a test entry. A calibration seed copies the fixture and
 * introduces exactly one defect.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function ticketsDocument() {
  return {
    title: 'omission fixture',
    round: 1,
    metadata: {},
    phases: [
      {
        id: 0,
        name: 'P0',
        tickets: [
          {
            id: 1,
            phaseId: 0,
            status: 'todo',
            title: 'save path',
            contracts: [
              { id: 'C001', precondition: 'value is present', postcondition: 'value is saved', invariant: 'value is unchanged' },
            ],
            acceptanceCriteria: ['the result is saved'],
            testUnit: ['UT: C001 saves the result', 'UT: the result is saved'],
            testIntegration: [],
            nodeIds: ['u-1'],
            default_files: ['src/a.js'],
            distribution: { units: [{ unitId: 'u-1', obligation: { mode: 'implement' } }] },
            formulaObligations: [{ id: 'fx-000000000000' }],
            prerequisites: [],
          },
          {
            id: 2,
            phaseId: 0,
            status: 'todo',
            title: 'error path',
            contracts: [
              { id: 'C002', precondition: 'value is invalid', postcondition: 'an error is returned', invariant: 'value is unchanged' },
            ],
            acceptanceCriteria: ['the error is returned'],
            testUnit: ['UT: C002 returns the error', 'UT: the error is returned'],
            testIntegration: [],
            nodeIds: ['u-2'],
            default_files: ['src/b.js'],
            distribution: { units: [{ unitId: 'u-2', obligation: { mode: 'implement' } }] },
            formulaObligations: [],
            prerequisites: [],
          },
        ],
      },
    ],
  };
}

// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function createSyntheticFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'px406-fixture-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  writeJson(path.join(root, 'Tickets.json'), ticketsDocument());
  writeJson(path.join(root, 'RFC-GRAPH.json'), {
    nodes: [{ id: 'N0001', title: 'node' }],
    edges: [{ from: 'N0001', to: 'N0001', kind: 'depends' }],
  });
  writeJson(path.join(root, 'RFC-Dirs-Tree.json'), {
    directories: [{ path: 'src' }],
    files: [{ path: 'src/a.js' }],
  });
  writeJson(path.join(root, 'SEQUENCES.json'), {
    sequences: [{ id: 'S1', steps: [{ id: 'S1-1', operation: 'op-1' }] }],
    boundaries: [{ id: 'b1' }],
  });
  writeJson(path.join(root, 'RFC-FORMULAS.json'), {
    version: 1,
    formulas: [{ id: 'fx-000000000000' }],
  });
  fs.writeFileSync(path.join(root, 'src/a.js'), 'function save(value) {\n  return value;\n}\n');
  fs.writeFileSync(path.join(root, 'src/b.js'), 'function fail(value) {\n  return value;\n}\n');
  return root;
}

// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function removeSyntheticFixture(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

module.exports = {
  createSyntheticFixture,
  removeSyntheticFixture,
  ticketsDocument,
};
