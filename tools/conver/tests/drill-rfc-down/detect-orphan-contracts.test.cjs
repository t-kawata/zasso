/**
 * detect-orphan-contracts.test.cjs — Tests for the orphaned edge-contract detector
 * and its Step 5 verify gate (PX-172).
 *
 * Covers contracts C001/C002/C003/C004:
 *   - C001 orphan-detection        (every edge contract not in a connecting ticket is reported)
 *   - C002 read-only               (the detector never writes any artifact)
 *   - C003 connecting-ticket-surfacing (orphan reports list touching tickets + statuses)
 *   - C004 verify-gate             (Step 5 FAILs on orphans, PASSes when none)
 *
 * The detector is deterministic and read-only; assignment stays AI-driven.
 *
 * @verifies C001 (orphan edge-contract detection)
 * @verifies C002 (read-only invariant)
 * @verifies C003 (connecting-ticket surfacing)
 * @verifies C004 (Step 5 verify gate FAIL/PASS)
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

async function loadDetector() {
  return import('../../.claude/scripts/drill-rfc-down/detect-orphan-contracts.js');
}

const { verifyConsistencies } = require('../../.claude/scripts/drill-rfc-down/verify-consistencies.js');

/** A minimal graph with one contract-bearing edge. */
function buildGraph(edgeContracts = [{ id: 'C001', precondition: 'p', postcondition: 'q', invariant: 'r' }]) {
  return {
    sourceFile: 'RFC.md',
    mainLanguage: 'rust',
    nodes: [
      { id: 'N0002', title: 'Auth', kind: 'api_contract', headingRefs: [] },
      { id: 'N0003', title: 'Session', kind: 'architecture', headingRefs: [] },
    ],
    edges: [{ from: 'N0002', to: 'N0003', type: 'part_of', contracts: edgeContracts }],
  };
}

/** A minimal Tickets.json structure. */
function buildTickets({ t1Contracts = [], t2Contracts = [] } = {}) {
  return {
    title: 'T',
    round: 1,
    metadata: { source: 'RFC.md' },
    phases: [
      { id: 0, name: 'P0', tickets: [
        { id: 1, phaseId: 0, status: 'reviewed', title: 'Auth ticket', nodeIds: ['N0002'], contracts: t1Contracts, scope: [], testUnit: [], testIntegration: [], testExceptions: [], changes: [] },
        { id: 2, phaseId: 0, status: 'todo', title: 'Session ticket', nodeIds: ['N0003'], contracts: t2Contracts, scope: [], testUnit: [], testIntegration: [], testExceptions: [], changes: [] },
      ] },
    ],
  };
}

