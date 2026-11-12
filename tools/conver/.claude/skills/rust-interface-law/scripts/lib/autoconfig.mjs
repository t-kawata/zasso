import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

const EXCLUDED_DIRS = new Set([
  'target',
  '.git',
  'node_modules',
  'dist',
  'docs',
  'fe',
  'progress-gif',
  '.claude',
  'src',
  'tests',
  'benches',
  'examples',
]);
const MAX_DEPTH = 8;
const INTERFACES = ['rest', 'websocket', 'cli', 'grpc', 'mcp', 'a2a'];
const PHASES_BY_ROLE = {
  rest: ['contract', 'core', 'operation', 'adapter', 'docs', 'conformance'],
  websocket: ['contract', 'core', 'operation', 'adapter', 'docs', 'conformance'],
  cli: ['contract', 'core', 'operation', 'adapter', 'docs', 'conformance'],
  grpc: ['contract', 'core', 'operation', 'adapter', 'docs', 'conformance'],
  mcp: ['contract', 'core', 'operation', 'adapter', 'docs', 'conformance'],
  a2a: ['contract', 'core', 'operation', 'adapter', 'docs', 'conformance'],
  operation: ['contract', 'core', 'operation'],
  adapter: ['contract', 'core', 'operation', 'adapter'],
  conformance: ['contract', 'core', 'conformance'],
  core: ['contract', 'core'],
};

export function discoverWorkspace(root) {
  const crates = discoverCrates(root);
  const units = crates.map((crate) => toUnit(root, crate));
  const seen = new Map();
  for (const unit of units) {
    const count = seen.get(unit.id) ?? 0;
    seen.set(unit.id, count + 1);
    if (count > 0) unit.id = unit.id + '-' + (count + 1);
  }
  units.sort((left, right) => left.paths[0].localeCompare(right.paths[0]));

  return {
    profile: {
      project: { name: basename(root), spec_version: '0.3.2' },
      profiles: {
        rust: true,
        rest: units.some((unit) => unit.interfaces.includes('rest')),
        mcp: units.some((unit) => unit.interfaces.includes('mcp')),
        websocket: units.some((unit) => unit.interfaces.includes('websocket')),
        cli: units.some((unit) => unit.interfaces.includes('cli')),
        grpc: units.some((unit) => unit.interfaces.includes('grpc')),
        a2a: units.some((unit) => unit.interfaces.includes('a2a')),
      },
      auth: { jwt: false, sso: 'disabled', local_only: true },
      docs: { generate: true, english: true, out_dir: 'docs/generated' },
    },
    units,
  };
}

function discoverCrates(root) {
  const directories = new Set();

  if (hasCrateSource(root)) directories.add(root);
  walkCrates(join(root, 'crates'), 0, directories);
  walkManifests(root, 0, directories);

  return [...directories]
    .filter((dir) => hasCrateSource(dir))
    .sort();
}

function walkCrates(dir, depth, directories) {
  if (depth > MAX_DEPTH || !existsSync(dir)) return;
  if (hasCrateSource(dir)) directories.add(dir);
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || EXCLUDED_DIRS.has(entry.name)) continue;
    walkCrates(join(dir, entry.name), depth + 1, directories);
  }
}

function walkManifests(dir, depth, directories) {
  if (depth > MAX_DEPTH || !existsSync(dir)) return;
  const manifest = join(dir, 'Cargo.toml');
  if (existsSync(manifest)) {
    const text = readFileSync(manifest, 'utf8');
    if (text.includes('[package]')) directories.add(dir);
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || EXCLUDED_DIRS.has(entry.name)) continue;
    walkManifests(join(dir, entry.name), depth + 1, directories);
  }
}

function hasCrateSource(dir) {
  const source = join(dir, 'src');
  return existsSync(source) && statSync(source).isDirectory();
}

function toUnit(root, dir) {
  const name = crateName(dir);
  const role = roleFor(name, relative(root, dir));
  return {
    id: name,
    crate: name,
    role,
    interfaces: INTERFACES.includes(role) ? [role] : [],
    paths: [relative(root, dir).replace(/\\/g, '/') + '/**'],
    phases: PHASES_BY_ROLE[role] ?? PHASES_BY_ROLE.core,
  };
}

function crateName(dir) {
  const manifest = join(dir, 'Cargo.toml');
  if (existsSync(manifest)) {
    const match = readFileSync(manifest, 'utf8').match(/\[package\][\s\S]*?^name\s*=\s*"([^"]+)"/m);
    if (match) return match[1];
  }
  return basename(dir);
}

function roleFor(name, path) {
  const interfaceName = INTERFACES.find((candidate) =>
    name.split(/[-_]/).includes(candidate));
  if (interfaceName) return interfaceName;
  if (name.includes('websocket')) return 'websocket';
  if (path.includes('/conformance/') || name.includes('conformance')) return 'conformance';
  if (name.includes('operation')) return 'operation';
  if (path.includes('/adapters/') || name.includes('adapter')) return 'adapter';
  return 'core';
}

export function mapCanonicalRoles(units) {
  const core = units.filter((unit) => unit.role === 'core');
  const pickCore = (patterns) => core
    .map((unit) => ({
      unit,
      score: patterns.reduce((total, pattern, index) =>
        total + (unit.id.includes(pattern) ? patterns.length - index : 0), 0),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score
      || left.unit.id.length - right.unit.id.length)[0]?.unit.id ?? null;
  const identity = pickCore(['identity', 'core'])
    ?? (core.length === 1 ? core[0].id : null);

  return {
    'identity-core': identity,
    'operation-contract': units.find((unit) => unit.role === 'operation')?.id ?? null,
    'interface-contract': pickCore(['ports', 'interface', 'contract', 'types', 'protocol']),
    'contract-macros': units.find((unit) => unit.id.includes('macro'))?.id ?? null,
  };
}

export function renderProfileToml(profile) {
  const lines = [
    '[project]',
    'name = "' + profile.project.name + '"',
    'spec_version = "' + profile.project.spec_version + '"',
    '',
    '[profiles]',
  ];
  for (const key of ['rust', 'rest', 'mcp', 'websocket', 'cli', 'grpc', 'a2a']) {
    lines.push(key + ' = ' + profile.profiles[key]);
  }
  lines.push(
    '',
    '[auth]',
    'jwt = ' + profile.auth.jwt,
    'sso = "' + profile.auth.sso + '"',
    'local_only = ' + profile.auth.local_only,
    '',
    '[docs]',
    'generate = ' + profile.docs.generate,
    'english = ' + profile.docs.english,
    'out_dir = "' + profile.docs.out_dir + '"',
    '',
  );
  return lines.join('\n');
}

export function renderMapToml(units) {
  const lines = [];
  for (const unit of units) {
    lines.push(
      '[[unit]]',
      'id = "' + unit.id + '"',
      'crate = "' + unit.crate + '"',
      'role = "' + unit.role + '"',
      'interfaces = ' + JSON.stringify(unit.interfaces),
      'paths = ' + JSON.stringify(unit.paths),
      'phases = ' + JSON.stringify(unit.phases),
      '',
    );
  }
  return lines.join('\n');
}
