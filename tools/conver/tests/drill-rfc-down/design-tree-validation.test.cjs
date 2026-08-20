/**
 * design-tree-validation.test.cjs — Strict DesignTree validation (PX-158/159 review fix)
 *
 * Verifies that $DRILL_DIR/check-all-schema.js enforces the Q<number> id
 * convention on DesignTree nodes, and that Step 1-4 of the command file
 * documents the DesignTree JSON rules (id convention + node structure).
 *
 * RED at review time: validateDesignTree accepts arbitrary string ids and the
 * command file gives no guidance on writing DesignTree nodes.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const DRILL_DIR = path.resolve(__dirname, '../../.claude/scripts/drill-rfc-down');
const CHECK_ALL_SCHEMA = path.join(DRILL_DIR, 'check-all-schema.js');
const UPDATE_TREE = path.join(DRILL_DIR, 'update-tree.js');
const SESSION_INIT = path.join(DRILL_DIR, 'session-init.js');
const COMMAND_FILE = path.resolve(__dirname, '../../.claude/commands/drill-rfc-down.md');

let tmpRoot;
let dir;
let iso;

before(async () => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'design-tree-'));
  dir = path.join(tmpRoot, 'session');
  fs.mkdirSync(dir, { recursive: true });
  iso = '2026-08-20T00:00:00.000Z';
});

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function writeTree(nodes) {
  fs.writeFileSync(path.join(dir, 'DesignTree.json'), JSON.stringify({ version: 1, updatedAt: iso, nodes }));
}

const Q_ID_ERROR = /Q[0-9]|Q<number>|convention/i;

describe('validateDesignTree (Q-id convention)', () => {
  it('accepts a valid Q-id tree (Q1, Q2, Q1a child)', async () => {
    const mod = await import(pathToFileURL(CHECK_ALL_SCHEMA).href);
    writeTree([
      { id: 'Q1', title: 'Decision 1', status: 'open', children: [{ id: 'Q1a', title: 'Sub 1', status: 'open', children: [], questions: [] }], questions: [] },
      { id: 'Q2', title: 'Decision 2', status: 'open', children: [], questions: [] },
    ]);
    assert.deepEqual(mod.validateDesignTree(dir), []);
  });

  it('rejects a non-Q top-level id', async () => {
    const mod = await import(pathToFileURL(CHECK_ALL_SCHEMA).href);
    writeTree([{ id: 'node-1', title: 'X', status: 'open', children: [], questions: [] }]);
    const errors = mod.validateDesignTree(dir);
    assert.ok(errors.some((e) => Q_ID_ERROR.test(e)), `expected Q-id error, got: ${errors.join('; ') || '(none)'}`);
  });

  it('rejects a non-Q child id', async () => {
    const mod = await import(pathToFileURL(CHECK_ALL_SCHEMA).href);
    writeTree([{ id: 'Q1', title: 'X', status: 'open', children: [{ id: 'child1', title: 'Y', status: 'open', children: [], questions: [] }], questions: [] }]);
    const errors = mod.validateDesignTree(dir);
    assert.ok(errors.some((e) => Q_ID_ERROR.test(e)), `expected Q-id error, got: ${errors.join('; ') || '(none)'}`);
  });

  it('rejects duplicate ids (regression)', async () => {
    const mod = await import(pathToFileURL(CHECK_ALL_SCHEMA).href);
    writeTree([
      { id: 'Q1', title: 'X', status: 'open', children: [], questions: [] },
      { id: 'Q1', title: 'Y', status: 'open', children: [], questions: [] },
    ]);
    const errors = mod.validateDesignTree(dir);
    assert.ok(errors.some((e) => /duplicate/i.test(e)));
  });

  it('rejects missing questions array (regression)', async () => {
    const mod = await import(pathToFileURL(CHECK_ALL_SCHEMA).href);
    writeTree([{ id: 'Q1', title: 'X', status: 'open', children: [] }]);
    const errors = mod.validateDesignTree(dir);
    assert.ok(errors.some((e) => /questions.*array/i.test(e)));
  });
});

describe('update-tree.js rollback on failed add (no partial write)', () => {
  it('a failed add leaves DesignTree.json unchanged', () => {
    // Build a real session via session-init + a valid Q1 add.
    const project = path.join(tmpRoot, 'rollback');
    fs.mkdirSync(project, { recursive: true });
    const rfcPath = path.join(project, 'RFC.md');
    fs.writeFileSync(rfcPath, '# RFC');
    const init = spawnSync(process.execPath, [SESSION_INIT, rfcPath], { encoding: 'utf8' });
    assert.equal(init.status, 0, init.stderr);
    const sessionDir = path.join(project, 'drills');
    const okAdd = spawnSync(process.execPath, [UPDATE_TREE, sessionDir, 'add', '{"id":"Q1","title":"Decision","status":"open","children":[],"questions":[]}'], { encoding: 'utf8' });
    assert.equal(okAdd.status, 0, okAdd.stderr);
    const before = fs.readFileSync(path.join(sessionDir, 'DesignTree.json'), 'utf8');
    assert.match(before, /Q1/);

    // Attempt to add an invalid id -> rejected AND rolled back.
    const badAdd = spawnSync(process.execPath, [UPDATE_TREE, sessionDir, 'add', '{"id":"node-1","title":"Bad","status":"open","children":[],"questions":[]}'], { encoding: 'utf8' });
    assert.equal(badAdd.status, 1);
    const after = fs.readFileSync(path.join(sessionDir, 'DesignTree.json'), 'utf8');
    assert.equal(after, before, 'DesignTree.json unchanged after failed add');
    assert.doesNotMatch(after, /node-1/);
  });
});

describe('Step 1-4 command guidance', () => {
  it('documents the Q-id convention and node structure', () => {
    const md = fs.readFileSync(COMMAND_FILE, 'utf8');
    const start = md.indexOf('#### 1-4.');
    assert.ok(start !== -1, 'Step 1-4 present');
    const step14 = md.slice(start, md.indexOf('#### 1-5.', start));
    assert.match(step14, /Q[0-9]|Q<number>|id規約|id 規約/, 'Q-id convention documented');
    assert.match(step14, /title|status|children|questions/, 'node structure fields documented');
  });
});