describe('detect-orphan-contracts.js (orphaned edge-contract detection)', () => {
  it('C001: reports an edge contract absent from every connecting ticket as an orphan', async () => {
    const { detectOrphanContracts } = await loadDetector();
    const graph = buildGraph();
    const tickets = buildTickets(); // neither ticket carries C001

    const orphans = detectOrphanContracts(graph, tickets);

    assert.equal(orphans.length, 1, 'one orphan reported');
    assert.equal(orphans[0].contract.id, 'C001');
    const keys = orphans[0].connectingTickets.map((t) => t.key).sort();
    assert.deepEqual(keys, ['P0-1', 'P0-2'], 'both connecting tickets listed');
  });

  it('C001: does NOT report a contract present in a connecting ticket', async () => {
    const { detectOrphanContracts } = await loadDetector();
    const graph = buildGraph();
    const tickets = buildTickets({ t1Contracts: [{ id: 'C001', sourceEdge: 'N0002→N0003', precondition: 'p', postcondition: 'q', invariant: 'r' }] });

    const orphans = detectOrphanContracts(graph, tickets);

    assert.equal(orphans.length, 0, 'covered contract not reported');
  });

  it('C001: an edge contract on an edge with unticketed endpoints is reported as an orphan', async () => {
    const { detectOrphanContracts } = await loadDetector();
    const graph = buildGraph();
    const tickets = { title: 'T', round: 1, metadata: { source: 'RFC.md' }, phases: [] }; // no tickets

    const orphans = detectOrphanContracts(graph, tickets);

    assert.equal(orphans.length, 1, 'unticketed-endpoint contract reported');
    assert.deepEqual(orphans[0].connectingTickets, [], 'no connecting tickets');
  });

  it('C001: an edge with multiple contracts reports only the uncovered ones', async () => {
    const { detectOrphanContracts } = await loadDetector();
    const graph = buildGraph([
      { id: 'C001', precondition: 'p', postcondition: 'q', invariant: 'r' },
      { id: 'C002', precondition: 'p', postcondition: 'q', invariant: 'r' },
    ]);
    const tickets = buildTickets({ t1Contracts: [{ id: 'C001', sourceEdge: 'N0002→N0003', precondition: 'p', postcondition: 'q', invariant: 'r' }] });

    const orphans = detectOrphanContracts(graph, tickets);

    assert.equal(orphans.length, 1, 'only C002 reported');
    assert.equal(orphans[0].contract.id, 'C002');
  });

  it('C002: the detector is read-only — graph and tickets are byte-identical', async () => {
    const { detectOrphanContracts } = await loadDetector();
    const graph = buildGraph();
    const tickets = buildTickets();
    const graphBefore = JSON.stringify(graph);
    const ticketsBefore = JSON.stringify(tickets);

    detectOrphanContracts(graph, tickets);

    assert.equal(JSON.stringify(graph), graphBefore, 'graph unchanged');
    assert.equal(JSON.stringify(tickets), ticketsBefore, 'tickets unchanged');
  });

  it('C003: each orphan lists connecting tickets with their statuses; a non-touching ticket is never listed', async () => {
    const { detectOrphanContracts } = await loadDetector();
    const graph = buildGraph();
    const tickets = buildTickets();
    // Add a third ticket that owns neither endpoint.
    tickets.phases[0].tickets.push({ id: 3, phaseId: 0, status: 'done', title: 'Unrelated', nodeIds: ['N9999'], contracts: [], scope: [], testUnit: [], testIntegration: [], testExceptions: [], changes: [] });

    const orphans = detectOrphanContracts(graph, tickets);
    const keys = orphans[0].connectingTickets.map((t) => t.key);

    assert.ok(keys.includes('P0-1'), 'touching ticket P0-1 listed');
    assert.ok(keys.includes('P0-2'), 'touching ticket P0-2 listed');
    assert.ok(!keys.includes('P0-3'), 'non-touching ticket P0-3 not listed');
    assert.ok(orphans[0].connectingTickets.every((t) => typeof t.status === 'string'), 'status surfaced for every connecting ticket');
  });

  it('C004: verify-consistencies reports a high-severity orphan finding when orphans exist', () => {
    const graph = buildGraph();
    const tickets = buildTickets(); // orphans present
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-verify-'));
    const rfcPath = path.join(tmp, 'RFC.md');
    fs.writeFileSync(rfcPath, '# Doc\n\n## Auth\n', 'utf8');
    const dirsTree = { schemaVersion: 1, sourceGraph: path.join(tmp, 'RFC-GRAPH.json'), sourceFile: rfcPath, trees: {}, dependencyDirections: {} };
    const srcDir = path.join(tmp, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    const result = verifyConsistencies(
      fs.readFileSync(rfcPath, 'utf8').split('\n'),
      graph,
      dirsTree,
      srcDir,
      tickets,
    );

    assert.ok(result.findings.some((f) => f.severity === 'high' && /orphan|contract/i.test(f.message)), 'high-severity orphan finding reported');
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('C004: verify-consistencies reports no orphan finding when all contracts are covered', () => {
    const graph = buildGraph();
    const tickets = buildTickets({ t1Contracts: [{ id: 'C001', sourceEdge: 'N0002→N0003', precondition: 'p', postcondition: 'q', invariant: 'r' }] });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-verify-'));
    const rfcPath = path.join(tmp, 'RFC.md');
    fs.writeFileSync(rfcPath, '# Doc\n\n## Auth\n', 'utf8');
    const dirsTree = { schemaVersion: 1, sourceGraph: path.join(tmp, 'RFC-GRAPH.json'), sourceFile: rfcPath, trees: {}, dependencyDirections: {} };
    const srcDir = path.join(tmp, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    const result = verifyConsistencies(
      fs.readFileSync(rfcPath, 'utf8').split('\n'),
      graph,
      dirsTree,
      srcDir,
      tickets,
    );

    assert.ok(!result.findings.some((f) => /orphan/i.test(f.message)), 'no orphan finding when covered');
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
