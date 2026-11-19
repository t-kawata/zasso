// [::TICKET::] PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-452 --for-spec --no-implementation-order`.
// [::TICKET::] PX-451 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-451 --for-spec --no-implementation-order`.
/**
 * derive-toc.test.cjs — non-interactive, usage-focused TOC candidates.
 * @verifies C001
 * @verifies C001/precondition
 * @verifies C001/postcondition
 * @verifies C001/invariant
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { deriveToc, parseArguments } = require('../../.claude/scripts/crystalize-readme/derive-toc.js');

describe('C001 — non-interactive TOC derivation', () => {
  it('includes the required semantic, language, and interface families', () => {
    const result = deriveToc({
      sourceText: '# RFC\n\n## Design\n\nBody\n',
      graph: { nodes: [], edges: [] },
      interfaces: ['cli'],
      languages: ['rust'],
    });
    const headings = result.nodes.map((node) => node.heading.toLowerCase());
    for (const family of ['purpose', 'quick start', 'capabilities', 'errors', 'constraints']) {
      assert.ok(headings.some((heading) => heading.includes(family)), family);
    }
    assert.ok(headings.some((heading) => heading.includes('language')));
    assert.ok(headings.some((heading) => heading.includes('interface')));
  });

  it('always places Examples last', () => {
    const result = deriveToc({
      sourceText: '# RFC\n',
      graph: { nodes: [], edges: [] },
      interfaces: [],
      languages: ['rust'],
    });
    assert.equal(result.nodes[result.nodes.length - 1].heading, 'Examples (implementation samples) spec and design');
  });

  it('preserves prior headings and adds missing families', () => {
    const result = deriveToc({
      sourceText: '# RFC\n',
      graph: { nodes: [], edges: [] },
      priorNodes: [{ id: 'H1', heading: 'Purpose', level: 1 }],
      interfaces: [],
      languages: ['rust'],
    });
    assert.ok(result.nodes.some((node) => node.heading === 'Purpose'));
    assert.ok(result.nodes.some((node) => node.heading === 'Quick start'));
  });

  it('assigns hierarchical ids with a parent for every child', () => {
    const result = deriveToc({
      sourceText: '# RFC\n',
      graph: { nodes: [], edges: [] },
      interfaces: [],
      languages: ['rust'],
    });
    const ids = new Set(result.nodes.map((node) => node.id));
    for (const node of result.nodes) {
      if (node.id.includes('-')) {
        const parent = node.id.slice(0, node.id.lastIndexOf('-'));
        assert.ok(ids.has(parent), `${node.id} parent ${parent}`);
      }
    }
  });
});

describe('C011 — file-based CLI input', () => {
  it('parses --source-file, --graph, --interfaces, and --languages without shell JSON', () => {
    const parsed = parseArguments([
      '--source-file=/tmp/RFC.md',
      '--graph=/tmp/RFC-GRAPH.json',
      '--interfaces=cli,rest',
      '--languages=rust,typescript',
      '--status=/tmp/CRYSTALIZE-Status.json',
    ]);
    assert.equal(parsed.sourceFilePath, '/tmp/RFC.md');
    assert.equal(parsed.graphPath, '/tmp/RFC-GRAPH.json');
    assert.deepEqual(parsed.interfaces, ['cli', 'rest']);
    assert.deepEqual(parsed.languages, ['rust', 'typescript']);
    assert.equal(parsed.statusPath, '/tmp/CRYSTALIZE-Status.json');
  });

  it('reads a multi-line RFC with quotes from the file path', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'px452-toc-'));
    try {
      const sourcePath = path.join(dir, 'RFC.md');
      fs.writeFileSync(sourcePath, '# RFC\n\n## Design\n\nCall "add_account" then\n`register()`.\n', 'utf8');
      const graphPath = path.join(dir, 'RFC-GRAPH.json');
      fs.writeFileSync(graphPath, JSON.stringify({ sourceFile: sourcePath, nodes: [], edges: [] }), 'utf8');
      const parsed = parseArguments([
        `--source-file=${sourcePath}`,
        `--graph=${graphPath}`,
        '--interfaces=',
        '--languages=rust',
      ]);
      assert.equal(parsed.sourceFilePath, sourcePath);
      assert.deepEqual(parsed.interfaces, []);
      assert.deepEqual(parsed.languages, ['rust']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps the stdin object path available', () => {
    const result = deriveToc({ sourceText: '# RFC\n', graph: { nodes: [] }, languages: ['rust'] });
    assert.ok(result.nodes.length > 0);
  });
});
