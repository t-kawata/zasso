import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverWorkspace, renderProfileToml, renderMapToml } from '../scripts/lib/autoconfig.mjs';
import { scanImplementation } from '../scripts/lib/process-scan.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const cli = join(root, 'scripts/cli.mjs');

function makeRepo() {
  const repo = mkdtempSync(join(tmpdir(), 'law-repo-'));
  const crates = [
    'crates/app-rest',
    'crates/transports/app-grpc',
    'crates/app-operation',
    'crates/adapters/app-adapter',
    'crates/conformance/app-conformance',
    'crates/app-core',
  ];
  for (const crate of crates) {
    mkdirSync(join(repo, crate, 'src'), { recursive: true });
    writeFileSync(join(repo, crate, 'src/lib.rs'), 'pub fn ready() {}\n');
  }
  return repo;
}

test('discoverWorkspace derives units, roles, interfaces, and phases', () => {
  const repo = makeRepo();
  try {
    const discovered = discoverWorkspace(repo);
    const byId = Object.fromEntries(discovered.units.map((unit) => [unit.id, unit]));

    assert.equal(byId['app-rest'].role, 'rest');
    assert.deepEqual(byId['app-rest'].interfaces, ['rest']);
    assert.deepEqual(byId['app-rest'].phases, ['contract', 'core', 'operation', 'adapter', 'docs', 'conformance']);

    assert.equal(byId['app-grpc'].role, 'grpc');
    assert.deepEqual(byId['app-grpc'].interfaces, ['grpc']);

    assert.equal(byId['app-operation'].role, 'operation');
    assert.deepEqual(byId['app-operation'].phases, ['contract', 'core', 'operation']);

    assert.equal(byId['app-adapter'].role, 'adapter');
    assert.deepEqual(byId['app-adapter'].phases, ['contract', 'core', 'operation', 'adapter']);

    assert.equal(byId['app-conformance'].role, 'conformance');
    assert.deepEqual(byId['app-conformance'].phases, ['contract', 'core', 'conformance']);

    assert.equal(byId['app-core'].role, 'core');
    assert.deepEqual(byId['app-core'].phases, ['contract', 'core']);

    assert.equal(discovered.profile.profiles.rest, true);
    assert.equal(discovered.profile.profiles.grpc, true);
    assert.deepEqual(discoverWorkspace(repo), discovered);

    assert.match(renderProfileToml(discovered.profile), /\[profiles\]/);
    assert.match(renderMapToml(discovered.units), /\[\[unit\]\]/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('scanImplementation rejects unmarked incomplete code and secrets', () => {
  const repo = mkdtempSync(join(tmpdir(), 'law-scan-'));
  try {
    const file = join(repo, 'clean.rs');
    writeFileSync(file, 'pub fn ready() {}\n');
    assert.equal(scanImplementation({ root: repo, paths: ['clean.rs'] }).ok, true);
    assert.equal(scanImplementation({ root: repo, paths: [] }).ok, false);

    writeFileSync(file, 'pub fn ready() { todo!() }\n');
    assert.equal(scanImplementation({ root: repo, paths: ['clean.rs'] }).ok, false);

    writeFileSync(file, '// [::STUB::] MUST RESOLVE: later\npub fn ready() { todo!() }\n');
    assert.equal(scanImplementation({ root: repo, paths: ['clean.rs'] }).ok, true);

    writeFileSync(file, 'const PASSWORD: &str = "password=hunter2";\n');
    assert.equal(scanImplementation({ root: repo, paths: ['clean.rs'] }).ok, false);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('interface closure includes core and docs rules, excludes scope and review', () => {
  const repo = makeRepo();
  const outDir = mkdtempSync(join(tmpdir(), 'law-closure-'));
  try {
    const manifestPath = join(outDir, 'manifest.json');
    execFileSync(process.execPath, [
      cli, 'resolve',
      '--root', repo,
      '--paths', 'crates/app-rest/src/lib.rs',
      '--out', manifestPath,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const ids = new Set(manifest.nodes.map((node) => node.id));
    assert.deepEqual(manifest.phases, ['contract', 'core', 'operation', 'adapter', 'docs', 'conformance']);
    assert.ok(ids.has('ARC-02'));
    assert.ok(ids.has('VAL-01'));
    assert.ok(!ids.has('APP-01'));
    assert.ok(!ids.has('MIG-01'));
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(outDir, { recursive: true, force: true });
  }
});

test('resolve auto-discovers the workspace and attaches process verification', () => {
  const repo = makeRepo();
  const outDir = mkdtempSync(join(tmpdir(), 'law-out-'));
  try {
    const manifestPath = join(outDir, 'manifest.json');
    const output = execFileSync(process.execPath, [
      cli, 'resolve',
      '--root', repo,
      '--paths', 'crates/app-rest/src/lib.rs',
      '--out', manifestPath,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

    assert.match(output, /# Resolved closure/);
    assert.match(output, /auto/);

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.root, repo);
    assert.deepEqual(manifest.changed, ['crates/app-rest/src/lib.rs']);
    assert.deepEqual(manifest.units.map((unit) => unit.id), ['app-rest']);
    assert.ok(manifest.nodes.filter((node) => node.delivery === 'must')
      .every((node) => node.verify.some((entry) => entry.mode === 'process')));

    assert.ok(readFileSync(join(outDir, 'RULES-PROFILE.auto.toml'), 'utf8').includes('[profiles]'));
    assert.ok(readFileSync(join(outDir, 'workspace-map.auto.toml'), 'utf8').includes('[[unit]]'));

    const implementationReport = join(outDir, 'implementation.json');
    writeFileSync(implementationReport, JSON.stringify({
      statuses: manifest.nodes
        .filter((node) => /^(IMP|REST|WS|CLI|GRPC|MCP|A2A)-\d+$/.test(node.id))
        .map((node) => ({ rule: node.id, status: 'machine_verified', evidence: { fixture: true } })),
    }));

    const cleanReport = join(outDir, 'gate-clean.json');
    execFileSync(process.execPath, [
      cli, 'gate',
      '--manifest', manifestPath,
      '--implementation', implementationReport,
      '--out', cleanReport,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const clean = JSON.parse(readFileSync(cleanReport, 'utf8'));
    assert.equal(clean.machinePass, true);

    writeFileSync(join(repo, 'crates/app-rest/src/lib.rs'), 'pub fn ready() { todo!() }\n');
    const dirtyReport = join(outDir, 'gate-dirty.json');
    assert.throws(
      () => execFileSync(process.execPath, [
        cli, 'gate',
        '--manifest', manifestPath,
        '--implementation', implementationReport,
        '--out', dirtyReport,
      ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
      (error) => error.status === 50,
    );
    const dirty = JSON.parse(readFileSync(dirtyReport, 'utf8'));
    assert.equal(dirty.machinePass, false);
    assert.ok(dirty.statuses.some((entry) => entry.status === 'failed'));
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(outDir, { recursive: true, force: true });
  }
});
