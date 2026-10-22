// PX-306 @verifies C002
// The graphify command must attach the anchors mechanically. This test runs the CLI over a
// synthetic RFC and graph, then asserts the written graph and the ledger gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const SCRIPT = join(process.cwd(), '.claude/scripts/rfc-graph/attach-unit-ids.js');

// [::TICKET::] PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-306 --for-spec --no-implementation-order`.
function fixture(rfcBody) {
  const root = mkdtempSync(join(tmpdir(), 'px306-attach-'));
  const graphPath = join(root, 'GRAPH.json');
  const rfcPath = join(root, 'RFC.md');
  writeFileSync(graphPath, JSON.stringify({
    sourceFile: 'RFC.md',
    mainLanguage: 'rust',
    nodes: [{ id: 'N0001', title: 'Issue', headingRefs: [{ heading: 2, texts: ['1. Issue'] }] }],
    edges: [],
  }, null, 2));
  writeFileSync(rfcPath, rfcBody);
  return { root, graphPath, rfcPath };
}

// [::TICKET::] PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-306 --for-spec --no-implementation-order`.
function ledger(body) {
  return [
    '## Distribution ledger',
    '',
    '| Unit | Kind | Owner | RFC location | Ground |',
    '|---|---|---|---|---|',
    ...body,
    '',
  ].join('\n');
}

test('C002 the CLI attaches an RFC anchor to its node', () => {
  const { root, graphPath, rfcPath } = fixture('## 1. Issue\n<!-- unit: op-IssueCertificate -->\nIssues.\n');
  try {
    const output = JSON.parse(execFileSync(process.execPath, [
      SCRIPT, `--graph=${graphPath}`, `--rfc=${rfcPath}`,
    ], { encoding: 'utf8' }));
    assert.equal(output.ok, true);
    const graph = JSON.parse(readFileSync(graphPath, 'utf8'));
    assert.deepEqual(graph.nodes[0].unitIds, ['op-IssueCertificate']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C002 a ledger unit with no anchor fails the CLI', () => {
  const body = `${ledger(['| op-Missing | operation | pkg | §1 | ground |'])}## 1. Issue\n<!-- unit: op-IssueCertificate -->\nIssues.\n`;
  const { root, graphPath, rfcPath } = fixture(body);
  try {
    assert.throws(
      () => execFileSync(process.execPath, [
        SCRIPT, `--graph=${graphPath}`, `--rfc=${rfcPath}`, `--ledger=${rfcPath}`,
      ], { encoding: 'utf8', stdio: 'pipe' }),
      (error) => String(error.stderr).includes('MISSING_UNIT_AT_LAYER'),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
