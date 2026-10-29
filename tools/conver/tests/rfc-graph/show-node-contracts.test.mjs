// PX-336 Red: the show-node-contracts CLI.
// @verifies C001
// @verifies C005

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const CLI = join(process.cwd(), '.claude/scripts/rfc-graph/show-node-contracts.mjs');

/** The minimal graph the CLI cases share. */
const GRAPH = {
  nodes: [
    { id: 'N0052', title: '§3.6.4 RootLedgerEntry', kind: 'data_model', summary: 'single-writer append-only chain', language: 'rust', slug: 'root_ledger', headingRefs: [], unitIds: ['op-CreateRootEntry'] },
    { id: 'N0083', title: '§3.10.6 boundary-023', kind: 'api_contract', summary: 'CivicEpochCommitment', language: 'rust', slug: 'boundary_023', headingRefs: [], unitIds: ['ctr-boundary-023'] },
  ],
  edges: [{
    from: 'N0083',
    to: 'N0052',
    type: 'depends_on',
    attributes: { note: 'registry:boundary-023;digest:abc' },
    contracts: [
      { id: 'C001', precondition: 'structural', postcondition: 'structural', invariant: 'structural' },
      { id: 'C930', precondition: 'The forum records the epoch against a checkpoint.', postcondition: 'It never finalizes it.', invariant: 'The root signature is never the sole basis.' },
    ],
  }],
};

const VIEW = {
  ownedOperationUnits: [{
    unitId: 'op-CreateRootEntry',
    operationId: 'CreateRootEntry',
    resultObjectClasses: ['RootEntry'],
    ownerPackageIds: ['pkg-0003'],
    roleCandidate: 'implementer',
    obligation: {
      purpose: 'the create root entry procedure',
      requiredAuthority: 'soul_authority_and_lease',
      requiresSessionBinding: true,
      requiresRemoteTimeHandshake: true,
      requiredPreStateCheckpoint: true,
      idempotencyScope: 'CreateRootEntry identity tuple',
      initialStatus: 'submitted',
      finalityPredicate: 'finalized when the single state transition completes',
      cancellationRule: 'cancellable before the first external action starts',
      reversalOrRecoveryRule: 'reversal and recovery follow the OperationStatus map',
      boundaryEffects: [],
      resultObjectClasses: ['RootEntry'],
    },
  }],
  ownedSequenceUnits: [],
  crossBoundarySequenceUnits: [],
  obligationUnits: [
    { unitId: 'ctr-boundary-023', relation: 'carries', subject: 'boundary-023', direction: 'provides', counterpart: 'pkg-0010' },
  ],
};

const STEP_CONTRACTS = {
  steps: [{
    stepId: 'S-application-and-payment__2',
    sequenceId: 'S-application-and-payment',
    operationId: 'CreateRootEntry',
    nodeIds: ['N0052'],
    contractProse: 'proofがissued_at時点で完全オフライン検証に通ること',
    contract: {
      pre: [{ factId: 'authority:x', text: 'authority soul_authority_and_lease' }],
      post: [{ factId: 'object:RootEntry', text: 'RootEntry' }],
      invariants: [{ factId: 'idempotency', text: 'CreateRootEntry identity tuple' }],
      consumes: [],
      produces: [],
      errors: [],
      crosses: [],
    },
    digest: 'digest-step',
  }],
};

/** The registry row the boundary cases resolve. */
const REGISTRY = {
  contract_registry: [{
    boundary_id: 'boundary-023',
    consumer_package: 'pkg-0010',
    provider_package: 'pkg-0003',
    clauses: {
      input: 'CivicEpochBlock and the finalized checkpoint reference',
      errors: ['CivicFinalityConflict when two descriptors finalize'],
      tests: ['unit: a conflicting descriptor fails'],
    },
  }],
};

/** Create a package directory with the three readable artifacts. */
// [::TICKET::] PX-337 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-337 --for-spec --no-implementation-order`.
function makePackage({ omitView = false, omitSteps = false, registry = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'px337-cli-'));
  writeFileSync(join(directory, 'RFC-GRAPH.json'), `${JSON.stringify(GRAPH, null, 2)}\n`);
  if (!omitView) writeFileSync(join(directory, 'SEQUENCES.json'), `${JSON.stringify(VIEW, null, 2)}\n`);
  if (!omitSteps) writeFileSync(join(directory, 'RFC-STEP-CONTRACTS.json'), `${JSON.stringify(STEP_CONTRACTS, null, 2)}\n`);
  if (registry) writeFileSync(join(directory, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), `${JSON.stringify(REGISTRY, null, 2)}\n`);
  return directory;
}

/** Run the CLI against a package directory. The package directory is the only input. */
// [::TICKET::] PX-337 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-337 --for-spec --no-implementation-order`.
function runCli(directory, extraArgs = []) {
  return spawnSync(process.execPath, [CLI, ...extraArgs], { cwd: directory, encoding: 'utf8' });
}

