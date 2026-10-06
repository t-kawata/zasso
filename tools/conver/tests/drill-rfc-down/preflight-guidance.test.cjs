// PX-238 @verifies C005
// [::TICKET::] PX-238 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-238 --for-spec --no-implementation-order`.
/**
 * What a refused preflight tells the caller to do next.
 *
 * The drill is the evolution door for a canon that already carries a graph, a
 * directory tree and tickets. A package that has only an RFC is not a broken
 * package — it is one that has not run the upstream loop yet, and telling its
 * author to re-run the drill sends them in a circle. The exit code and the set of
 * artifacts that decide success are contract; only the sentence changes, and these
 * assertions pin the sentence without loosening the gate.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SCRIPT = path.resolve(__dirname, '../../.claude/scripts/drill-rfc-down/preflight.cjs');
const { formatAbortMessage, ARTIFACT_LABELS } = require(SCRIPT);

let tmpRoot;

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'px238-preflight-'));
  fs.writeFileSync(path.join(tmpRoot, 'README.md'), '# README\n');
});

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

/** A workspace whose RFC, directory tree and tickets exist but whose graph does not. */
// [::TICKET::] PX-238 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-238 --for-spec --no-implementation-order`.
function writeWorkspaceWithoutGraph(name) {
  const dir = path.join(tmpRoot, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'RFC.md'), '# RFC\n');
  fs.writeFileSync(path.join(dir, 'RFC-Dirs-Tree.json'), '{}');
  fs.writeFileSync(path.join(dir, 'Tickets.json'), JSON.stringify({
    metadata: {
      resolvedPaths: {
        rfcPath: 'RFC.md',
        graphPath: 'RFC-GRAPH.json',
        dirsTreePath: 'RFC-Dirs-Tree.json',
      },
    },
    phases: [],
  }));
  return dir;
}

/** Run the preflight with the directory under test as its working directory. */
// [::TICKET::] PX-238 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-238 --for-spec --no-implementation-order`.
function runIn(dir, args) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: dir, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

describe('formatAbortMessage names the command that produces each artifact', () => {
  it('names /graphify-rfc for a missing GRAPH', () => {
    const message = formatAbortMessage({ graph: '/somewhere/RFC-GRAPH.json' });

    assert.match(message, /graphify-rfc/);
  });

  it('names /boundify-graph for a missing Dirs-Tree or Tickets', () => {
    const message = formatAbortMessage({ dirsTree: '/somewhere/RFC-Dirs-Tree.json' });

    assert.match(message, /boundify-graph/);
  });

  it('still lists the artifact it is about', () => {
    const message = formatAbortMessage({ graph: '/somewhere/RFC-GRAPH.json' });

    assert.match(message, /\/somewhere\/RFC-GRAPH\.json/);
    assert.equal(message.includes(ARTIFACT_LABELS.graph), true, 'the label survives');
  });
});

describe('the preflight a package with no graph receives', () => {
  it('refuses with exit 1 and names the upstream commands that produce the missing artifacts', () => {
    const dir = writeWorkspaceWithoutGraph('no-graph');

    const result = runIn(dir, []);

    assert.equal(result.status, 1, 'a missing GRAPH still fails');
    assert.match(result.stderr, /graphify-rfc/, 'the GRAPH producer is named');
    assert.match(result.stderr, /boundify-graph/, 'the derived-artifact producer is named');
  });

  it('keeps the required-artifact set unchanged: a complete workspace still passes', () => {
    const dir = path.join(tmpRoot, 'complete');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'RFC.md'), '# RFC\n');
    fs.writeFileSync(path.join(dir, 'RFC-GRAPH.json'), '{}');
    fs.writeFileSync(path.join(dir, 'RFC-Dirs-Tree.json'), '{}');
    fs.writeFileSync(path.join(dir, 'README.md'), '# README\n');
    fs.writeFileSync(path.join(dir, 'Tickets.json'), JSON.stringify({
      metadata: {
        resolvedPaths: {
          rfcPath: 'RFC.md',
          graphPath: 'RFC-GRAPH.json',
          dirsTreePath: 'RFC-Dirs-Tree.json',
        },
      },
      phases: [],
    }));

    const result = runIn(dir, []);

    assert.equal(result.status, 0, result.stderr);
  });

  it('keeps the exit-code contract: an unresolvable pipeline still fails with 1', () => {
    const dir = path.join(tmpRoot, 'empty');
    fs.mkdirSync(dir, { recursive: true });

    const result = runIn(dir, []);

    assert.equal(result.status, 1);
  });
});
