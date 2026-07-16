/**
 * generate-dir-template.test.cjs — Unit tests for generate-dir-template.js
 *
 * Test framework: Node.js built-in node:test + node:assert/strict
 * Tests internal functions (parseArgs, discover, createItems, etc.) by passing
 * in-memory data directly. main() is tested with minimal file I/O only.
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
  buildHeaderContext,
  main,
} = require('../../.claude/scripts/rfc-graph/generate-dir-template.js');

// ============================================================
// Test data (factory functions)
// ============================================================

/** Create a valid Dirs-Tree.json for testing */
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

/** Write Dirs-Tree.json to a temporary directory */
function writeDirsTreeFile(dirsTree) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdt-test-'));
  const dtPath = path.join(tmpDir, 'Dirs-Tree.json');
  fs.writeFileSync(dtPath, JSON.stringify(dirsTree, null, 2));
  return { tmpDir, dtPath };
}

// ============================================================
// parseArgs — CLI argument parsing
// ============================================================

describe('parseArgs — CLI argument parsing', () => {
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
    assert.ok(result.error.includes('Unsupported language'));
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
// discover — Recursive tree traversal
// ============================================================

describe('discover — Recursive tree traversal', () => {
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
      // Verify no files are created
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
// runDryRun — dry-run output
// ============================================================

describe('runDryRun — Dry-run output generation', () => {
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
// createItems — Actual file/directory creation
// ============================================================

describe('createItems — Actual creation', () => {
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

    // Verify directory creation
    assert.ok(fs.statSync(path.join(tmpDir, 'src')).isDirectory());
    // Verify file creation
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
    assert.throws(() => createItems(created, false), /already exists/);
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
    // mkdirSync recursive does not error on existing directory
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
// main — Integration test (file I/O)
// ============================================================

describe('main — Integration test', () => {
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
      // Verify actual file creation (root is language name)
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
      assert.ok(capturedStderr.includes('Unsupported language'));
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
      assert.ok(capturedStderr.includes('not found'));
    } finally {
      process.stderr.write = origStderr;
      process.exit = origExit;
    }
  });

  it('should exit 0 on missing language tree in dirs-tree', async () => {
    const dirsTree = createValidDirsTree();
    // Dirs-Tree without trees.rust -> exit normally with nothing to do
    delete dirsTree.trees.rust;
    const { tmpDir, dtPath } = writeDirsTreeFile(dirsTree);
    let capturedStdout = '';
    const origStdout = process.stdout.write;
    process.stdout.write = (chunk) => { capturedStdout += chunk; return true; };
    let exitCode = null;
    const origExit = process.exit;
    process.exit = (code) => { exitCode = code; };

    try {
      await main([`--dirs-tree=${dtPath}`, '--root-dir=/out', '--lang=rust']);
      assert.strictEqual(exitCode, 0);
      assert.ok(capturedStdout.includes('exiting normally'));
    } finally {
      process.stdout.write = origStdout;
      process.exit = origExit;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});


// ============================================================
// PX-30: discover with headerContext
// ============================================================

describe('discover with headerContext', () => {
  const headerContext = {
    graphDirAbs: '/tmp/test-project',
    graphBasename: 'RFC-TEST-GRAPH.json',
    dirsTreeBasename: 'RFC-TEST-Dirs-Tree.json',
    sourceBasename: 'RFC-TEST.md',
    crossReferences: [],
    nodeMetaMap: { N0005: { title: 'Test Node', headingRef: 's 1.0' } },
    lang: 'rust',
  };

  it('should add header before declarationStub when headerContext provided', () => {
    const fileNode = {
      name: 'settings.rs',
      type: 'file',
      declarationStub: 'pub struct Config {}',
      mappedNodeIds: ['N0005'],
    };
    const result = discover(fileNode, '/tmp/test-project/src', headerContext);
    assert.strictEqual(result.length, 1);
    assert.ok(result[0].content.startsWith('//'), 'Should start with comment syntax');
    assert.ok(result[0].content.includes('Initial Design Artifact'), 'Should include header title');
    assert.ok(result[0].content.includes('pub struct Config {}'), 'Should include declaration stub');
    const headerEnd = result[0].content.indexOf('============');
    const stubStart = result[0].content.indexOf('pub struct Config');
    assert.ok(headerEnd < stubStart, 'Header should precede declaration stub');
  });

  it('should add header even without declarationStub', () => {
    const fileNode = { name: 'empty.rs', type: 'file', mappedNodeIds: [] };
    const result = discover(fileNode, '/tmp/test-project/src', headerContext);
    assert.strictEqual(result.length, 1);
    assert.ok(result[0].content.includes('Initial Design Artifact'));
  });

  it('should not add header when headerContext is null (backward compat)', () => {
    const fileNode = {
      name: 'settings.rs',
      type: 'file',
      declarationStub: 'pub struct Config {}',
    };
    const result = discover(fileNode, '/tmp/test-project/src', null);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].content, 'pub struct Config {}\n\n');
  });

  it('should not add header when headerContext is undefined (backward compat)', () => {
    const fileNode = {
      name: 'settings.rs',
      type: 'file',
      declarationStub: 'pub struct Config {}',
    };
    const result = discover(fileNode, '/tmp/test-project/src');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].content, 'pub struct Config {}\n\n');
  });

  it('should propagate headerContext to nested child files', () => {
    const dirNode = {
      name: 'src',
      type: 'directory',
      children: [
        { name: 'lib.rs', type: 'file', mappedNodeIds: ['N001'] },
        {
          name: 'config',
          type: 'directory',
          children: [
            { name: 'settings.rs', type: 'file', mappedNodeIds: ['N002'] },
          ],
        },
      ],
    };
    const result = discover(dirNode, '/tmp/test-project', headerContext);
    const files = result.filter(function (r) { return r.type === 'file'; });
    assert.strictEqual(files.length, 2);
    for (const f of files) {
      assert.ok(f.content.includes('Initial Design Artifact'));
    }
  });
});

// ============================================================
// PX-30: buildHeaderContext
// ============================================================

describe('buildHeaderContext', () => {
  it('should build context from valid Dirs-Tree', () => {
    const dirsTree = {
      sourceGraph: '/tmp/test-project/RFC-TEST-GRAPH.json',
      sourceFile: '/tmp/test-project/RFC-TEST.md',
      trees: {
        rust: {
          name: 'src',
          type: 'directory',
          crossReferences: [
            { nodeId: 'N003', kind: 'rationale', title: 'Why', connections: [] },
          ],
        },
      },
    };
    const ctx = buildHeaderContext(dirsTree, '/tmp/test-project/RFC-TEST-Dirs-Tree.json', '/tmp', 'rust');
    assert.ok(ctx);
    assert.strictEqual(ctx.graphBasename, 'RFC-TEST-GRAPH.json');
    assert.strictEqual(ctx.dirsTreeBasename, 'RFC-TEST-Dirs-Tree.json');
    assert.strictEqual(ctx.sourceBasename, 'RFC-TEST.md');
    assert.strictEqual(ctx.crossReferences.length, 1);
    assert.strictEqual(ctx.nodeMetaMap.N003.title, 'Why');
  });

  it('should return null when sourceGraph is missing', () => {
    const dirsTree = { trees: { rust: { name: 'src', type: 'directory' } } };
    const ctx = buildHeaderContext(dirsTree, '/tmp/x.json', '/tmp', 'rust');
    assert.strictEqual(ctx, null);
  });

  it('should use UNKNOWN_SOURCE.md when sourceFile is missing', () => {
    const dirsTree = {
      sourceGraph: '/tmp/test-project/RFC-TEST-GRAPH.json',
      trees: { rust: { name: 'src', type: 'directory' } },
    };
    const ctx = buildHeaderContext(dirsTree, '/tmp/test-project/RFC-TEST-Dirs-Tree.json', '/tmp', 'rust');
    assert.ok(ctx);
    assert.strictEqual(ctx.sourceBasename, 'UNKNOWN_SOURCE.md');
  });

  it('should handle missing crossReferences gracefully', () => {
    const dirsTree = {
      sourceGraph: '/tmp/test-project/RFC-TEST-GRAPH.json',
      sourceFile: '/tmp/test-project/RFC-TEST.md',
      trees: { rust: { name: 'src', type: 'directory' } },
    };
    const ctx = buildHeaderContext(dirsTree, '/tmp/test-project/RFC-TEST-Dirs-Tree.json', '/tmp', 'rust');
    assert.ok(ctx);
    assert.strictEqual(ctx.crossReferences.length, 0);
  });
});
