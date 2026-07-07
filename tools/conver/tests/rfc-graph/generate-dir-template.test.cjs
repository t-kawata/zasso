/**
 * generate-dir-template.test.cjs — generate-dir-template.js のユニットテスト
 *
 * テストフレームワーク: Node.js 標準の node:test + node:assert/strict
 * 内部関数（parseArgs, discover, createItems 等）に直接メモリ上のデータを渡してテストする。
 * main() は最小限のファイルI/Oテストのみ行う。
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  parseArgs,
  discover,
  runDryRun,
  createItems,
  main,
} = require('../../.claude/scripts/rfc-graph/generate-dir-template.js');

// ============================================================
// テストデータ（ファクトリ関数）
// ============================================================

/** テスト用の有効な Dirs-Tree.json を作成する */
function createValidDirsTree(overrides = {}) {
  return {
    schemaVersion: '1.0',
    trees: {
      rust: {
        name: 'rust',
        type: 'directory',
        children: [
          {
            name: 'config',
            type: 'directory',
            children: [
              { name: 'settings.rs', type: 'file', declarationStub: '// settings' },
              { name: 'app.rs', type: 'file' },
            ],
          },
          {
            name: 'main.rs', type: 'file', declarationStub: '// main entry',
          },
        ],
      },
      go: {
        name: 'go',
        type: 'directory',
        children: [
          { name: 'main.go', type: 'file' },
        ],
      },
      typescript: {
        name: 'typescript',
        type: 'directory',
        children: [
          { name: 'index.ts', type: 'file', declarationStub: '// index' },
        ],
      },
    },
    ...overrides,
  };
}

/** テスト用の一時ディレクトリに Dirs-Tree.json を書き込む */
function writeDirsTreeFile(dirsTree) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdt-test-'));
  const dtPath = path.join(tmpDir, 'Dirs-Tree.json');
  fs.writeFileSync(dtPath, JSON.stringify(dirsTree, null, 2));
  return { tmpDir, dtPath };
}

// ============================================================
// parseArgs — CLI引数パース
// ============================================================

describe('parseArgs — CLI引数パース', () => {
  it('should parse all flags correctly', () => {
    const args = [
      '--dirs-tree=/path/to/Dirs-Tree.json',
      '--root-dir=/output/dir',
      '--lang=rust',
      '--dry-run',
      '--force',
    ];
    const result = parseArgs(args);
    assert.strictEqual(result.dirsTreePath, '/path/to/Dirs-Tree.json');
    assert.strictEqual(result.rootDir, '/output/dir');
    assert.strictEqual(result.lang, 'rust');
    assert.strictEqual(result.isDryRun, true);
    assert.strictEqual(result.isForce, true);
  });

  it('should detect missing --dirs-tree', () => {
    const args = ['--root-dir=/out', '--lang=rust'];
    const result = parseArgs(args);
    assert.strictEqual(result.ok, false);
    assert.ok(result.error.includes('--dirs-tree='));
  });

  it('should detect missing --root-dir', () => {
    const args = ['--dirs-tree=/dt', '--lang=rust'];
    const result = parseArgs(args);
    assert.strictEqual(result.ok, false);
    assert.ok(result.error.includes('--root-dir='));
  });

  it('should detect missing --lang', () => {
    const args = ['--dirs-tree=/dt', '--root-dir=/out'];
    const result = parseArgs(args);
    assert.strictEqual(result.ok, false);
    assert.ok(result.error.includes('--lang='));
  });

  it('should reject unsupported language', () => {
    const args = ['--dirs-tree=/dt', '--root-dir=/out', '--lang=python'];
    const result = parseArgs(args);
    assert.strictEqual(result.ok, false);
    assert.ok(result.error.includes('サポート'));
  });

  it('should accept rust, go, typescript', () => {
    for (const lang of ['rust', 'go', 'typescript']) {
      const result = parseArgs(['--dirs-tree=/dt', '--root-dir=/out', `--lang=${lang}`]);
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.lang, lang);
    }
  });

  it('should set default flags when omitted', () => {
    const result = parseArgs(['--dirs-tree=/dt', '--root-dir=/out', '--lang=rust']);
    assert.strictEqual(result.isDryRun, false);
    assert.strictEqual(result.isForce, false);
  });
});

