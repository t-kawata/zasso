/**
 * preflight.test.cjs — Tests for drill-rfc-down Step 0 Preflight (preflight.js)
 *
 * Covers the /drill-rfc-down Step 0 contract:
 * - Parse material-path arguments (files/dirs) and the internal --tickets option.
 * - Resolve the three pipeline artifacts (RFC / GRAPH / Dirs-Tree) from
 *   Tickets.json metadata.resolvedPaths (priority) with metadata.source fallback.
 * - Collect material paths (recursive for directories; empty dir is an error).
 * - Verify existence of pipeline artifacts + README.md; abort with exit 1 if any
 *   are missing, otherwise print the Markdown report and exit 0.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SCRIPT = path.resolve(__dirname, '../../.claude/scripts/drill-rfc-down/preflight.cjs');
const {
  parseArguments,
  collectMaterialPaths,
  readTickets,
  resolvePipelinePaths,
  verifyExistence,
  formatPreflightMarkdown,
  formatAbortMessage,
} = require(SCRIPT);

/** Build a complete project tree (Tickets.json + RFC + GRAPH + Dirs-Tree + README). */
function makeProjectTree(dir, { includeReadme = true } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const rfc = path.join(dir, 'RFC-001.md');
  const graph = path.join(dir, 'RFC-001-GRAPH.json');
  const dirsTree = path.join(dir, 'RFC-001-Dirs-Tree.json');
  const readme = path.join(dir, 'README.md');
  fs.writeFileSync(rfc, '# RFC-001');
  fs.writeFileSync(graph, '{}');
  fs.writeFileSync(dirsTree, '{}');
  if (includeReadme) fs.writeFileSync(readme, '# README');
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

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'drill-preflight-'));
});

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('parseArguments', () => {
  it('defaults ticketsPath to ./Tickets.json and returns empty materials', () => {
    const { ticketsPath, materialArgs } = parseArguments([]);
    assert.equal(ticketsPath, path.resolve(process.cwd(), 'Tickets.json'));
    assert.deepEqual(materialArgs, []);
  });

  it('parses multiple positional material paths', () => {
    const { materialArgs } = parseArguments(['a.md', 'b/', 'c.md']);
    assert.deepEqual(materialArgs, ['a.md', 'b/', 'c.md']);
  });

  it('resolves --tickets= to an absolute path', () => {
    const { ticketsPath } = parseArguments(['--tickets=relative/Tickets.json']);
    assert.equal(ticketsPath, path.resolve('relative/Tickets.json'));
  });

  it('separates --tickets= from material arguments', () => {
    const { ticketsPath, materialArgs } = parseArguments(['--tickets=t/Tickets.json', 'm.md']);
    assert.equal(ticketsPath, path.resolve('t/Tickets.json'));
    assert.deepEqual(materialArgs, ['m.md']);
  });

  it('throws on unknown long flags', () => {
    assert.throws(() => parseArguments(['--bogus']), /Unknown argument/);
  });

  it('throws on unknown short flags', () => {
    assert.throws(() => parseArguments(['-x']), /Unknown argument/);
  });

  it('splits a single space-separated argument string into multiple materials', () => {
    const { materialArgs } = parseArguments(['a.md b/ c.md']);
    assert.deepEqual(materialArgs, ['a.md', 'b/', 'c.md']);
  });

  it('filters empty and whitespace-only argument strings', () => {
    const { materialArgs } = parseArguments(['', '  ', 'a.md']);
    assert.deepEqual(materialArgs, ['a.md']);
  });

  it('splits materials even when --tickets= shares the same argument string', () => {
    const { ticketsPath, materialArgs } = parseArguments(['--tickets=t/Tickets.json', 'm1.md m2.md']);
    assert.equal(ticketsPath, path.resolve('t/Tickets.json'));
    assert.deepEqual(materialArgs, ['m1.md', 'm2.md']);
  });
});

