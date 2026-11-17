import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBundle } from '../okf-core/index.mjs';
import { conceptBody } from '../okf-core/context/assemble.mjs';

const SKILL = fileURLToPath(new URL('../', import.meta.url));
const ASSETS = join(SKILL, 'EXEC_ASSETS');
const CLI = join(SKILL, 'dist/skill.mjs');

function listFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) files.push(...listFiles(path));
    else files.push(path);
  }
  return files.sort();
}

function normalized(path) {
  return readFileSync(path, 'utf8').replace(/\r\n?/g, '\n');
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function lineCount(text) {
  return text.endsWith('\n') ? text.slice(0, -1).split('\n').length : text.split('\n').length;
}

function parseManifest(text) {
  const files = [];
  let current = null;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line === '[[file]]') {
      current = {};
      files.push(current);
      continue;
    }
    const assignment = line.match(/^([a-z_][a-z0-9_]*)\s*=\s*"([^"]*)"$/);
    if (assignment && current) current[assignment[1]] = assignment[2];
  }
  return files;
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(SKILL, relativePath), 'utf8'));
}

function run(args) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd: SKILL, encoding: 'utf8' });
}

test('the execution-asset tree is shipped and fully covered', () => {
  assert.ok(existsSync(ASSETS), 'EXEC_ASSETS is absent');
  const files = listFiles(ASSETS).map((file) => relative(ASSETS, file));
  assert.equal(files.length, 46);
  const coverage = readJson('source/asset-coverage.json');
  assert.equal(coverage.schema, 'okf-asset-coverage/v1');
  assert.equal(coverage.counts.files, files.length);
  assert.equal(coverage.counts.concepts, files.length);
  assert.equal(coverage.counts.unmappedFiles, 0);
  assert.equal(coverage.counts.unmappedLines, 0);
});

test('the asset manifest hashes every shipped file', () => {
  const manifest = parseManifest(readFileSync(join(SKILL, 'source/asset-manifest.toml'), 'utf8'));
  const files = listFiles(ASSETS).map((file) => relative(ASSETS, file)).sort();
  assert.equal(manifest.length, files.length);
  assert.deepEqual(manifest.map((entry) => entry.path).sort(), files.map((file) => `EXEC_ASSETS/${file}`).sort());
  for (const entry of manifest) {
    const text = normalized(join(SKILL, entry.path));
    assert.equal(entry.sha256, sha256(text), entry.path);
    assert.equal(Number(entry.lines), lineCount(text), entry.path);
    assert.equal(Number(entry.bytes), Buffer.byteLength(text, 'utf8'), entry.path);
  }
});

test('every asset file has one concept with exact content and hashes', async () => {
  const bundle = await loadBundle(join(SKILL, 'okf'));
  const inventory = readJson('source/asset-inventory.json');
  assert.equal(inventory.schema, 'okf-asset-inventory/v1');
  assert.equal(inventory.entries.length, 46);
  for (const entry of inventory.entries) {
    const concept = bundle.byId.get(entry.concept);
    assert.ok(concept, entry.concept);
    const text = normalized(join(SKILL, entry.asset));
    assert.equal(concept.frontmatter['x-asset-sha256'], sha256(text), entry.asset);
    assert.equal(concept.frontmatter['x-source-span'], `1-${lineCount(text)}`, entry.asset);
    assert.equal(concept.sources[0].resource, entry.asset, entry.asset);
    assert.ok(concept.sources[0].id, entry.asset);
    assert.match(concept.sources[0].id, /^exec-asset-[a-z0-9-]+$/, entry.asset);
    assert.ok(
      concept.frontmatter['x-requires'].length > 0,
      `${entry.concept} has no x-requires`,
    );
    assert.ok(
      conceptBody(concept).includes(text.trimEnd()),
      `${entry.asset} content is absent from ${entry.concept}`,
    );
  }
});

test('asset concepts are reachable and citable through the runtime', () => {
  const show = run(['show', 'pages/exec-assets/scripts-probe-py', '--format', 'json']);
  assert.equal(show.status, 0, show.stderr);
  const page = JSON.parse(show.stdout);
  assert.equal(page.id, 'pages/exec-assets/scripts-probe-py');
  assert.ok(page.body.includes('argparse'), 'probe body is absent');
  const sources = run(['sources', 'pages/exec-assets/scripts-probe-py', '--format', 'json']);
  assert.equal(sources.status, 0, sources.stderr);
  assert.equal(JSON.parse(sources.stdout).sources[0].resource, 'EXEC_ASSETS/scripts/probe.py');
});

test('an asset closure reaches its governing guide section', () => {
  const required = run(['required', '--entry', 'pages/exec-assets/scripts-probe-py', '--format', 'json']);
  assert.equal(required.status, 0, required.stderr);
  const closure = JSON.parse(required.stdout);
  assert.ok(closure.required.includes('pages/pre-okf-original/15-minimum-path-acceptance'));
  assert.ok(closure.required.includes('pages/pre-okf-original/preamble'));
  assert.equal(closure.cycles.length, 0);
});

test('the installer ships the execution-asset tree', () => {
  const target = mkdtempSync(join(tmpdir(), 'okf-assets-install-'));
  try {
    const result = spawnSync(process.execPath, [join(SKILL, 'install.js'), target], {
      cwd: SKILL,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const installed = join(target, '.claude/skills/natenv-okf');
    assert.ok(existsSync(join(installed, 'EXEC_ASSETS/scripts/probe.py')));
    assert.ok(existsSync(join(installed, 'source/asset-coverage.json')));
    assert.ok(existsSync(join(installed, 'okf/pages/exec-assets/index.md')));
    assert.equal(
      listFiles(join(installed, 'EXEC_ASSETS')).length,
      listFiles(ASSETS).length,
    );
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});
