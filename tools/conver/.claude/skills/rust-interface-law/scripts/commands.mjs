import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAttestation, checkAttestation } from './lib/attest.mjs';
import { buildManifest, loadOkf } from './lib/closure.mjs';
import { deliverContext } from './lib/context.mjs';
import { checkExceptions } from './lib/exception.mjs';
import { runGate } from './lib/gate.mjs';
import { loadProfile, loadWorkspaceMap, matchUnits } from './lib/units.mjs';
import { parseToml } from './lib/toml.mjs';
import { redactText } from './lib/redact.mjs';
import { runScan } from './lib/scan.mjs';
import { shouldRun } from './lib/should-run.mjs';

const MUST_TYPES = new Set(['Rule', 'CodeBlock', 'ContractType', 'InterfaceBinding', 'Operation', 'Documentation', 'Conformance']);

export function resolveCommand(argv) {
  const options = parseArgs(argv);
  const profile = loadProfile(required(options, 'profile'));
  const map = loadWorkspaceMap(required(options, 'map'));
  const nodes = loadOkf(options.okf ?? join(skillRoot(), 'okf'));

  const units = options.unit
    ? map.units.filter((unit) => String(unit.id) === String(options.unit))
    : matchUnits(String(options.paths ?? '').split(',').filter(Boolean), map).units;
  if (units.length === 0) throw new Error('no unit matched');

  const manifest = buildManifest({ profile, units, nodes });
  const out = options.out ?? join(process.cwd(), 'manifest.json');
  writeAtomic(out, JSON.stringify(manifest, null, 2) + '\n');
  process.stdout.write('resolve: ' + manifest.nodes.length + ' nodes -> ' + out + '\n');
}

export function contextCommand(argv) {
  const options = parseArgs(argv);
  const manifest = JSON.parse(readFileSync(required(options, 'manifest'), 'utf8'));
  const result = deliverContext({
    manifest,
    phase: required(options, 'phase'),
    ledgerPath: options.ledger ?? join(process.cwd(), 'target/law-ledger.json'),
    replay: Boolean(options.replay),
  });
  for (const node of result.nodes) {
    process.stdout.write('<!-- node ' + node.id + ' ' + node.content_sha256 + ' -->\n');
    process.stdout.write(node.body + '\n');
  }
  process.stdout.write('<!-- hash ' + result.hash + ' -->\n');
}

