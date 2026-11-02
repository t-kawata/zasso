// PX-343 @verifies C005
// phasify must fail closed: an invalid phase assignment is never written, with or
// without --dry-run. The fixture forces a hard depends_on edge against a directory
// direction, so validation is deterministically invalid.
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const PHASIFY = path.resolve(__dirname, '../../.claude/scripts/rfc-graph/phasify-graph-and-dirs-files-tree.js');

// [::TICKET::] PX-343 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-343) --for-spec --no-implementation-order`.
function invalidFixture({ withTickets }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'px343-phasify-'));
  const graphPath = path.join(directory, 'P-GRAPH.json');
  const dirsPath = path.join(directory, 'P-Dirs-Tree.json');
  const ticketsPath = path.join(directory, 'Tickets.json');
  fs.writeFileSync(graphPath, JSON.stringify({
    mainLanguage: 'rust',
    sourceFile: 'P.md',
    nodes: [
      { id: 'N0001', kind: 'api_contract', language: 'rust', slug: 'a', title: 'A', summary: 'A' },
      { id: 'N0002', kind: 'api_contract', language: 'rust', slug: 'b', title: 'B', summary: 'B' },
    ],
    edges: [{ from: 'N0001', to: 'N0002', type: 'depends_on' }],
  }));
  fs.writeFileSync(dirsPath, JSON.stringify({
    trees: {
      rust: {
        name: 'src',
        type: 'directory',
        children: [
          { name: 'a', type: 'directory', children: [], mappedNodeIds: ['N0001'] },
          { name: 'b', type: 'directory', children: [], mappedNodeIds: ['N0002'] },
        ],
      },
    },
    dependencyDirections: { rust: [{ from: 'src/a', to: 'src/b', rule: 'a before b' }] },
  }));
  if (withTickets) {
    fs.writeFileSync(ticketsPath, JSON.stringify({ title: 't', metadata: {}, phases: [] }, null, 2));
  }
  return { directory, graphPath, dirsPath, ticketsPath };
}

// [::TICKET::] PX-343 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-343) --for-spec --no-implementation-order`.
function run(fixture, extra = []) {
  return spawnSync(process.execPath, [PHASIFY, fixture.graphPath, fixture.dirsPath, ...extra], {
    encoding: 'utf8',
  });
}

describe('phasify fail-closed', () => {
  it('does not write Tickets.json when validation fails', () => {
    const fixture = invalidFixture({ withTickets: true });
    try {
      const before = fs.readFileSync(fixture.ticketsPath, 'utf8');
      const result = run(fixture);
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.equal(fs.readFileSync(fixture.ticketsPath, 'utf8'), before);
      assert.match(result.stdout, /FAIL/);
      assert.doesNotMatch(result.stdout, /Wrote \d+ phases/);
    } finally {
      fs.rmSync(fixture.directory, { recursive: true, force: true });
    }
  });

  it('exits non-zero on an invalid dry-run and writes nothing', () => {
    const fixture = invalidFixture({ withTickets: false });
    try {
      const result = run(fixture, ['--dry-run']);
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.equal(fs.existsSync(fixture.ticketsPath), false);
      assert.doesNotMatch(result.stdout, /Wrote \d+ phases/);
    } finally {
      fs.rmSync(fixture.directory, { recursive: true, force: true });
    }
  });
});
