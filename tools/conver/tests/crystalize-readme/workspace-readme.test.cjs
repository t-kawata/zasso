// [::TICKET::] PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-452 --for-spec --no-implementation-order`.
// [::TICKET::] PX-451 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-451 --for-spec --no-implementation-order`.
/**
 * workspace-readme.test.cjs — managed-block convergence without human loss.
 * @verifies C004
 * @verifies C004/precondition
 * @verifies C004/postcondition
 * @verifies C004/invariant
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  updateWorkspaceReadme,
  updateWorkspaceFile,
  acquireWorkspaceLock,
  buildWorkspaceAggregate,
  parseWorkspaceBlocks,
  validateWorkspaceBlocks,
  countBlocks,
} = require('../../.claude/scripts/crystalize-readme/workspace-readme.js');

describe('C004 — workspace README managed blocks', () => {
  it('creates one workspace block and one package block', () => {
    const text = updateWorkspaceReadme('', {
      unitId: 'pkg-a',
      packageBlock: 'Package A',
      workspaceBlock: 'Workspace',
    });
    assert.equal(countBlocks(text, 'WORKSPACE'), 1);
    assert.equal(countBlocks(text, 'PACKAGE:pkg-a'), 1);
    assert.deepEqual(validateWorkspaceBlocks(text).errors, []);
  });

  it('preserves a human prefix byte-for-byte when appending blocks', () => {
    const human = '# Human workspace notes\n\nKeep this text.\n';
    const text = updateWorkspaceReadme(human, {
      unitId: 'pkg-a',
      packageBlock: 'Package A',
      workspaceBlock: 'Workspace',
    });
    assert.ok(text.startsWith(human));
  });

  it('replaces only managed block bodies and is idempotent', () => {
    const first = updateWorkspaceReadme('', {
      unitId: 'pkg-a',
      packageBlock: 'Package A',
      workspaceBlock: 'Workspace',
    });
    const second = updateWorkspaceReadme(first, {
      unitId: 'pkg-a',
      packageBlock: 'Package A v2',
      workspaceBlock: 'Workspace v2',
    });
    assert.ok(second.includes('Package A v2'));
    assert.ok(second.includes('Workspace v2'));
    assert.equal(second, updateWorkspaceReadme(second, {
      unitId: 'pkg-a',
      packageBlock: 'Package A v2',
      workspaceBlock: 'Workspace v2',
    }));
  });

  it('reports a malformed block instead of rewriting it', () => {
    const malformed = '# Notes\n\n<!-- [::CRYSTALIZE:WORKSPACE:BEGIN] -->\nmissing end\n';
    assert.equal(validateWorkspaceBlocks(malformed).ok, false);
    assert.throws(() => updateWorkspaceReadme(malformed, {
      unitId: 'pkg-a',
      packageBlock: 'Package A',
      workspaceBlock: 'Workspace',
    }), /malformed|unclosed/i);
  });

  it('parses block ids and bodies', () => {
    const text = updateWorkspaceReadme('', {
      unitId: 'pkg-a',
      packageBlock: 'Package A',
      workspaceBlock: 'Workspace',
    });
    const blocks = parseWorkspaceBlocks(text);
    assert.equal(blocks.length, 2);
    assert.ok(blocks.some((block) => block.id === 'WORKSPACE'));
    assert.ok(blocks.some((block) => block.id === 'PACKAGE:pkg-a'));
  });
});

describe('C002 — workspace lock and serialized updates', () => {
  it('acquires with O_EXCL, releases on success, and fails closed after the retry budget', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'px452-lock-'));
    try {
      const lockPath = path.join(dir, '.crystalize-workspace.lock');
      const release = acquireWorkspaceLock(lockPath, { retries: 1, delayMs: 1 });
      assert.equal(fs.existsSync(lockPath), true);
      release();
      assert.equal(fs.existsSync(lockPath), false);
      fs.writeFileSync(lockPath, 'held', 'utf8');
      assert.throws(() => acquireWorkspaceLock(lockPath, { retries: 2, delayMs: 1 }), /workspace lock is held/);
      assert.equal(fs.existsSync(lockPath), true, 'a failed acquisition leaves the holder lock in place');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('serializes two writers without losing the first package block', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'px452-writers-'));
    try {
      const file = path.join(dir, 'README.md');
      fs.writeFileSync(file, '# Human workspace notes\n', 'utf8');
      updateWorkspaceFile(file, { unitId: 'pkg-a', packageBlock: 'Package A', workspaceBlock: 'Workspace' });
      const second = updateWorkspaceFile(file, { unitId: 'pkg-b', packageBlock: 'Package B', workspaceBlock: 'Workspace' });
      assert.equal(countBlocks(second, 'PACKAGE:pkg-a'), 1);
      assert.equal(countBlocks(second, 'PACKAGE:pkg-b'), 1);
      assert.ok(second.startsWith('# Human workspace notes\n'));
      assert.equal(fs.existsSync(path.join(dir, '.crystalize-workspace.lock')), false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('C004 — workspace block language gate', () => {
  it('rejects a non-English block before any write', () => {
    assert.throws(() => updateWorkspaceReadme('', {
      unitId: 'pkg-a', packageBlock: 'パッケージです', workspaceBlock: 'Workspace', englishOnly: true,
    }), /language violation/);
  });

  it('writes an English-only pair and leaves human text outside blocks unchanged', () => {
    const human = '# Human notes\n\nKeep this.\n';
    const text = updateWorkspaceReadme(human, {
      unitId: 'pkg-a', packageBlock: 'Package A', workspaceBlock: 'Workspace', englishOnly: true,
    });
    assert.ok(text.startsWith(human));
    assert.equal(countBlocks(text, 'PACKAGE:pkg-a'), 1);
  });
});

describe('C009 — deterministic workspace aggregate', () => {
  const blocks = [
    { unitId: 'pkg-b', path: 'packages/b', role: 'cli', purpose: 'B', contractState: 'residue' },
    { unitId: 'pkg-a', path: 'packages/a', role: 'core', purpose: 'A', contractState: 'complete' },
  ];

  it('sorts by unit id and lists missing packages as not crystallized', () => {
    const aggregate = buildWorkspaceAggregate({
      packageBlocks: blocks,
      knownUnits: ['pkg-a', 'pkg-b', 'pkg-c'],
    });
    assert.ok(aggregate.indexOf('pkg-a') < aggregate.indexOf('pkg-b'));
    assert.match(aggregate, /pkg-c.*not crystallized/i);
    assert.doesNotMatch(aggregate, /\d{4}-\d{2}-\d{2}/, 'no timestamp is embedded');
  });

  it('is byte-identical across input orders', () => {
    const first = buildWorkspaceAggregate({ packageBlocks: blocks, knownUnits: ['pkg-a', 'pkg-b', 'pkg-c'] });
    const second = buildWorkspaceAggregate({
      packageBlocks: [...blocks].reverse(),
      knownUnits: ['pkg-c', 'pkg-b', 'pkg-a'],
    });
    assert.equal(first, second);
  });

  it('replaces the aggregate placeholder in the workspace block', () => {
    const text = updateWorkspaceReadme('', {
      unitId: 'pkg-a',
      packageBlock: 'Package A',
      workspaceBlock: 'Purpose\n\n<!-- crystalize-aggregate -->',
      aggregate: { packageBlocks: blocks, knownUnits: ['pkg-a', 'pkg-b', 'pkg-c'] },
    });
    assert.ok(text.includes('| Unit | Path | Role | Contract | README |'));
    assert.ok(text.includes('pkg-a'));
    assert.ok(!text.includes('<!-- crystalize-aggregate -->'));
  });
});