export function gateCommand(argv) {
  const options = parseArgs(argv);
  const manifest = JSON.parse(readFileSync(required(options, 'manifest'), 'utf8'));
  const scans = options.scans ? loadScans(options.scans) : {};
  const report = runGate({ manifest, scans, cwd: process.cwd() });
  const out = options.out ?? join(process.cwd(), 'gate-report.json');
  writeAtomic(out, JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  process.exit(report.ok ? 0 : 50);
}

export function scanCommand(argv) {
  const options = parseArgs(argv);
  const input = options.input
    ? JSON.parse(readFileSync(options.input, 'utf8'))
    : { text: options.text ?? '', before: options.before ?? '', after: options.after ?? '' };
  const result = runScan(required(options, 'id'), input);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(result.ok ? 0 : 60);
}

export function attestCommand(argv) {
  const options = parseArgs(argv);
  const manifest = JSON.parse(readFileSync(required(options, 'manifest'), 'utf8'));
  const phase = required(options, 'phase');
  if (options.init) {
    process.stdout.write(JSON.stringify(buildAttestation(manifest, phase), null, 2) + '\n');
    return;
  }
  const rows = JSON.parse(readFileSync(required(options, 'rows'), 'utf8'));
  checkAttestation(manifest, phase, rows);
  process.stdout.write('attest: ok\n');
}

export function exceptionCommand(argv) {
  const options = parseArgs(argv);
  const document = parseToml(readFileSync(required(options, 'exceptions'), 'utf8'));
  const rules = new Set(String(options.rules ?? '').split(',').filter(Boolean));
  checkExceptions(document.exception ?? [], {
    now: options.now ?? new Date().toISOString().slice(0, 10),
    rules,
  });
  process.stdout.write('exception: ok\n');
}

export function shouldRunCommand(argv) {
  const options = parseArgs(argv);
  const profile = loadProfile(required(options, 'profile'));
  const map = loadWorkspaceMap(required(options, 'map'));
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const paths = input.tool_input?.file_path ? [input.tool_input.file_path] : [];
  process.stdout.write(JSON.stringify(shouldRun({ paths, profile, map })) + '\n');
}

export function renderCommand(argv) {
  const options = parseArgs(argv);
  const lock = JSON.parse(readFileSync(required(options, 'lock'), 'utf8'));
  const outDir = options.out ?? join(skillRoot(), 'okf');
  renderOkf(lock, outDir);
  process.stdout.write('render: ' + lock.atoms.length + ' nodes -> ' + outDir + '\n');
}

export function checkCommand(argv) {
  const options = parseArgs(argv);
  const action = options._[0] ?? 'lint';
  const dir = options.okf ?? join(skillRoot(), 'okf');
  const lock = options.lock ? JSON.parse(readFileSync(options.lock, 'utf8')) : null;
  const nodes = loadOkf(dir);
  const ids = new Set();

  if (action === 'lint' || action === 'audit') {
    for (const node of nodes) {
      if (!node.type || !node.id || !node.phase || !node.delivery) {
        throw new Error('lint: incomplete frontmatter: ' + node.file);
      }
      if (ids.has(node.id)) throw new Error('lint: duplicate id: ' + node.id);
      ids.add(node.id);
    }
    if (!existsSync(join(dir, 'index.md')) || !existsSync(join(dir, 'log.md'))) {
      throw new Error('lint: index.md or log.md missing');
    }
  }

  if (action === 'graph' || action === 'audit') {
    for (const node of nodes) {
      for (const required of node.requires ?? []) {
        if (!nodes.some((candidate) => candidate.id === required)) {
          throw new Error('graph: dangling requires: ' + node.id + ' -> ' + required);
        }
      }
    }
  }

  if (action === 'coverage' || action === 'audit') {
    if (!lock) throw new Error('coverage: --lock required');
    const nodeIds = new Set(nodes.map((node) => node.id));
    for (const atom of lock.atoms) {
      if (!nodeIds.has(atom.id)) throw new Error('coverage: missing node: ' + atom.id);
    }
    if (nodeIds.size !== lock.atoms.length) throw new Error('coverage: extra node');
  }

  process.stdout.write('check ' + action + ': ' + nodes.length + ' nodes ok\n');
}

export function packageCommand(argv) {
  const options = parseArgs(argv);
  const manifestPath = options.manifest ?? join(skillRoot(), 'source/manifest.toml');
  const manifest = parseToml(readFileSync(manifestPath, 'utf8'));
  const redaction = JSON.parse(readFileSync(join(skillRoot(), 'source/redaction.sha256.json'), 'utf8'));
  const repo = findRepoRoot(skillRoot());
  const parts = ['# Source View', '', 'Generated from the source documents. Do not edit.', ''];
  for (const file of manifest.file ?? []) {
    const path = existsSync(file.path) ? file.path : join(repo, file.path);
    const text = redactText(readFileSync(path, 'utf8'), redaction);
    parts.push('# Source: ' + file.path, '', text.replace(/\n+$/, ''), '');
  }
  const text = parts.join('\n');
  const out = options.out ?? join(skillRoot(), 'okf/source.md');
  writeAtomic(out, text);
  if (options.check) {
    const baseline = join(skillRoot(), 'okf/source.baseline.md');
    if (!existsSync(baseline)) throw new Error('package: baseline missing');
    if (readFileSync(baseline, 'utf8') !== text) throw new Error('package: drift');
  }
  process.stdout.write('package: ' + (manifest.file ?? []).length + ' files -> ' + out + '\n');
}

export function rebuildCommand(argv) {
  const options = parseArgs(argv);
  const root = resolve(options.root ?? skillRoot());
  const repo = findRepoRoot(root);
  const temporary = mkdtempSync(join(tmpdir(), 'law-rebuild-'));
  try {
    execFileSync(process.execPath, [
      join(root, 'scripts/ingest.mjs'),
      'classify',
      '--source', sourceDirFor(repo),
      '--lock', join(temporary, 'atoms.lock.json'),
      '--coverage', join(temporary, 'coverage.json'),
      '--report', join(temporary, 'coverage.md'),
    ], { cwd: repo, stdio: 'ignore' });

    for (const file of ['atoms.lock.json', 'coverage.json', 'coverage.md']) {
      if (readFileSync(join(root, file), 'utf8') !== readFileSync(join(temporary, file), 'utf8')) {
        throw new Error('drift: ' + file);
      }
    }

    renderOkf(JSON.parse(readFileSync(join(temporary, 'atoms.lock.json'), 'utf8')), join(temporary, 'okf'));
    for (const file of ['index.md', 'log.md']) {
      if (readFileSync(join(root, 'okf', file), 'utf8') !== readFileSync(join(temporary, 'okf', file), 'utf8')) {
        throw new Error('drift: okf/' + file);
      }
    }
    process.stdout.write('rebuild: byte-identical\n');
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

export function renderOkf(lock, outDir) {
  const nodesDir = join(outDir, 'nodes');
  mkdirSync(nodesDir, { recursive: true });
  const used = new Set();
  const rows = [];

  for (const atom of lock.atoms) {
    const phase = phaseFor(atom);
    const delivery = MUST_TYPES.has(atom.type) ? 'must' : 'reference';
    const safe = uniqueName(atom.id, used);
    const frontmatter = [
      '---',
      'type: ' + atom.type,
      'id: ' + atom.id,
      'phase: ' + phase,
      'delivery: ' + delivery,
      'applies_to: ' + appliesFor(atom),
      'requires: []',
      'references: []',
      'content_sha256: ' + atom.content_sha256,
      'source: ' + atom.source,
      '---',
      '',
    ].join('\n');
    writeAtomic(join(nodesDir, safe + '.md'), frontmatter + (atom.text ?? '') + '\n');
    rows.push('| `' + atom.id + '` | ' + atom.type + ' | [node](./nodes/' + safe + '.md) |');
  }

  const index = ['# OKF Index', '', '| ID | Type | Node |', '|---|---|---|', ...rows, ''].join('\n');
  writeAtomic(join(outDir, 'index.md'), index);
  writeAtomic(join(outDir, 'log.md'), [
    '# OKF Log',
    '',
    '- spec_version: ' + lock.spec_version,
    '- nodes: ' + lock.atoms.length,
    '- lock: ' + lock.source_manifest_sha256,
    '',
  ].join('\n'));
}

function phaseFor(atom) {
  if (atom.type === 'Rule') {
    const prefix = atom.id.split('-')[0];
    if (['AUTH', 'OPS', 'OP', 'SEC'].includes(prefix)) return 'operation';
    if (['REST', 'WS', 'CLI', 'GRPC', 'MCP', 'A2A'].includes(prefix)) return 'adapter';
    if (['DOC', 'VAL', 'BP'].includes(prefix)) return 'docs';
    if (prefix === 'CONF') return 'conformance';
    if (['ARC', 'CORE'].includes(prefix)) return 'core';
    if (prefix === 'APP') return 'scope';
    if (prefix === 'MIG') return 'review';
    return 'operation';
  }
  const file = atom.source.split('/').pop();
  if (/^(00|10)/.test(file)) return 'contract';
  if (file.startsWith('20')) return 'core';
  if (/^(21|22)/.test(file)) return 'operation';
  if (/^(30|31|32|33|34|35)/.test(file)) return 'adapter';
  if (file.startsWith('40')) return 'conformance';
  if (/^(45|47|48)/.test(file)) return 'docs';
  if (file.startsWith('50')) return 'scope';
  if (file.startsWith('90')) return 'review';
  return 'contract';
}

function appliesFor(atom) {
  const file = atom.source.split('/').pop();
  if (file.startsWith('30')) return 'rest';
  if (file.startsWith('31')) return 'websocket';
  if (file.startsWith('32')) return 'cli';
  if (file.startsWith('33')) return 'grpc';
  if (file.startsWith('34')) return 'mcp';
  if (file.startsWith('35')) return 'a2a';
  return 'all';
}

function uniqueName(id, used) {
  const base = id.replace(/[^A-Za-z0-9._-]/g, '-');
  let candidate = base;
  let index = 2;
  while (used.has(candidate)) {
    candidate = base + '-' + index;
    index++;
  }
  used.add(candidate);
  return candidate;
}

function findRepoRoot(start) {
  let current = resolve(start);
  while (true) {
    if (existsSync(join(current, 'docs/IMPLEMENTATION-SPEC'))
      || existsSync(join(current, 'docs/archive/IMPLEMENTATION-SPEC'))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) throw new Error('repository root not found');
    current = parent;
  }
}

function sourceDirFor(repo) {
  const archived = join(repo, 'docs/archive/IMPLEMENTATION-SPEC');
  return existsSync(archived) ? archived : join(repo, 'docs/IMPLEMENTATION-SPEC');
}

function loadScans(path) {
  const text = readFileSync(path, 'utf8');
  if (path.endsWith('.toml')) {
    const document = parseToml(text);
    return Object.fromEntries((document.scan ?? []).map((scan) => [scan.id, scan]));
  }
  return JSON.parse(text);
}

function parseArgs(argv) {
  const options = { _: [] };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      options._.push(arg);
      continue;
    }
    const body = arg.slice(2);
    const equals = body.indexOf('=');
    if (equals >= 0) {
      options[body.slice(0, equals)] = body.slice(equals + 1);
    } else if (index + 1 < argv.length && !argv[index + 1].startsWith('--')) {
      options[body] = argv[++index];
    } else {
      options[body] = true;
    }
  }
  return options;
}

function required(options, key) {
  if (!options[key]) throw new Error('--' + key + ' is required');
  return options[key];
}

function skillRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..');
}

function writeAtomic(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = path + '.tmp';
  writeFileSync(temporary, text);
  renameSync(temporary, path);
}
