import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { discoverWorkspace, mapCanonicalRoles } from './autoconfig.mjs';
import { sha256 } from './redact.mjs';

const SCHEMA = 'rust-interface-law.scaffold/v1';
const INTERFACES = new Set(['rest', 'websocket', 'cli', 'grpc', 'mcp', 'a2a']);
const RULE_ID = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+$/;
const INCOMPLETE = /\b(?:todo!|unimplemented!|panic!)\s*\(/;
const SECRET = /(password\s*=|-----BEGIN|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})/;
const MAX_FILE_BYTES = 512 * 1024;
const CANONICAL_PLACEHOLDERS = ['operation-contract', 'identity-core', 'interface-contract', 'contract-macros'];

export function validatePlan({ root, plan, knownRules }) {
  const errors = [];
  const normalized = normalizePlan(plan);
  const packagePath = normalized.package;
  const { members, roles } = workspaceContext(root);

  if (normalized.schema !== SCHEMA) errors.push({ path: '(plan)', message: 'schema must be ' + SCHEMA });
  if (!INTERFACES.has(normalized.interface)) {
    errors.push({ path: '(plan)', message: 'interface must be one of ' + [...INTERFACES].join(', ') });
  }
  if (!isSafeRelative(packagePath)) errors.push({ path: packagePath, message: 'package must be a relative path' });
  if (!basename(packagePath).endsWith('-' + normalized.interface)) {
    errors.push({ path: packagePath, message: 'package must end with -' + normalized.interface });
  }
  if (!existsSync(join(root, packagePath))) {
    errors.push({ path: packagePath, message: 'package directory not found' });
  }

  const seen = new Set();
  for (const file of normalized.files) {
    const label = file.path;
    if (!isSafeRelative(label)) {
      errors.push({ path: label, message: 'path must be relative and must not contain ..' });
      continue;
    }
    if (!(label === packagePath || label.startsWith(packagePath + '/'))) {
      errors.push({ path: label, message: 'path must stay inside ' + packagePath });
    }
    if (seen.has(label)) errors.push({ path: label, message: 'duplicate path in plan' });
    seen.add(label);

    if (!Array.isArray(file.rules) || file.rules.length === 0) {
      errors.push({ path: label, message: 'rules must be a non-empty array' });
    } else {
      for (const rule of file.rules) {
        if (!RULE_ID.test(rule)) errors.push({ path: label, message: 'invalid rule id: ' + rule });
        else if (knownRules && !knownRules.has(rule)) errors.push({ path: label, message: 'unknown rule: ' + rule });
        if (!String(file.content ?? '').includes('RULE: ' + rule)) {
          errors.push({ path: label, message: 'content must annotate RULE: ' + rule });
        }
      }
    }

    if (!String(file.content ?? '').trim()) errors.push({ path: label, message: 'content must not be empty' });
    if (String(file.content ?? '').length > MAX_FILE_BYTES) errors.push({ path: label, message: 'content too large' });
    if (INCOMPLETE.test(file.content) && !String(file.content).includes('[::STUB::]')) {
      errors.push({ path: label, message: 'incomplete code requires a [::STUB::] marker' });
    }
    if (SECRET.test(file.content)) errors.push({ path: label, message: 'content contains a secret pattern' });
    for (const name of CANONICAL_PLACEHOLDERS) {
      if (!members.has(name) && referencesCrate(file.content, name)) {
        const mapped = roles[name];
        errors.push({
          path: label,
          message: 'canonical placeholder crate ' + name + ' is not a workspace member; '
            + (mapped ? 'use ' + mapped + ' instead' : 'create it or map it'),
        });
      }
    }

    if (file.mode === 'create') {
      if (existsSync(join(root, label))) errors.push({ path: label, message: 'create target already exists' });
    } else if (file.mode === 'append') {
      if (!isSafeMarker(file.marker)) errors.push({ path: label, message: 'append requires a single-line marker' });
      const target = join(root, label);
      if (!existsSync(target)) {
        errors.push({ path: label, message: 'append target does not exist' });
      } else {
        const matches = readFileSync(target, 'utf8').split('\n')
          .filter((line) => line.trim() === file.marker.trim()).length;
        if (matches !== 1) errors.push({ path: label, message: 'marker must appear exactly once' });
      }
    } else {
      errors.push({ path: label, message: 'mode must be create or append' });
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    plan: normalized,
    files: normalized.files.map((file) => ({
      path: file.path,
      action: file.mode,
      rules: file.rules ?? [],
    })),
    applied: [],
    backups: [],
    manifestPath: null,
  };
}

export function applyScaffold({ root, plan, write = false, knownRules, stateDir }) {
  const result = validatePlan({ root, plan, knownRules });
  if (!result.ok || !write) return result;

  const planHash = sha256(JSON.stringify(result.plan));
  const state = stateDir ?? join(root, 'target/law');
  const backupDir = join(state, 'scaffold-backup', planHash.slice(0, 12));
  const applied = [];
  const backups = [];
  const creates = result.plan.files.filter((file) => file.mode === 'create').sort((a, b) => a.path.localeCompare(b.path));
  const appends = result.plan.files.filter((file) => file.mode === 'append').sort((a, b) => a.path.localeCompare(b.path));

  try {
    for (const file of creates) {
      const target = join(root, file.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, file.content, { flag: 'wx' });
      applied.push({ path: file.path, mode: 'create', sha256: sha256(file.content) });
    }
    for (const file of appends) {
      const target = join(root, file.path);
      const backup = join(backupDir, file.path);
      mkdirSync(dirname(backup), { recursive: true });
      copyFileSync(target, backup);
      backups.push(backup);
      const lines = readFileSync(target, 'utf8').split('\n');
      const marker = lines.findIndex((line) => line.trim() === file.marker.trim());
      lines.splice(marker + 1, 0, ...file.content.replace(/\n$/, '').split('\n'));
      writeAtomic(target, lines.join('\n'));
      applied.push({ path: file.path, mode: 'append', sha256: sha256(file.content) });
    }
  } catch (error) {
    rollback({ root, applied, backups });
    return { ...result, ok: false, errors: [{ path: '(write)', message: error.message }], rolledBack: true };
  }

  const manifestPath = join(state, 'scaffold-manifest.json');
  writeAtomic(manifestPath, JSON.stringify({
    schema: SCHEMA,
    package: result.plan.package,
    interface: result.plan.interface,
    unit: result.plan.unit,
    plan_sha256: planHash,
    applied,
    backups,
  }, null, 2) + '\n');

  return { ...result, applied, backups, manifestPath };
}

export function renderScaffoldMarkdown(result) {
  if (!result.ok) {
    return [
      '# Scaffold — REJECTED',
      '',
      '| Path | Error |',
      '|---|---|',
      ...result.errors.map((error) => '| `' + error.path + '` | ' + error.message + ' |'),
      '',
      'No files written.',
      '',
    ].join('\n');
  }

  const lines = [
    '# Scaffold — ' + result.plan.package + ' (' + result.plan.interface + ')',
    '',
    '## Checks',
    '',
    '| Check | Result |',
    '|---|---|',
    '| Schema | `' + SCHEMA + '` |',
    '| Package | `' + result.plan.package + '` |',
    '| Interface | `' + result.plan.interface + '` |',
    '| Files | ' + result.files.length + ' |',
    '',
    '## Files',
    '',
    '| Action | Path | Rules |',
    '|---|---|---|',
    ...result.files.map((file) => '| ' + file.action + ' | `' + file.path + '` | ' + file.rules.join(', ') + ' |'),
    '',
    '## Content preview',
    '',
  ];

  for (const file of result.plan.files) {
    lines.push('### `' + file.path + '`', '', '```', file.content.trim(), '```', '');
  }

  if (result.applied.length > 0) {
    lines.push(
      '## Applied',
      '',
      '| Action | Path |',
      '|---|---|',
      ...result.applied.map((entry) => '| ' + entry.mode + ' | `' + entry.path + '` |'),
      '',
      'Manifest: `' + result.manifestPath + '`',
      '',
    );
  } else {
    lines.push('No files written. Re-run with `--write` to apply.', '');
  }

  return lines.join('\n');
}

function workspaceContext(root) {
  const members = new Set();
  let roles = {};
  try {
    const units = discoverWorkspace(root).units;
    for (const unit of units) members.add(unit.crate);
    roles = mapCanonicalRoles(units);
  } catch {
    // Discovery failure leaves members empty; placeholder references then fail closed.
  }
  return { members, roles };
}

function referencesCrate(content, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('\\buse\\s+' + escaped + '\\b').test(content)
    || new RegExp('\\bextern\\s+crate\\s+' + escaped + '\\b').test(content)
    || new RegExp('^\\s*' + escaped + '\\s*=', 'm').test(content);
}

function normalizePlan(plan) {
  return {
    schema: plan?.schema,
    package: posix(String(plan?.package ?? '')),
    interface: String(plan?.interface ?? ''),
    unit: plan?.unit ? String(plan.unit) : null,
    files: Array.isArray(plan?.files) ? plan.files.map((file) => ({
      path: posix(String(file.path ?? '')),
      mode: String(file.mode ?? ''),
      marker: file.marker ? String(file.marker) : null,
      rules: Array.isArray(file.rules) ? file.rules.map(String) : [],
      content: String(file.content ?? ''),
    })) : [],
  };
}

function isSafeRelative(path) {
  return path.length > 0 && !isAbsolute(path) && !path.split('/').includes('..')
    && resolve('/' + path).startsWith(sep);
}

function isSafeMarker(marker) {
  return typeof marker === 'string' && marker.trim().length > 0 && !marker.includes('\n');
}

function posix(path) {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

function writeAtomic(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = path + '.tmp';
  writeFileSync(temporary, text);
  renameSync(temporary, path);
}

function rollback({ root, applied, backups }) {
  for (const entry of applied.filter((item) => item.mode === 'create')) {
    rmSync(join(root, entry.path), { force: true });
  }
  for (const backup of backups) {
    const relative = backup.split('scaffold-backup/')[1];
    const target = join(root, relative.split('/').slice(1).join('/'));
    if (existsSync(backup) && existsSync(target)) copyFileSync(backup, target);
  }
}
