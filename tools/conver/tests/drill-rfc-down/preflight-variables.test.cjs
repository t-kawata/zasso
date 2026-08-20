/**
 * preflight-variables.test.cjs — Tests for the [VARIABLES] block (PX-157 Phase 3)
 *
 * Covers the C001 contract (preflight -> [VARIABLES]):
 *   - Precondition: Tickets.json metadata resolves all pipeline paths.
 *   - Postcondition: [VARIABLES] block contains all 8 variables as VAR=value lines.
 *   - Invariant: SESSION_DIR always equals RFC_DIR + /drills.
 *
 * RED at make time: formatVariablesBlock does not exist yet, and the CLI does not
 * emit the block — every test fails red until Phase 3 lands (GREEN).
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SCRIPT = path.resolve(__dirname, '../../.claude/scripts/drill-rfc-down/preflight.cjs');
let mod;

const EXPECTED_VARIABLES = [
  'RFC_PATH', 'RFC_DIR', 'GRAPH_PATH', 'DIRS_TREE_PATH',
  'README_PATH', 'TICKETS_PATH', 'SESSION_DIR', 'DRILL_DIR',
];

/** Build a complete project tree (Tickets.json + RFC + GRAPH + Dirs-Tree + README). */
function makeProjectTree(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const rfc = path.join(dir, 'RFC-001.md');
  const graph = path.join(dir, 'RFC-001-GRAPH.json');
  const dirsTree = path.join(dir, 'RFC-001-Dirs-Tree.json');
  const readme = path.join(dir, 'README.md');
  fs.writeFileSync(rfc, '# RFC-001');
  fs.writeFileSync(graph, '{}');
  fs.writeFileSync(dirsTree, '{}');
  fs.writeFileSync(readme, '# README');
  const ticketsPath = path.join(dir, 'Tickets.json');
  fs.writeFileSync(ticketsPath, JSON.stringify({
    metadata: {
      source: 'RFC-001.md',
      resolvedPaths: {
        rfcPath: 'RFC-001.md',
        graphPath: 'RFC-001-GRAPH.json',
        dirsTreePath: 'RFC-001-Dirs-Tree.json',
      },
    },
    phases: [],
  }));
  return { dir, ticketsPath, rfc, graph, dirsTree, readme };
}

let tmpRoot;

before(async () => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-vars-'));
  mod = require(SCRIPT);
});

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('formatVariablesBlock', () => {
  it('returns a [VARIABLES] block with exactly the 8 variables as VAR=value lines', () => {
    const block = mod.formatVariablesBlock({
      rfcPath: '/p/RFC.md',
      rfcDir: '/p',
      graphPath: '/p/RFC-GRAPH.json',
      dirsTreePath: '/p/RFC-Dirs-Tree.json',
      readmePath: '/p/README.md',
      ticketsPath: '/p/Tickets.json',
      sessionDir: '/p/drills',
      drillDir: '.claude/scripts/drill-rfc-down',
    });
    assert.match(block, /^\[VARIABLES\]$/m);
    assert.match(block, /^\[END VARIABLES\]$/m);
    for (const v of EXPECTED_VARIABLES) {
      assert.match(block, new RegExp(`^${v}=`, 'm'), `${v} present as VAR=value`);
    }
  });
});

describe('preflight CLI [VARIABLES] output', () => {
  it('emits the [VARIABLES] block with all 8 variables on success', () => {
    const tree = makeProjectTree(path.join(tmpRoot, 'cli-ok'));
    const res = spawnSync(process.execPath, [SCRIPT, `--tickets=${tree.ticketsPath}`], {
      cwd: tree.dir,
      encoding: 'utf8',
    });
    assert.equal(res.status, 0);
    assert.match(res.stdout, /^\[VARIABLES\]$/m);
    assert.match(res.stdout, /^\[END VARIABLES\]$/m);
    for (const v of EXPECTED_VARIABLES) {
      assert.match(res.stdout, new RegExp(`^${v}=`, 'm'), `${v} in CLI output`);
    }
  });

  it('SESSION_DIR invariant: always equals RFC_DIR + /drills', () => {
    const tree = makeProjectTree(path.join(tmpRoot, 'cli-inv'));
    const res = spawnSync(process.execPath, [SCRIPT, `--tickets=${tree.ticketsPath}`], {
      cwd: tree.dir,
      encoding: 'utf8',
    });
    assert.equal(res.status, 0);
    const rfcDir = res.stdout.match(/^RFC_DIR=(.+)$/m)[1];
    const sessionDir = res.stdout.match(/^SESSION_DIR=(.+)$/m)[1];
    assert.equal(sessionDir, path.join(rfcDir, 'drills'));
  });

  it('does NOT emit the [VARIABLES] block when preflight fails', () => {
    const tree = makeProjectTree(path.join(tmpRoot, 'cli-fail'));
    fs.rmSync(tree.readme, { force: true }); // make README missing
    const res = spawnSync(process.execPath, [SCRIPT, `--tickets=${tree.ticketsPath}`], {
      cwd: tree.dir,
      encoding: 'utf8',
    });
    assert.equal(res.status, 1);
    assert.doesNotMatch(res.stdout, /^\[VARIABLES\]$/m);
    assert.match(res.stderr, /\[ERROR\]/);
  });
});
