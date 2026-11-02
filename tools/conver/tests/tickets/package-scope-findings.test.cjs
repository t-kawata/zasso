// PX-343 @verifies C002 @verifies C003
// The package gate must read the authoritative RFC distribution map for every package.
// A view that lists a multi-owner operation as undecided is not the final word: the
// ledger role decides, and a finding about another package's operation must not block a
// package that neither owns nor consumes it.
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildOperationOwners,
  buildRolesByPackage,
} = require('../../.claude/scripts/tickets/add-tickets-for-phase.js');
const {
  deriveSequencePrecedence,
  packageRelevantFindings,
  ticketPrerequisites,
} = require('../../.claude/scripts/sequences-slice/lib/implementation-order.mjs');
const {
  mapDigest,
  renderDistributionMap,
  viewDigest,
} = require('../../.claude/scripts/sequences-slice/lib/distribution-map.mjs');

// [::TICKET::] PX-343 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-343) --for-spec --no-implementation-order`.
function view(packageId) {
  return {
    packageId,
    ownedOperationUnits: [{
      unitId: 'op-OpShared',
      operationId: 'OpShared',
      ownerPackageIds: ['alpha', 'beta'],
      roleCandidate: 'undecided',
    }],
    ownedSequenceUnits: [],
    crossBoundarySequenceUnits: [],
    obligationUnits: [],
  };
}

// [::TICKET::] PX-343 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-343) --for-spec --no-implementation-order`.
function distributionMap(packageId, role) {
  const model = view(packageId);
  const map = {
    schemaVersion: 1,
    packageId,
    sourceViewDigest: viewDigest(model),
    units: [{
      unitId: 'op-OpShared',
      kind: 'operation',
      role,
      owners: ['alpha', 'beta'],
      sections: ['1'],
      ground: 'fixture',
    }],
    residuals: [],
  };
  map.digest = mapDigest(map);
  return map;
}

// [::TICKET::] PX-343 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-343) --for-spec --no-implementation-order`.
function writePackage(root, packageId, role) {
  const directory = path.join(root, packageId);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'SEQUENCES.json'), JSON.stringify(view(packageId), null, 2));
  fs.writeFileSync(path.join(directory, 'RFC.md'), `# Package\n\n${renderDistributionMap(distributionMap(packageId, role))}\n`);
}

// [::TICKET::] PX-343 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-343) --for-spec --no-implementation-order`.
function artifact() {
  return {
    sequences: [{ id: 'S', outcome: 'realized' }],
    steps: [
      {
        id: 'S__s1',
        stepId: 'S__s1',
        sequence: 'S',
        operation: 'OpShared',
        order: 1,
        contract: { produces: ['object:X'] },
      },
      {
        id: 'S__s2',
        stepId: 'S__s2',
        sequence: 'S',
        operation: 'OpForeign',
        order: 2,
        contract: { consumes: ['object:X'] },
      },
    ],
  };
}

// [::TICKET::] PX-343 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-343) --for-spec --no-implementation-order`.
function alphaTicket() {
  return {
    phases: [{
      id: 0,
      tickets: [{
        id: 1,
        phaseId: 0,
        nodeIds: ['N1'],
        distribution: {
          units: [{
            unitId: 'op-OpShared',
            kind: 'operation',
            obligation: { mode: 'reference', providers: ['beta'] },
          }],
        },
      }],
    }],
  };
}

describe('ledger-authoritative ownership and package scope', () => {
  it('resolves a multi-owner operation from the ledger, not the view candidate', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'px343-scope-'));
    try {
      writePackage(root, 'alpha', 'consumer');
      writePackage(root, 'beta', 'implementer');
      const treeManifest = {
        workspace: { packages: [{ id: 'alpha', path: 'alpha' }, { id: 'beta', path: 'beta' }] },
      };
      fs.writeFileSync(path.join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), JSON.stringify(treeManifest));
      const ticketsByPackage = { alpha: alphaTicket(), beta: null };
      const rolesByPackage = buildRolesByPackage({ workspaceRoot: root, treeManifest, ticketsByPackage });
      const owners = buildOperationOwners({
        view: view('alpha'),
        workspaceRoot: root,
        tickets: alphaTicket().phases[0].tickets,
        rolesByPackage,
      });
      assert.equal(owners.get('OpShared').packageId, 'beta');
      assert.equal(owners.get('OpShared').ambiguous, undefined);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('filters a foreign finding but keeps a local finding', () => {
    const findings = [
      { code: 'MISSING_IMPLEMENTER', subject: 'OpForeign' },
      { code: 'MISSING_IMPLEMENTER', subject: 'OpLocal' },
    ];
    const local = {
      localOperationIds: new Set(['OpLocal']),
      localTicketKeys: new Set(['P0-1']),
      localPrerequisiteNames: new Set(['beta']),
    };
    assert.deepEqual(packageRelevantFindings(findings, local).map((entry) => entry.subject), ['OpLocal']);
  });

  it('ticketPrerequisites drops a foreign missing implementer when localOperationIds is supplied', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'px343-prereq-'));
    try {
      writePackage(root, 'alpha', 'consumer');
      writePackage(root, 'beta', 'implementer');
      const treeManifest = {
        workspace: { packages: [{ id: 'alpha', path: 'alpha' }, { id: 'beta', path: 'beta' }] },
      };
      fs.writeFileSync(path.join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), JSON.stringify(treeManifest));
      const ticketsByPackage = { alpha: alphaTicket(), beta: null };
      const rolesByPackage = buildRolesByPackage({ workspaceRoot: root, treeManifest, ticketsByPackage });
      const owners = buildOperationOwners({
        view: view('alpha'),
        workspaceRoot: root,
        tickets: alphaTicket().phases[0].tickets,
        rolesByPackage,
      });
      const scoped = ticketPrerequisites({
        tickets: alphaTicket().phases[0].tickets,
        graph: { edges: [] },
        artifact: artifact(),
        operationOwners: owners,
        packageId: 'alpha',
        localOperationIds: new Set(['OpShared']),
      });
      assert.equal(scoped.findings.length, 0);

      const unfiltered = deriveSequencePrecedence({ artifact: artifact(), operationOwners: owners });
      assert.ok(unfiltered.findings.some((entry) => entry.subject === 'OpForeign'));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