describe('collectMaterialPaths', () => {
  it('collects a single file', () => {
    const dir = path.join(tmpRoot, 'cm-file');
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, 'note.md');
    fs.writeFileSync(filePath, 'x');
    const { materialPaths, materialSummary } = collectMaterialPaths([filePath], dir);
    assert.deepEqual(materialPaths, [filePath]);
    assert.deepEqual(materialSummary, [{ path: filePath, type: 'file', fileCount: 1 }]);
  });

  it('recursively collects directory files', () => {
    const dir = path.join(tmpRoot, 'cm-dir');
    fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'a.md'), 'a');
    fs.writeFileSync(path.join(dir, 'sub', 'b.md'), 'b');
    const { materialPaths, materialSummary } = collectMaterialPaths([dir], dir);
    assert.equal(materialPaths.length, 2);
    assert.ok(materialPaths.includes(path.join(dir, 'a.md')));
    assert.ok(materialPaths.includes(path.join(dir, 'sub', 'b.md')));
    assert.deepEqual(materialSummary, [{ path: dir, type: 'directory', fileCount: 2 }]);
  });

  it('resolves relative paths against cwd', () => {
    const dir = path.join(tmpRoot, 'cm-rel');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'rel.md'), 'r');
    const { materialPaths } = collectMaterialPaths(['rel.md'], dir);
    assert.deepEqual(materialPaths, [path.join(dir, 'rel.md')]);
  });

  it('throws on empty directory', () => {
    const dir = path.join(tmpRoot, 'cm-empty');
    fs.mkdirSync(dir, { recursive: true });
    assert.throws(() => collectMaterialPaths([dir], dir), /Empty material directory/);
  });

  it('throws on non-existent path', () => {
    const dir = path.join(tmpRoot, 'cm-miss');
    fs.mkdirSync(dir, { recursive: true });
    assert.throws(() => collectMaterialPaths(['missing.md'], dir), /Material path not found/);
  });

  it('expands ~/ prefix', () => {
    const home = os.homedir();
    const target = path.join(home, 'drill-no-such-file-xyz');
    assert.throws(
      () => collectMaterialPaths(['~/drill-no-such-file-xyz'], home),
      (err) => err.message.includes('Material path not found') && err.message.includes(target),
    );
  });
});

describe('readTickets', () => {
  it('throws when Tickets.json is missing', () => {
    const filePath = path.join(tmpRoot, 'nope.json');
    assert.throws(() => readTickets(filePath), /Tickets\.json not found/);
  });

  it('parses valid JSON', () => {
    const filePath = path.join(tmpRoot, 'valid.json');
    fs.writeFileSync(filePath, '{"metadata":{}}');
    assert.deepEqual(readTickets(filePath), { metadata: {} });
  });

  it('throws on invalid JSON', () => {
    const filePath = path.join(tmpRoot, 'bad.json');
    fs.writeFileSync(filePath, '{not json');
    assert.throws(() => readTickets(filePath), /not valid JSON/);
  });
});

