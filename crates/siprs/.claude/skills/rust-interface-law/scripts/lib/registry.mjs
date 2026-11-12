import { splitRow } from './markdown.mjs';

const REGISTRY_HEADERS = [
  'ID',
  'Class',
  'Applicability',
  'Parent',
  'Source',
  'Verification',
  'Gate',
];
const STATEMENT_HEADERS = ['Statement', 'Short statement'];
export const RULE_ID = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+$/;

export function parseRegistryTable(block) {
  const registry = new Map();
  if (!block || block.kind !== 'table') return registry;
  const headers = block.headers ?? [];
  if (!REGISTRY_HEADERS.every((header) => headers.includes(header))) return registry;
  if (!STATEMENT_HEADERS.some((header) => headers.includes(header))) return registry;

  for (let rowIndex = 2; rowIndex < block.rows.length; rowIndex++) {
    const cells = splitRow(block.rows[rowIndex]);
    const id = (cells[0] ?? '').replace(/`/g, '').trim();
    if (RULE_ID.test(id)) registry.set(id, cells);
  }
  return registry;
}

export function assertBijection(atoms, registry) {
  const rules = atoms.filter((atom) => atom.type === 'Rule');
  const atomIds = new Set();
  for (const rule of rules) {
    if (atomIds.has(rule.id)) throw new Error('duplicate rule atom: ' + rule.id);
    atomIds.add(rule.id);
  }
  for (const id of registry.keys()) {
    if (!atomIds.has(id)) throw new Error('missing rule atom: ' + id);
  }
  for (const id of atomIds) {
    if (!registry.has(id)) throw new Error('extra rule atom: ' + id);
  }
  return true;
}

export function parseSkillRegistry(toml) {
  const entries = [];
  let current = null;
  for (const raw of String(toml).split('\n')) {
    const line = raw.trim();
    if (line === '[[skill]]') {
      current = {};
      entries.push(current);
      continue;
    }
    if (!current || line === '' || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"(.*)"$/);
    if (match) current[match[1]] = match[2];
  }
  return entries;
}

export function assertSkillRegistry(entries) {
  for (const entry of entries) {
    if (!entry.id || !entry.statement || !entry.verification) {
      throw new Error('incomplete skill registry entry: ' + (entry.id ?? '?'));
    }
    if (!/^(test|scan):/.test(entry.verification)) {
      throw new Error('skill registry entry without verification: ' + entry.id);
    }
  }
  return true;
}