// ============================================================
// discover — 再帰的ツリー走査
// ============================================================

describe('discover — 再帰的ツリー走査', () => {
  it('should traverse directory-only tree', () => {
    const tree = {
      name: 'root', type: 'directory', children: [
        { name: 'sub1', type: 'directory', children: [
          { name: 'sub2', type: 'directory', children: [] },
        ]},
      ],
    };
    const result = discover(tree, '/base');
    // root dir + sub1 + sub2 = 3 items
    assert.strictEqual(result.length, 3);
    assert.strictEqual(result[0].path, '/base/root');
    assert.strictEqual(result[1].path, '/base/root/sub1');
    assert.strictEqual(result[2].path, '/base/root/sub1/sub2');
  });

  it('should traverse file-only tree', () => {
    const tree = {
      name: 'root', type: 'directory', children: [
        { name: 'a.rs', type: 'file', declarationStub: '// a' },
        { name: 'b.rs', type: 'file' },
      ],
    };
    const result = discover(tree, '/base');
    // root dir + 2 files = 3 items
    assert.strictEqual(result.length, 3);
    assert.strictEqual(result[0].type, 'directory');
    assert.strictEqual(result[0].path, '/base/root');
    assert.strictEqual(result[1].type, 'file');
    assert.strictEqual(result[1].path, '/base/root/a.rs');
    assert.strictEqual(result[1].content, '// a\n\n');
    assert.strictEqual(result[2].content, '');
  });

  it('should traverse nested mixed tree', () => {
    const tree = {
      name: 'root', type: 'directory', children: [
        {
          name: 'src', type: 'directory', children: [
            { name: 'lib.rs', type: 'file' },
            { name: 'util.rs', type: 'file', declarationStub: '// util' },
          ],
        },
        { name: 'README.md', type: 'file' },
      ],
    };
    const result = discover(tree, '/proj');
    // root + src + lib.rs + util.rs + README.md = 5 items
    assert.strictEqual(result.length, 5);
    assert.strictEqual(result[0].path, '/proj/root');
    assert.strictEqual(result[1].path, '/proj/root/src');
    assert.strictEqual(result[2].path, '/proj/root/src/lib.rs');
    assert.strictEqual(result[3].path, '/proj/root/src/util.rs');
    assert.strictEqual(result[4].path, '/proj/root/README.md');
  });

  it('should not create any files during discovery', () => {
    const tree = {
      name: 'root', type: 'directory', children: [
        { name: 'test.rs', type: 'file', declarationStub: '// test' },
      ],
    };
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdt-disc-'));
    try {
      discover(tree, tmpDir);
      // ファイルが作成されていないことを確認
      assert.strictEqual(fs.readdirSync(tmpDir).length, 0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should return only root directory for tree with no children', () => {
    const tree = { name: 'empty', type: 'directory', children: [] };
    const result = discover(tree, '/base');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'directory');
    assert.strictEqual(result[0].path, '/base/empty');
  });

  it('should include content for file with declarationStub', () => {
    const tree = {
      name: 'root', type: 'directory', children: [
        { name: 'with_stub.rs', type: 'file', declarationStub: '// stub content' },
        { name: 'without_stub.rs', type: 'file' },
      ],
    };
    const result = discover(tree, '/base');
    const fileWithStub = result.find(c => c.path === '/base/root/with_stub.rs');
    const fileWithoutStub = result.find(c => c.path === '/base/root/without_stub.rs');
    assert.strictEqual(fileWithStub.content, '// stub content\n\n');
    assert.strictEqual(fileWithoutStub.content, '');
    assert.strictEqual(fileWithoutStub.size, 0);
  });
});

// ============================================================
// runDryRun — dry-run 出力
// ============================================================

describe('runDryRun — dry-run 出力生成', () => {
  it('should produce correct dry-run JSON format', () => {
    const created = [
      { type: 'directory', path: '/out/src' },
      { type: 'file', path: '/out/src/main.rs', size: 10 },
    ];
    const result = runDryRun(created, 'rust');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.dryRun, true);
    assert.strictEqual(result.language, 'rust');
    assert.strictEqual(result.total, 2);
    assert.strictEqual(result.created.length, 2);
    assert.strictEqual(result.created[0].path, '/out/src');
    assert.strictEqual(result.created[1].path, '/out/src/main.rs');
    assert.ok(result.note.includes('dry-run'));
  });
});

