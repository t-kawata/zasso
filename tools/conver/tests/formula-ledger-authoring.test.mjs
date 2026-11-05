// PX-377 @verifies C004
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-377 --for-spec --no-implementation-order`.
/**
 * The authoring path fills the joins the pipeline already carries and refuses the row
 * when a join is not determined. These tests use a synthetic package; no gaia path or
 * package name is read.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { authorLedger } from '../.claude/scripts/spec-formula/author-ledger.mjs';

const CHECK = join(process.cwd(), '.claude/scripts/grill-me-for-rfc/check-formula-coverage.js');

const SPEC_TEXT = [
  '# Trust',
  '',
  'TrustEpoch(S, t) is the epoch of S at t.',
  '',
  '- TrustEpoch = the epoch counter',
  '- S = the subject',
  '',
  'The epoch MUST increase by one on each rotation.',
  '',
  '$$TrustEpoch(S,t) = TrustEpoch(S,t-1) + 1$$',
  '',
  'Verification: `UT-trust-epoch`.',
].join('\n');

const RFC_TEXT = [
  '# RFC',
  '',
  '## Trust',
  '',
  'TrustEpoch(S, t) is the epoch of S at t.',
  '',
  'The epoch MUST increase by one on each rotation.',
  '',
  'Verification: `UT-trust-epoch`.',
].join('\n');

/** A workspace with the seed, the spec, the RFC, the graph and the Dirs-Tree. */
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-377) --for-spec --no-implementation-order`.
function makeFixture(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'px377-author-'));
  const rfcDir = join(root, 'rfc');
  mkdirSync(rfcDir);
  const specText = overrides.specText ?? SPEC_TEXT;
  const rfcText = overrides.rfcText ?? RFC_TEXT;
  const graphNodes = overrides.graphNodes ?? [{
    id: 'N0001',
    title: 'Trust',
    headingRefs: [{ texts: ['Trust'] }],
    unitIds: [],
  }];
  const dirsTree = overrides.dirsTree ?? {
    trees: {
      src: {
        name: 'src',
        type: 'dir',
        children: [{ name: 'trust.rs', type: 'file', mappedNodeIds: [{ nodeId: 'N0001' }] }],
      },
    },
    distribution: { units: {} },
  };

  writeFileSync(join(root, 'spec.md'), specText, 'utf8');
  writeFileSync(join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), JSON.stringify({
    structure: { segments: [{ id: 's-1', line_start: 1, line_end: specText.split('\n').length }] },
  }), 'utf8');
  writeFileSync(join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), '{}', 'utf8');
  writeFileSync(join(rfcDir, 'RFC-SEED.md'), [
    '```json',
    JSON.stringify({
      package: { id: 'pkg-1' },
      source_spec: { path: 'spec.md', sha256: createHash('sha256').update(specText).digest('hex') },
      source_segments: ['s-1'],
    }),
    '```',
  ].join('\n'), 'utf8');
  writeFileSync(join(rfcDir, 'RFC.md'), rfcText, 'utf8');
  writeFileSync(join(rfcDir, 'RFC-GRAPH.json'), JSON.stringify({ nodes: graphNodes }), 'utf8');
  writeFileSync(join(rfcDir, 'RFC-Dirs-Tree.json'), JSON.stringify(dirsTree), 'utf8');

  return {
    root,
    rfcDir,
    graphPath: join(rfcDir, 'RFC-GRAPH.json'),
    dirsTreePath: join(rfcDir, 'RFC-Dirs-Tree.json'),
  };
}

/** Author the ledger for a fixture. */
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-377) --for-spec --no-implementation-order`.
function author(fixture, write = true) {
  return authorLedger({
    rfcDir: fixture.rfcDir,
    graphPath: fixture.graphPath,
    dirsTreePath: fixture.dirsTreePath,
    workspaceRoot: fixture.root,
    write,
  });
}

test('C004 normal: an owned formula reaches the ledger and the gate', () => {
  const fixture = makeFixture();
  const result = author(fixture);

  assert.equal(result.ok, true, JSON.stringify(result.findings));
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].theory.symbols.length, 2);
  assert.equal(result.rows[0].implementation.class, 'computational');
  assert.deepEqual(result.rows[0].implementation.symbols, ['src/trust.rs#trust']);
  assert.deepEqual(result.rows[0].tests, ['UT-trust-epoch']);
  assert.equal(existsSync(join(fixture.rfcDir, 'RFC-FORMULAS.json')), true);

  const gate = execFileSync(process.execPath, [CHECK, fixture.rfcDir], { encoding: 'utf8' });
  assert.match(gate, /"ok": true/);
});

test('C004 error: two matching graph nodes are ambiguous and nothing is written', () => {
  const fixture = makeFixture({
    graphNodes: [
      { id: 'N0001', title: 'Trust', headingRefs: [{ texts: ['Trust'] }], unitIds: [] },
      { id: 'N0002', title: 'Trust', headingRefs: [{ texts: ['Trust'] }], unitIds: [] },
    ],
  });
  const result = author(fixture);

  assert.equal(result.ok, false);
  assert.equal(result.findings[0].code, 'SECTION_AMBIGUOUS');
  assert.equal(existsSync(join(fixture.rfcDir, 'RFC-FORMULAS.json')), false);
});

test('C004 error: a section with no graph node is unresolved', () => {
  const fixture = makeFixture({
    graphNodes: [{ id: 'N0001', title: 'Other', headingRefs: [{ texts: ['Other'] }], unitIds: [] }],
  });
  const result = author(fixture);

  assert.equal(result.ok, false);
  assert.equal(result.findings[0].code, 'SECTION_UNRESOLVED');
});

test('C004 error: a missing symbol or normative line refuses the theory', () => {
  const fixture = makeFixture({
    specText: [
      '# Trust',
      '',
      'The epoch MUST increase by one on each rotation.',
      '',
      '$$TrustEpoch(S,t) = TrustEpoch(S,t-1) + 1$$',
    ].join('\n'),
  });
  const result = author(fixture);

  assert.equal(result.ok, false);
  assert.equal(result.findings[0].code, 'THEORY_UNRESOLVED');
});

test('C004 error: a node with no Dirs-Tree file refuses the implementation', () => {
  const fixture = makeFixture({
    dirsTree: { trees: { src: { name: 'src', type: 'dir', children: [] } }, distribution: { units: {} } },
  });
  const result = author(fixture);

  assert.equal(result.ok, false);
  assert.equal(result.findings[0].code, 'IMPLEMENTATION_UNRESOLVED');
});

test('C004 error: a section with no verification reference refuses the tests', () => {
  const fixture = makeFixture({
    rfcText: '# RFC\n\n## Trust\n\nTrustEpoch(S, t) is the epoch of S at t.\n',
  });
  const result = author(fixture);

  assert.equal(result.ok, false);
  assert.equal(result.findings[0].code, 'TESTS_UNRESOLVED');
});
