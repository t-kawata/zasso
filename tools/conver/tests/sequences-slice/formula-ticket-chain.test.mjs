// PX-362 @verifies C001
// [::TICKET::] PX-362 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-362 --for-spec --no-implementation-order`.
/**
 * The split-stage chain: the ticket formula set and digests equal the RFC sidecar.
 *
 * A ticket that drops an obligation, carries two, or points its origin at RFC.md is a
 * named refusal before any later stage trusts the split.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  extractFormulas,
  uniqueFormulas,
} from '../../.claude/scripts/spec-formula/index.mjs';
import { sha256Hex } from '../../.claude/scripts/workspacify-tree/lib/hash.mjs';
import { verifyChain } from '../../.claude/scripts/sequences-slice/verify-chain.mjs';

const require = createRequire(import.meta.url);
const { computeFormulaDigest } = require('../../.claude/scripts/rfc-graph/lib/formula-ids.js');

const SPEC_TEXT = '# Specification\n\n\\[ M=2^b \\]\n\n\\[ N=K+1 \\]\n';

// [::TICKET::] PX-362, PX-365 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-362|PX-365) --for-spec --no-implementation-order`.
function buildFixture() {
  const root = mkdtempSync(join(tmpdir(), 'formula-chain-tickets-'));
  const formulas = uniqueFormulas(extractFormulas(SPEC_TEXT));
  const specDigest = sha256Hex(Buffer.from(SPEC_TEXT, 'utf8'));
  const sidecar = {
    specDigest,
    rfcDigest: 'a'.repeat(64),
    formulas: formulas.map((formula) => ({
      id: formula.id,
      digest: formula.digest,
      body: formula.body,
      specLocation: { path: 'spec.md', lineStart: formula.lineStart, lineEnd: formula.lineStart },
      implementation: { class: 'structural', symbols: ['src/symbol.rs#WIDTH'], design: 'constant', tests: ['tests/symbol.rs::width'] },
      theory: { symbols: [{ symbol: 'M', definition: 'width' }], normative: [formula.body.trim()] },
      tests: ['tests/symbol.rs::width'],
    })),
  };
  const graphPath = join(root, 'GRAPH.json');
  const graph = {
    sourceFile: 'RFC.md',
    mainLanguage: 'rust',
    distributionDigest: 'a'.repeat(64),
    formulaDigest: undefined,
    nodes: [{ id: 'N0001', title: 'Design', kind: 'data_model', summary: 's', headingRefs: [{ refId: 'REF001', heading: 2, texts: ['Design'] }], slug: 'design', formulaIds: formulas.map((formula) => formula.id) }],
    edges: [],
  };
  writeFileSync(graphPath, JSON.stringify(graph));
  const sidecarPath = join(root, 'RFC-FORMULAS.json');
  writeFileSync(sidecarPath, JSON.stringify(sidecar));
  graph.formulaDigest = computeFormulaDigest(sidecar);
  writeFileSync(graphPath, JSON.stringify(graph));

  const dirsTree = {
    trees: { rust: { name: 'src', type: 'directory', children: [{ name: 'symbol.rs', type: 'file', mappedNodeIds: [{ nodeId: 'N0001' }] }] } },
    distribution: {
      digest: 'a'.repeat(64),
      units: {},
      formulas: Object.fromEntries(sidecar.formulas.map((formula) => [formula.id, {
        nodeIds: ['N0001'], filePaths: ['src/symbol.rs'], symbols: ['src/symbol.rs#WIDTH'],
      }])),
    },
  };
  const dirsPath = join(root, 'Dirs-Tree.json');
  writeFileSync(dirsPath, JSON.stringify(dirsTree));
  const ticketsPath = join(root, 'Tickets.json');

  const obligation = (formula) => ({
    id: formula.id,
    digest: formula.digest,
    body: formula.body,
    origin: { path: 'spec.md', line: formula.specLocation.lineStart, segment: '', quote: formula.body.trim() },
    implementation: { path: 'src/symbol.rs', symbol: 'src/symbol.rs#WIDTH', kind: 'structural' },
    design: { class: 'structural', how: 'constant', types: [], errors: [], edgeCases: [] },
    theory: { symbols: formula.theory.symbols, norms: formula.theory.normative },
    tests: formula.tests,
  });
  const tickets = {
    phases: [{ id: -1, tickets: [{ id: 1, phaseId: -1, title: 'one', status: 'todo', contracts: [], formulaObligations: sidecar.formulas.map(obligation) }] }],
  };

  writeFileSync(ticketsPath, JSON.stringify(tickets));
  return { root, graphPath, dirsPath, ticketsPath, graph, dirsTree, tickets, sidecar, formulas };
}

// [::TICKET::] PX-362, PX-365 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-362|PX-365) --for-spec --no-implementation-order`.
function verify(fixture, extra = {}) {
  return verifyChain({
    view: { packageId: 'pkg-1' },
    map: { digest: 'a'.repeat(64), packages: [], units: [] },
    graph: fixture.graph,
    dirsTree: fixture.dirsTree,
    tickets: fixture.tickets,
    graphPath: fixture.graphPath,
    stage: 'split',
    ...extra,
  });
}

test('C001 postcondition: the ticket formula set equals the sidecar and the digest matches', () => {
  const fixture = buildFixture();
  const findings = verify(fixture).findings.filter((finding) => finding.code.startsWith('FORMULA_'));

  assert.deepEqual(findings, []);
});

test('C001 error: a dropped obligation is a formula set mismatch', () => {
  const fixture = buildFixture();
  fixture.tickets.phases[0].tickets[0].formulaObligations.pop();
  const findings = verify(fixture).findings;

  assert.equal(findings.some((finding) => finding.code === 'FORMULA_SET_MISMATCH'), true, JSON.stringify(findings));
});

test('C001 error: a formula carried by two tickets is a duplicate', () => {
  const fixture = buildFixture();
  fixture.tickets.phases[0].tickets.push({ ...fixture.tickets.phases[0].tickets[0], id: 2 });
  const findings = verify(fixture).findings;

  assert.equal(findings.some((finding) => finding.code === 'FORMULA_DUPLICATE_TICKET'), true, JSON.stringify(findings));
});

test('C001 error: a ticket digest that differs from the sidecar is refused', () => {
  const fixture = buildFixture();
  fixture.tickets.phases[0].tickets[0].formulaObligations[0].digest = '0'.repeat(64);
  const findings = verify(fixture).findings;

  assert.equal(findings.some((finding) => finding.code === 'FORMULA_DIGEST_MISMATCH'), true, JSON.stringify(findings));
});

test('C001 error: an origin that names RFC.md is refused', () => {
  const fixture = buildFixture();
  fixture.tickets.phases[0].tickets[0].formulaObligations[0].origin.path = 'RFC.md';
  const findings = verify(fixture).findings;

  assert.equal(findings.some((finding) => finding.code === 'FORMULA_ORIGIN_INVALID'), true, JSON.stringify(findings));
});

test('C001 error: a ticket theory that differs from the sidecar is refused', () => {
  const fixture = buildFixture();
  fixture.tickets.phases[0].tickets[0].formulaObligations[0].theory = { symbols: [], norms: [] };
  const findings = verify(fixture).findings;

  assert.equal(findings.some((finding) => finding.code === 'FORMULA_THEORY_MISMATCH'), true, JSON.stringify(findings));
});

test('C001 error: a ticket design that differs from the sidecar is refused', () => {
  const fixture = buildFixture();
  fixture.tickets.phases[0].tickets[0].formulaObligations[0].design.how = 'a different realization';
  const findings = verify(fixture).findings;

  assert.equal(findings.some((finding) => finding.code === 'FORMULA_DESIGN_MISMATCH'), true, JSON.stringify(findings));
});

test('C001 error: an origin line that differs from the sidecar is refused', () => {
  const fixture = buildFixture();
  fixture.tickets.phases[0].tickets[0].formulaObligations[0].origin.line = 99;
  const findings = verify(fixture).findings;

  assert.equal(findings.some((finding) => finding.code === 'FORMULA_ORIGIN_LINE_MISMATCH'), true, JSON.stringify(findings));
});

test('C001 error: an origin quote that differs from the specification line is refused', () => {
  const fixture = buildFixture();
  fixture.tickets.phases[0].tickets[0].formulaObligations[0].origin.quote = 'not the specification line';
  const findings = verify(fixture, { specText: SPEC_TEXT, specPath: 'spec.md' }).findings;

  assert.equal(findings.some((finding) => finding.code === 'FORMULA_ORIGIN_QUOTE_MISMATCH'), true, JSON.stringify(findings));
});

test('C001 normal: the sorted primary symbol matches the Dirs-Tree anchor when several symbols exist', () => {
  const fixture = buildFixture();
  const formula = fixture.formulas[0];
  fixture.sidecar.formulas[0].implementation.symbols = ['z.rs#Z', 'a.rs#A'];
  fixture.sidecar.formulas[0].implementation.location = 'a.rs#A';
  fixture.dirsTree.distribution.formulas[formula.id].symbols = ['a.rs#A', 'z.rs#Z'];
  fixture.tickets.phases[0].tickets[0].formulaObligations[0].implementation.symbol = 'a.rs#A';
  writeFileSync(join(fixture.root, 'RFC-FORMULAS.json'), JSON.stringify(fixture.sidecar));
  const findings = verify(fixture).findings;

  assert.equal(findings.some((finding) => finding.code === 'FORMULA_ANCHOR_MISMATCH'), false, JSON.stringify(findings));
});

test('C001 postcondition: the --formula-only CLI passes a consistent ticket chain', () => {
  const fixture = buildFixture();
  const verifyChainPath = fileURLToPath(new URL('../../.claude/scripts/sequences-slice/verify-chain.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [
    verifyChainPath,
    '--formula-only',
    `--graph=${fixture.graphPath}`,
    `--dirs-tree=${fixture.dirsPath}`,
    `--tickets=${fixture.ticketsPath}`,
    '--require-tickets',
  ], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout.trim().split('\n').pop());
  assert.equal(output.ok, true, JSON.stringify(output.findings));
});
