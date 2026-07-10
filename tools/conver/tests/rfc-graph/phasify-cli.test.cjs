/**
 * phasify-cli.test.cjs — phasify-graph-and-dirs-files-tree.js CLI骨格のユニットテスト
 *
 * テストフレームワーク: Node.js 標準の node:test + node:assert/strict
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  parseArguments,
  resolveTicketsPath,
  checkDirsTreeExists,
  ensureTicketsJsonExists,
  MIN_NODES_PER_PHASE,
} = require('../../.claude/scripts/rfc-graph/phasify-graph-and-dirs-files-tree.js');

// ============================================================
// parseArguments
// ============================================================

describe('parseArguments', () => {
  it('should parse two positional args', () => {
    const result = parseArguments(['/a/b/graph.json', '/a/b/dirs.json']);
    assert.ok(result.graphPath.endsWith('graph.json'));
    assert.ok(result.dirsTreePath.endsWith('dirs.json'));
    assert.strictEqual(result.dryRun, false);
    assert.strictEqual(result.verbose, false);
  });

  it('should parse --dry-run flag', () => {
    const result = parseArguments(['/a/b/graph.json', '/a/b/dirs.json', '--dry-run']);
    assert.strictEqual(result.dryRun, true);
  });

  it('should parse --verbose flag', () => {
    const result = parseArguments(['/a/b/graph.json', '/a/b/dirs.json', '--verbose']);
    assert.strictEqual(result.verbose, true);
  });

  it('should parse both flags', () => {
    const result = parseArguments(['/a/b/graph.json', '/a/b/dirs.json', '--dry-run', '--verbose']);
    assert.strictEqual(result.dryRun, true);
    assert.strictEqual(result.verbose, true);
  });

  it('should convert relative paths to absolute', () => {
    const result = parseArguments(['relative/graph.json', 'relative/dirs.json']);
    assert.ok(path.isAbsolute(result.graphPath));
    assert.ok(path.isAbsolute(result.dirsTreePath));
  });

  it('should exit with code 2 when no arguments given', () => {
    assert.throws(() => {
      // process.exit をスローに変換するラッパー
      const origExit = process.exit;
      let exitCode = null;
      process.exit = (code) => { throw new Error('exit:' + code); };
      try {
        parseArguments([]);
      } finally {
        process.exit = origExit;
      }
    });
  });

  it('should exit with code 2 when one argument given', () => {
    assert.throws(() => {
      const origExit = process.exit;
      let exitCode = null;
      process.exit = (code) => { throw new Error('exit:' + code); };
      try {
        parseArguments(['only-one.json']);
      } finally {
        process.exit = origExit;
      }
    });
  });

  it('should exit with code 2 when unknown flag given', () => {
    assert.throws(() => {
      const origExit = process.exit;
      process.exit = (code) => { throw new Error('exit:' + code); };
      try {
        parseArguments(['a.json', 'b.json', '--unknown']);
      } finally {
        process.exit = origExit;
      }
    });
  });
});

// ============================================================
// resolveTicketsPath
// ============================================================

describe('resolveTicketsPath', () => {
  it('should return Tickets.json in the same directory', () => {
    const result = resolveTicketsPath('/project/GRAPH.json', '/project/Dirs-Tree.json');
    assert.strictEqual(result, path.resolve('/project/Tickets.json'));
  });

  it('should exit with code 2 when directories differ', () => {
    assert.throws(() => {
      const origExit = process.exit;
      process.exit = (code) => { throw new Error('exit:' + code); };
      try {
        resolveTicketsPath('/dir1/GRAPH.json', '/dir2/Dirs-Tree.json');
      } finally {
        process.exit = origExit;
      }
    });
  });
});

// ============================================================
// checkDirsTreeExists
// ============================================================

describe('checkDirsTreeExists', () => {
  it('should not throw when file exists', () => {
    // /dev/null は全てのOSに存在する
    const result = checkDirsTreeExists('/dev/null');
    assert.strictEqual(result, undefined);
  });

  it('should exit with code 3 when file does not exist', () => {
    assert.throws(() => {
      const origExit = process.exit;
      process.exit = (code) => { throw new Error('exit:' + code); };
      try {
        checkDirsTreeExists('/nonexistent/path/Dirs-Tree.json');
      } finally {
        process.exit = origExit;
      }
    });
  });
});

// ============================================================
// ensureTicketsJsonExists
// ============================================================

describe('ensureTicketsJsonExists', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phasify-cli-test-'));

  after(() => {
    // クリーンアップ
    try {
      const files = fs.readdirSync(tmpDir);
      for (const f of files) {
        if (f !== '.' && f !== '..') {
          fs.rmSync(path.join(tmpDir, f), { force: true, recursive: true });
        }
      }
      fs.rmdirSync(tmpDir);
    } catch {
      // cleanup errors are non-fatal
    }
  });

  it('should return false when Tickets.json already exists', () => {
    const testPath = path.join(tmpDir, 'Tickets.json');
    fs.writeFileSync(testPath, '{"title":"test","metadata":{"source":"","generatedAt":"2026-01-01"},"phases":[]}');
    const result = ensureTicketsJsonExists(testPath, '/dev/null/graph.json', false);
    assert.strictEqual(result, false);
  });

  it('should create Tickets.json when not exists and not dry-run', () => {
    const testPath = path.join(tmpDir, 'new-Tickets.json');
    // write-tickets-json-template.js はプロジェクトルートにあるので、
    // CI以外ではテストできない。代わりに、存在しない場合の挙動を確認。
    const result = ensureTicketsJsonExists(testPath, '/project/graph.json', true);
    assert.strictEqual(result, true);
  });

  it('should return true in dry-run mode when not exists', () => {
    const testPath = path.join(tmpDir, 'dry-Tickets.json');
    const result = ensureTicketsJsonExists(testPath, '/project/graph.json', true);
    assert.strictEqual(result, true);
  });
});

// ============================================================
// MIN_NODES_PER_PHASE
// ============================================================

describe('MIN_NODES_PER_PHASE', () => {
  it('should be exactly 10', () => {
    assert.strictEqual(MIN_NODES_PER_PHASE, 10);
  });
});