// ============================================================
// createItems — 実際のファイル/ディレクトリ作成
// ============================================================

describe('createItems — 実作成', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdt-create-'));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should create directories and files', () => {
    const created = [
      { type: 'directory', path: path.join(tmpDir, 'src'), content: '' },
      { type: 'file', path: path.join(tmpDir, 'src', 'main.rs'), content: '// main\n' },
      { type: 'file', path: path.join(tmpDir, 'README.md'), content: '# Project\n' },
    ];
    const result = createItems(created, false);

    // ディレクトリ作成確認
    assert.ok(fs.statSync(path.join(tmpDir, 'src')).isDirectory());
    // ファイル作成確認
    assert.strictEqual(fs.readFileSync(path.join(tmpDir, 'src', 'main.rs'), 'utf-8'), '// main\n');
    assert.strictEqual(fs.readFileSync(path.join(tmpDir, 'README.md'), 'utf-8'), '# Project\n');

    assert.strictEqual(result.length, 3);
    assert.strictEqual(result[0].action, 'created');
    assert.strictEqual(result[1].action, 'created');
    assert.strictEqual(result[2].action, 'created');
  });

  it('should error on existing file without --force', () => {
    const existingFile = path.join(tmpDir, 'existing.txt');
    fs.writeFileSync(existingFile, 'original');
    const created = [
      { type: 'file', path: existingFile, content: 'new content' },
    ];
    assert.throws(() => createItems(created, false), /既に存在/);
  });

  it('should overwrite existing file with --force', () => {
    const existingFile = path.join(tmpDir, 'overwrite.txt');
    fs.writeFileSync(existingFile, 'original');
    const created = [
      { type: 'file', path: existingFile, content: 'new content' },
    ];
    const result = createItems(created, true);
    assert.strictEqual(result[0].action, 'overwritten');
    assert.strictEqual(fs.readFileSync(existingFile, 'utf-8'), 'new content');
  });

  it('should handle directory existence gracefully', () => {
    // 既存ディレクトリがある状態で mkdirSync recursive はエラーにならない
    const subDir = path.join(tmpDir, 'existing_dir');
    fs.mkdirSync(subDir, { recursive: true });
    const created = [
      { type: 'directory', path: subDir, content: '' },
    ];
    const result = createItems(created, false);
    assert.strictEqual(result[0].action, 'created');
  });
});

// ============================================================
// main — 統合テスト（ファイルI/O）
// ============================================================

