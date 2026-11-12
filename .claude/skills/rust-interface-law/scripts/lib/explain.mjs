import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { discoverWorkspace, mapCanonicalRoles } from './autoconfig.mjs';
import { parseRuleRow } from './render-ai.mjs';

const DOC_BY_PREFIX = {
  REST: '30-REST.md',
  WS: '31-WEBSOCKET.md',
  CLI: '32-CLI.md',
  GRPC: '33-GRPC.md',
  MCP: '34-MCP.md',
  A2A: '35-A2A.md',
  AUTH: '22-IDENTITY.md',
  AUTHZ: '22-IDENTITY.md',
  SSO: '22-IDENTITY.md',
  ID: '22-IDENTITY.md',
  IDN: '22-IDENTITY.md',
  OP: '21-OPERATION.md',
  OPS: '21-OPERATION.md',
  CONF: '40-CONFORMANCE.md',
  DOC: '45-DOCUMENTATION.md',
  VAL: '47-VALIDATION.md',
  BP: '48-IMPLEMENTATION-BLUEPRINT.md',
};

export function explainRule({ ruleId, lock, root }) {
  const rule = (lock.atoms ?? []).find((atom) => atom.type === 'Rule' && atom.id === ruleId);
  if (!rule) throw new Error('unknown rule: ' + ruleId);

  const parsed = parseRuleRow(rule.text);
  const prefix = ruleId.split('-')[0];
  const document = DOC_BY_PREFIX[prefix] ?? null;
  const ruleTokens = new Set((parsed?.requirement ?? '').toLowerCase().match(/[a-z]{4,}/g) ?? []);
  const examples = (document
    ? (lock.atoms ?? []).filter((atom) => atom.type === 'CodeBlock' && atom.source.endsWith(document))
    : []).sort((left, right) => scoreExample(right, ruleTokens) - scoreExample(left, ruleTokens));

  const lines = [
    '# Rule ' + ruleId,
    '',
    '| Field | Value |',
    '|---|---|',
    '| Requirement | ' + (parsed?.requirement ?? rule.text) + ' |',
    '| Class | ' + (parsed?.class ?? 'unknown') + ' |',
    '| Surface | ' + (parsed?.surface ?? 'unknown') + ' / ' + (parsed?.prefix ?? prefix) + ' |',
    '| Specification | ' + (parsed?.spec ?? 'unknown') + ' |',
    '| Verification | ' + (parsed?.verification ?? 'unknown') + ' |',
    '| Enforcement | ' + (parsed?.enforcement ?? 'unknown') + ' |',
    '| Source | `' + rule.source + '` |',
    '',
  ];

  if (document) {
    lines.push(
      '## Canonical examples',
      '',
      'Source document: `' + document + '`. Examples are patterns, not patches; adapt names and types to the target project.',
      '',
    );
    if (examples.length === 0) lines.push('No canonical code block in this document.', '');
    for (const example of examples) {
      lines.push('### `' + example.id + '`', '', example.text.trim(), '');
      if (example.id.includes('dependencies')) {
        lines.push('Dependency example only. Canonical crate names may not exist in the target workspace. Verify before copying.', '');
      }
    }
  } else {
    lines.push('No canonical example document is mapped for prefix `' + prefix + '`.', '');
  }

  const dependencyNames = dependencyNamesFrom(examples);
  if (dependencyNames.length > 0 && root) {
    const { members, declared, roles } = discoverDependencies(root);
    lines.push(
      '## Dependency check',
      '',
      '| Crate | Status |',
      '|---|---|',
      ...dependencyNames.map((name) => '| `' + name + '` | ' + dependencyStatus(name, members, declared, roles) + ' |'),
      '',
      'MISSING crates must be mapped to existing project crates or added explicitly; do not copy the example verbatim.',
      '',
    );
  }

  return lines.join('\n');
}

function dependencyNamesFrom(examples) {
  const names = new Set();
  for (const example of examples.filter((item) => item.id.includes('dependencies'))) {
    let inDependencies = false;
    for (const raw of example.text.split('\n')) {
      const line = raw.trim();
      if (line.startsWith('[') && line.endsWith(']')) {
        inDependencies = line === '[dependencies]';
        continue;
      }
      const match = inDependencies ? line.match(/^([A-Za-z0-9_-]+)\s*=/) : null;
      if (match) names.add(match[1]);
    }
  }
  return [...names];
}

function dependencyStatus(name, members, declared, roles) {
  if (members.has(name)) return 'workspace member';
  if (roles?.[name]) return 'mapped to `' + roles[name] + '`';
  if (declared.has(name)) return 'declared dependency';
  if (roles && Object.hasOwn(roles, name)) return 'MISSING — no project crate for canonical role';
  return 'MISSING — add dependency';
}

function discoverDependencies(root) {
  const members = new Set();
  let roles = {};
  try {
    const units = discoverWorkspace(root).units;
    for (const unit of units) members.add(unit.crate);
    roles = mapCanonicalRoles(units);
  } catch {
    // Discovery failure leaves members empty; declared dependencies still provide evidence.
  }
  const declared = new Set();
  walkManifests(root, 0, declared);
  return { members, declared, roles };
}

function walkManifests(dir, depth, declared) {
  if (depth > 8 || !existsSync(dir)) return;
  const manifest = join(dir, 'Cargo.toml');
  if (existsSync(manifest)) {
    let section = '';
    for (const raw of readFileSync(manifest, 'utf8').split('\n')) {
      const line = raw.trim();
      if (line.startsWith('[') && line.endsWith(']')) {
        section = line.slice(1, -1).trim();
        continue;
      }
      if (!['dependencies', 'dev-dependencies', 'build-dependencies', 'workspace.dependencies'].includes(section)) continue;
      const match = line.match(/^([A-Za-z0-9_-]+)\s*=/);
      if (match) declared.add(match[1]);
    }
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (['target', '.git', 'node_modules', 'dist', 'docs', 'fe'].includes(entry.name)) continue;
    walkManifests(join(dir, entry.name), depth + 1, declared);
  }
}

function scoreExample(example, ruleTokens) {
  if (example.id.includes('dependencies')) return -1;
  const slug = example.id.split('/')[1] ?? '';
  return slug.split('-').filter((token) => ruleTokens.has(token)).length;
}