describe('resolvePipelinePaths', () => {
  it('uses resolvedPaths when complete', () => {
    const dir = path.join(tmpRoot, 'rp-complete');
    fs.mkdirSync(dir, { recursive: true });
    const tickets = {
      metadata: {
        source: 'whatever.md',
        resolvedPaths: { rfcPath: 'RFC.md', graphPath: 'RFC-GRAPH.json', dirsTreePath: 'RFC-Dirs-Tree.json' },
      },
    };
    const result = resolvePipelinePaths(tickets, dir);
    assert.deepEqual(result, {
      rfcPath: path.join(dir, 'RFC.md'),
      graphPath: path.join(dir, 'RFC-GRAPH.json'),
      dirsTreePath: path.join(dir, 'RFC-Dirs-Tree.json'),
      pathSource: 'resolvedPaths',
    });
  });

  it('expands ~/ in resolvedPaths entries', () => {
    const dir = path.join(tmpRoot, 'rp-home');
    fs.mkdirSync(dir, { recursive: true });
    const tickets = {
      metadata: {
        resolvedPaths: { rfcPath: '~/r.md', graphPath: '~/g.json', dirsTreePath: '~/d.json' },
      },
    };
    const result = resolvePipelinePaths(tickets, dir);
    assert.equal(result.rfcPath, path.join(os.homedir(), 'r.md'));
    assert.equal(result.graphPath, path.join(os.homedir(), 'g.json'));
    assert.equal(result.dirsTreePath, path.join(os.homedir(), 'd.json'));
    assert.equal(result.pathSource, 'resolvedPaths');
  });

  it('falls back to metadata.source.md when resolvedPaths is incomplete', () => {
    const dir = path.join(tmpRoot, 'rp-md');
    fs.mkdirSync(dir, { recursive: true });
    const sourceFile = path.join(dir, 'RFC.md');
    fs.writeFileSync(sourceFile, '# RFC');
    const tickets = {
      metadata: {
        source: 'RFC.md',
        resolvedPaths: { rfcPath: 'RFC.md', graphPath: 'RFC-GRAPH.json' },
      },
    };
    const result = resolvePipelinePaths(tickets, dir);
    assert.equal(result.rfcPath, sourceFile);
    assert.equal(result.graphPath, path.join(dir, 'RFC-GRAPH.json'));
    assert.equal(result.dirsTreePath, path.join(dir, 'RFC-Dirs-Tree.json'));
    assert.equal(result.pathSource, 'metadata.source.md');
  });

  it('resolves a metadata.source stored relative to a repo root (ancestor of ticketsDir)', () => {
    const repoRoot = path.join(tmpRoot, 'rp-repo-relative');
    const dir = path.join(repoRoot, 'sub'); // Tickets.json lives in a subdirectory
    fs.mkdirSync(dir, { recursive: true });
    const sourceFile = path.join(repoRoot, 'RFC.md');
    fs.writeFileSync(sourceFile, '# RFC');
    const tickets = { metadata: { source: 'rp-repo-relative/RFC.md' } };
    const result = resolvePipelinePaths(tickets, dir);
    assert.equal(result.rfcPath, sourceFile);
    assert.equal(result.graphPath, path.join(repoRoot, 'RFC-GRAPH.json'));
    assert.equal(result.dirsTreePath, path.join(repoRoot, 'RFC-Dirs-Tree.json'));
    assert.equal(result.pathSource, 'metadata.source.md');
  });

  it('derives paths from metadata.source.json (GRAPH file)', () => {
    const dir = path.join(tmpRoot, 'rp-json');
    fs.mkdirSync(dir, { recursive: true });
    const graphFile = path.join(dir, 'RFC-GRAPH.json');
    fs.writeFileSync(graphFile, '{}');
    const tickets = { metadata: { source: 'RFC-GRAPH.json' } };
    const result = resolvePipelinePaths(tickets, dir);
    assert.equal(result.rfcPath, path.join(dir, 'RFC.md'));
    assert.equal(result.graphPath, graphFile);
    assert.equal(result.dirsTreePath, path.join(dir, 'RFC-Dirs-Tree.json'));
    assert.equal(result.pathSource, 'metadata.source.json');
  });

  it('returns none when no source and no resolvedPaths', () => {
    const result = resolvePipelinePaths({ metadata: {} }, tmpRoot);
    assert.deepEqual(result, { rfcPath: '', graphPath: '', dirsTreePath: '', pathSource: 'none' });
  });

  it('returns not_found when metadata.source file is missing', () => {
    const dir = path.join(tmpRoot, 'rp-nf');
    fs.mkdirSync(dir, { recursive: true });
    const result = resolvePipelinePaths({ metadata: { source: 'missing.md' } }, dir);
    assert.equal(result.pathSource, 'not_found');
    assert.equal(result.rfcPath, '');
    assert.equal(result.sourcePath, path.join(dir, 'missing.md'));
  });

  it('returns unknown for non-md/json source extension', () => {
    const dir = path.join(tmpRoot, 'rp-unk');
    fs.mkdirSync(dir, { recursive: true });
    const sourceFile = path.join(dir, 'data.txt');
    fs.writeFileSync(sourceFile, 'x');
    const result = resolvePipelinePaths({ metadata: { source: 'data.txt' } }, dir);
    assert.equal(result.pathSource, 'unknown');
    assert.equal(result.rfcPath, '');
  });
});

describe('verifyExistence', () => {
  it('splits present and missing', () => {
    const dir = path.join(tmpRoot, 've');
    fs.mkdirSync(dir, { recursive: true });
    const existing = path.join(dir, 'a.json');
    fs.writeFileSync(existing, '{}');
    const missingFile = path.join(dir, 'b.json');
    const { present, missing } = verifyExistence({ a: existing, b: missingFile });
    assert.deepEqual(present, { a: existing });
    assert.deepEqual(missing, { b: missingFile });
  });
});

describe('formatPreflightMarkdown', () => {
  it('includes materials, pipeline artifacts, path source, and Step 1 instruction', () => {
    const md = formatPreflightMarkdown({
      materialSummary: [
        { path: '/m/note.md', type: 'file', fileCount: 1 },
        { path: '/m/docs', type: 'directory', fileCount: 3 },
      ],
      pipeline: {
        rfcPath: '/p/RFC.md',
        graphPath: '/p/RFC-GRAPH.json',
        dirsTreePath: '/p/RFC-Dirs-Tree.json',
        readmePath: '/p/README.md',
      },
      pathSource: 'resolvedPaths',
      present: {
        rfc: '/p/RFC.md',
        graph: '/p/RFC-GRAPH.json',
        dirsTree: '/p/RFC-Dirs-Tree.json',
        readme: '/p/README.md',
      },
    });
    assert.match(md, /✅ All required files exist/);
    assert.match(md, /Step 1: grill/);
    assert.match(md, /\| 1 \| \/m\/note\.md \| file \| 1 \|/);
    assert.match(md, /\| 2 \| \/m\/docs \| directory \| 3 \|/);
    assert.match(md, /\| RFC \| \/p\/RFC\.md \| ✅ \|/);
    assert.match(md, /Path source: resolvedPaths/);
  });

  it('shows None when no materials', () => {
    const md = formatPreflightMarkdown({
      materialSummary: [],
      pipeline: {
        rfcPath: '/p/RFC.md',
        graphPath: '/p/RFC-GRAPH.json',
        dirsTreePath: '/p/RFC-Dirs-Tree.json',
        readmePath: '/p/README.md',
      },
      pathSource: 'metadata.source.md',
      present: {},
    });
    assert.match(md, /None\./);
    assert.match(md, /Path source: metadata\.source\.md/);
  });
});