describe('main — 統合テスト', () => {
  it('should output dry-run JSON on --dry-run', async () => {
    const dirsTree = createValidDirsTree();
    const { tmpDir, dtPath } = writeDirsTreeFile(dirsTree);
    const rootDir = path.join(tmpDir, 'output');
    let capturedStdout = '';
    const origStdout = process.stdout.write;
    process.stdout.write = (chunk) => { capturedStdout += chunk; return true; };
    let exitCode = null;
    const origExit = process.exit;
    process.exit = (code) => { exitCode = code; };

    try {
      await main([`--dirs-tree=${dtPath}`, `--root-dir=${rootDir}`, '--lang=rust', '--dry-run']);
      const parsed = JSON.parse(capturedStdout);
      assert.strictEqual(parsed.ok, true);
      assert.strictEqual(parsed.dryRun, true);
      assert.strictEqual(parsed.language, 'rust');
      assert.ok(parsed.created.length > 0);
      assert.strictEqual(exitCode, null);
    } finally {
      process.stdout.write = origStdout;
      process.exit = origExit;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should create actual files when not dry-run', async () => {
    const dirsTree = createValidDirsTree();
    const { tmpDir, dtPath } = writeDirsTreeFile(dirsTree);
    const rootDir = path.join(tmpDir, 'out');
    let capturedStdout = '';
    const origStdout = process.stdout.write;
    process.stdout.write = (chunk) => { capturedStdout += chunk; return true; };
    let exitCode = null;
    const origExit = process.exit;
    process.exit = (code) => { exitCode = code; };

    try {
      await main([`--dirs-tree=${dtPath}`, `--root-dir=${rootDir}`, '--lang=rust']);
      const parsed = JSON.parse(capturedStdout);
      assert.strictEqual(parsed.ok, true);
      assert.strictEqual(parsed.dryRun, false);
      assert.ok(parsed.created.length > 0);
      assert.strictEqual(exitCode, null);
      // 実際のファイル作成確認（ルートは言語名）
      assert.ok(fs.existsSync(path.join(rootDir, 'rust', 'config', 'settings.rs')));
      assert.ok(fs.existsSync(path.join(rootDir, 'rust', 'main.rs')));
    } finally {
      process.stdout.write = origStdout;
      process.exit = origExit;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should exit 1 on missing arguments', async () => {
    let capturedStderr = '';
    const origStderr = process.stderr.write;
    process.stderr.write = (chunk) => { capturedStderr += chunk; return true; };
    let exitCode = null;
    const origExit = process.exit;
    process.exit = (code) => { exitCode = code; };

    try {
      await main(['--lang=rust']);
      assert.strictEqual(exitCode, 1);
      assert.ok(capturedStderr.includes('ERROR'));
    } finally {
      process.stderr.write = origStderr;
      process.exit = origExit;
    }
  });

  it('should exit 1 on unsupported language', async () => {
    let capturedStderr = '';
    const origStderr = process.stderr.write;
    process.stderr.write = (chunk) => { capturedStderr += chunk; return true; };
    let exitCode = null;
    const origExit = process.exit;
    process.exit = (code) => { exitCode = code; };

    try {
      await main(['--dirs-tree=/dt', '--root-dir=/out', '--lang=python']);
      assert.strictEqual(exitCode, 1);
      assert.ok(capturedStderr.includes('サポート'));
    } finally {
      process.stderr.write = origStderr;
      process.exit = origExit;
    }
  });

  it('should exit 1 on non-existent dirs-tree file', async () => {
    let capturedStderr = '';
    const origStderr = process.stderr.write;
    process.stderr.write = (chunk) => { capturedStderr += chunk; return true; };
    let exitCode = null;
    const origExit = process.exit;
    process.exit = (code) => { exitCode = code; };

    try {
      await main(['--dirs-tree=/tmp/non-existent-dirs-tree.json', '--root-dir=/out', '--lang=rust']);
      assert.strictEqual(exitCode, 1);
      assert.ok(capturedStderr.includes('見つかりません'));
    } finally {
      process.stderr.write = origStderr;
      process.exit = origExit;
    }
  });

  it('should exit 1 on missing language tree in dirs-tree', async () => {
    const dirsTree = createValidDirsTree();
    // trees.rust が存在しない Dirs-Tree
    delete dirsTree.trees.rust;
    const { tmpDir, dtPath } = writeDirsTreeFile(dirsTree);
    let capturedStderr = '';
    const origStderr = process.stderr.write;
    process.stderr.write = (chunk) => { capturedStderr += chunk; return true; };
    let exitCode = null;
    const origExit = process.exit;
    process.exit = (code) => { exitCode = code; };

    try {
      await main([`--dirs-tree=${dtPath}`, '--root-dir=/out', '--lang=rust']);
      assert.strictEqual(exitCode, 1);
      assert.ok(capturedStderr.includes('見つかりません'));
    } finally {
      process.stderr.write = origStderr;
      process.exit = origExit;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