describe('show-node-contracts CLI', () => {
  it('prints the six-section brief for a node', () => {
    const directory = makePackage();
    try {
      const result = runCli(directory, ['--id=N0052']);
      assert.equal(result.status, 0);
      for (const label of ['YOU ARE HERE', 'IMPLEMENT', 'MUST HOLD', 'DO NOT', 'ORDER', 'PROOF']) {
        assert.match(result.stdout, new RegExp(label));
      }
      assert.match(result.stdout, /S-application-and-payment__2/);
      assert.equal(result.stderr, '');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('prints one brief per comma-separated node id', () => {
    const directory = makePackage();
    try {
      const result = runCli(directory, ['--id=N0052,N0083']);
      assert.equal(result.status, 0);
      assert.equal((result.stdout.match(/## YOU ARE HERE/g) || []).length, 2);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('reports a missing view by name and exits non-zero', () => {
    const directory = makePackage({ omitView: true });
    try {
      const result = runCli(directory, ['--id=N0052']);
      assert.notEqual(result.status, 0);
      assert.match(result.stdout, /UNAVAILABLE/);
      assert.match(result.stderr, /MISSING_VIEW/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('verify reports a missing view as a JSON finding', () => {
    const directory = makePackage({ omitView: true });
    try {
      const result = runCli(directory, ['--verify']);
      assert.equal(result.status, 1);
      const verdict = JSON.parse(result.stdout);
      assert.equal(verdict.ok, false);
      assert.equal(verdict.findings[0].code, 'MISSING_VIEW');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('verify passes a complete package', () => {
    const directory = makePackage();
    try {
      const result = runCli(directory, ['--verify']);
      assert.equal(result.status, 0);
      const verdict = JSON.parse(result.stdout);
      assert.equal(verdict.ok, true);
      assert.deepEqual(verdict.findings, []);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('verify fails with the orphan step named', () => {
    const directory = makePackage();
    try {
      writeFileSync(join(directory, 'RFC-STEP-CONTRACTS.json'), `${JSON.stringify({
        steps: [{ ...STEP_CONTRACTS.steps[0], stepId: 'S__1', operationId: 'MissingOp' }],
      }, null, 2)}\n`);
      const result = runCli(directory, ['--verify']);
      assert.equal(result.status, 1);
      const verdict = JSON.parse(result.stdout);
      assert.equal(verdict.ok, false);
      assert.ok(verdict.findings.some((finding) => finding.code === 'CONTRACT_CHAIN_OPEN'));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects an unknown node id', () => {
    const directory = makePackage();
    try {
      const result = runCli(directory, ['--id=N9999']);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /UNKNOWN_NODE/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('prints the resolved paths in PROOF', () => {
    const directory = makePackage();
    try {
      const resolvedDirectory = realpathSync(directory);
      const result = runCli(directory, ['--id=N0052']);
      assert.equal(result.status, 0);
      assert.match(result.stdout, new RegExp(`graph=${resolvedDirectory}/RFC-GRAPH\\.json`));
      assert.match(result.stdout, new RegExp(`view=${resolvedDirectory}/SEQUENCES\\.json`));
      assert.match(result.stdout, new RegExp(`stepContracts=${resolvedDirectory}/RFC-STEP-CONTRACTS\\.json`));
      assert.match(result.stdout, /registry=not found/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('derives the registry from the package directory', () => {
    const directory = makePackage({ registry: true });
    try {
      const result = runCli(directory, ['--id=N0083']);
      assert.equal(result.status, 0);
      assert.match(result.stdout, /CivicFinalityConflict when two descriptors finalize/);
      assert.match(result.stdout, /Registry row: consumer pkg-0010; provider pkg-0003/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('derives the registry from an ancestor directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'px337-cli-'));
    const packageDir = join(root, 'package');
    mkdirSync(packageDir);
    try {
      writeFileSync(join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), `${JSON.stringify(REGISTRY, null, 2)}\n`);
      writeFileSync(join(packageDir, 'RFC-GRAPH.json'), `${JSON.stringify(GRAPH, null, 2)}\n`);
      writeFileSync(join(packageDir, 'SEQUENCES.json'), `${JSON.stringify(VIEW, null, 2)}\n`);
      writeFileSync(join(packageDir, 'RFC-STEP-CONTRACTS.json'), `${JSON.stringify(STEP_CONTRACTS, null, 2)}\n`);

      const result = runCli(packageDir, ['--id=N0083']);
      assert.equal(result.status, 0);
      assert.match(result.stdout, /CivicFinalityConflict when two descriptors finalize/);
      assert.match(result.stdout, new RegExp(`registry=${realpathSync(root)}/WORKSPACIFY-ALLOCATE-MANIFEST\\.json`));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects any path flag that names a fixed artifact', () => {
    const directory = makePackage();
    try {
      const result = runCli(directory, ['--id=N0052', '--graph=RFC-GRAPH.json']);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /UNKNOWN_OPTION: --graph/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('verify never reads a registry', () => {
    const directory = makePackage();
    try {
      const result = runCli(directory, ['--verify', '--registry=missing-manifest.json']);
      assert.equal(result.status, 0);
      const verdict = JSON.parse(result.stdout);
      assert.equal(verdict.ok, true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