describe('formatAbortMessage', () => {
  it('lists each missing artifact and instructs abort', () => {
    const msg = formatAbortMessage({ rfc: '/p/RFC.md', readme: '/p/README.md' });
    assert.match(msg, /\[ERROR\]/);
    assert.match(msg, /Missing files:/);
    assert.match(msg, /RFC: \/p\/RFC\.md/);
    assert.match(msg, /README\.md: \/p\/README\.md/);
    assert.match(msg, /Abort: fix the missing files/);
  });
});

describe('CLI', () => {
  it('exits 0 and prints the Markdown report when all files exist', () => {
    const tree = makeProjectTree(path.join(tmpRoot, 'cli-ok'));
    const res = spawnSync(process.execPath, [SCRIPT, `--tickets=${tree.ticketsPath}`], {
      cwd: tree.dir,
      encoding: 'utf8',
    });
    assert.equal(res.status, 0);
    assert.match(res.stdout, /✅ All required files exist/);
    assert.match(res.stdout, /Step 1: grill/);
    assert.match(res.stdout, /Path source: resolvedPaths/);
    assert.match(res.stdout, /RFC-001\.md/);
    assert.equal(res.stderr, '');
  });

  it('lists provided material files and directories', () => {
    const tree = makeProjectTree(path.join(tmpRoot, 'cli-materials'));
    const matFile = path.join(tmpRoot, 'note.md');
    const matDir = path.join(tmpRoot, 'docs');
    fs.writeFileSync(matFile, 'note');
    fs.mkdirSync(matDir, { recursive: true });
    fs.writeFileSync(path.join(matDir, 'a.md'), 'a');
    fs.writeFileSync(path.join(matDir, 'b.md'), 'b');
    const res = spawnSync(process.execPath, [SCRIPT, `--tickets=${tree.ticketsPath}`, matFile, matDir], {
      cwd: tree.dir,
      encoding: 'utf8',
    });
    assert.equal(res.status, 0);
    assert.match(res.stdout, /\| 1 \| .*note\.md \| file \| 1 \|/);
    assert.match(res.stdout, /\| 2 \| .*docs \| directory \| 2 \|/);
  });

  it('exits 1 and reports missing README.md', () => {
    const tree = makeProjectTree(path.join(tmpRoot, 'cli-no-readme'), { includeReadme: false });
    const res = spawnSync(process.execPath, [SCRIPT, `--tickets=${tree.ticketsPath}`], {
      cwd: tree.dir,
      encoding: 'utf8',
    });
    assert.equal(res.status, 1);
    assert.match(res.stderr, /\[ERROR\]/);
    assert.match(res.stderr, /Missing files:/);
    assert.match(res.stderr, /README\.md/);
  });

  it('exits 1 when Tickets.json is missing', () => {
    const dir = path.join(tmpRoot, 'cli-no-tickets');
    fs.mkdirSync(dir, { recursive: true });
    const res = spawnSync(process.execPath, [SCRIPT, `--tickets=${path.join(dir, 'Tickets.json')}`], {
      cwd: dir,
      encoding: 'utf8',
    });
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Tickets\.json not found/);
  });

  it('exits 1 when a material directory is empty', () => {
    const tree = makeProjectTree(path.join(tmpRoot, 'cli-empty-mat'));
    const emptyDir = path.join(tmpRoot, 'empty');
    fs.mkdirSync(emptyDir, { recursive: true });
    const res = spawnSync(process.execPath, [SCRIPT, `--tickets=${tree.ticketsPath}`, emptyDir], {
      cwd: tree.dir,
      encoding: 'utf8',
    });
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Empty material directory/);
  });

  it('exits 1 on unknown flags', () => {
    const tree = makeProjectTree(path.join(tmpRoot, 'cli-flag'));
    const res = spawnSync(process.execPath, [SCRIPT, `--tickets=${tree.ticketsPath}`, '--bogus'], {
      cwd: tree.dir,
      encoding: 'utf8',
    });
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Unknown argument/);
  });
});
