/**
 * Generate an OKF v0.2 law bundle from the registry and source documents.
 *
 * One registry row becomes one Rule concept. Each source section becomes a
 * Section concept so the full normative prose, tables, and examples remain
 * reachable through body links.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { parseTree } from '@okforest/okf';
import { writeConcept } from '../okf-core/authoring/write.mjs';
import { writeDirectoryIndexes } from '../okf-core/authoring/index.mjs';
import { writeLog } from '../okf-core/authoring/log.mjs';
import { loadBundle } from '../okf-core/index.mjs';
import { redactText } from './lib/redact.mjs';

const RULE_PATTERN = /\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+\b/g;
const PHASE_ORDER = ['scope', 'contract', 'core', 'operation', 'adapter', 'docs', 'conformance', 'review'];

export function generateLawBundle({
  sourceRoot,
  sourcePaths = null,
  outDir,
  sourceDir = join(dirname(outDir), 'source'),
  date = '1970-01-01',
  skillName = 'rust-interface-law',
} = {}) {
  const redaction = loadRedaction(sourceDir);
  const documents = readDocuments({ sourceRoot, sourcePaths, redaction });
  const registryText = findRegistryText(documents);
  const registry = parseRuleRegistry(registryText);
  if (registry.length === 0) throw new Error('RULE_REGISTRY_EMPTY');

  const sections = buildSections({ documents, date });
  const rules = buildRules({ registry, documents, sections, date });

  for (const section of sections) writeConcept({ outDir, concept: section });
  for (const rule of rules) writeConcept({ outDir, concept: rule });

  const ruleMapPath = join(sourceDir, 'rule-concepts.json');
  const lockPath = join(dirname(outDir), 'atoms.lock.json');
  writeFile(ruleMapPath, `${JSON.stringify(renderRuleMap(rules), null, 2)}\n`);
  writeFile(lockPath, `${JSON.stringify(renderLock({ rules, sections, documents }), null, 2)}\n`);
  writeFile(join(sourceDir, 'delivery.json'), `${JSON.stringify({ schema: 'law-delivery/v2', rules: rules.map((rule) => ({ rule_id: rule.rule_id, concept_id: rule.id, decision: 'must' })) }, null, 2)}\n`);
  writeFile(join(sourceDir, 'coverage.json'), `${JSON.stringify({ schema: 'law-coverage/v2', rules: rules.length, sections: sections.length, sources: documents.length }, null, 2)}\n`);
  writeFile(join(sourceDir, 'coverage.md'), `# Coverage\n\n- Rules: ${rules.length}\n- Sections: ${sections.length}\n- Sources: ${documents.length}\n`);
  writeFile(join(sourceDir, 'okf-log.json'), `${JSON.stringify({ schema: 'okf-log/v1', entries: [{ date, text: `Generated ${rules.length} rule concepts and ${sections.length} section concepts.` }] }, null, 2)}\n`);
  writeFile(join(sourceDir, 'source-view.md'), renderSourceView(documents));
  writeFile(join(sourceDir, 'source.baseline.md'), renderSourceView(documents));
  writeFile(join(sourceDir, 'law-bundle.json'), `${JSON.stringify({
    schema: 'law-bundle/v1',
    skill: skillName,
    generated_at: date,
    rules: rules.length,
    sections: sections.length,
    sources: documents.map((document) => document.alias),
  }, null, 2)}\n`);

  const bundle = loadBundleSync(outDir);
  writeDirectoryIndexes({ bundle, outDir });
  writeLog({ outDir, entries: [{ date, text: `Generated ${rules.length} rule concepts and ${sections.length} section concepts.` }] });

  return { rules, sections, ruleMapPath, lockPath, outDir, documents };
}

// [::TICKET::] PX-426, PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-426|PX-425) --for-spec --no-implementation-order`.
function readDocuments({ sourceRoot, sourcePaths, redaction = [] }) {
  const paths = sourcePaths ?? readdirSync(sourceRoot)
    .filter((file) => file.endsWith('.md'))
    .sort();
  return paths.map((path) => {
    const absolute = join(sourceRoot, path);
    return {
      alias: `sources/${basename(path)}`,
      path,
      text: redactText(readFileSync(absolute, 'utf8').replace(/\r\n?/g, '\n'), redaction),
    };
  });
}

// [::TICKET::] PX-426, PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-426|PX-425) --for-spec --no-implementation-order`.
function loadRedaction(sourceDir) {
  const path = join(sourceDir, 'redaction.sha256.json');
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];
}

// [::TICKET::] PX-426, PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-426|PX-425) --for-spec --no-implementation-order`.
function findRegistryText(documents) {
  const registry = documents.find((document) => document.path.includes('15-RULE-REGISTRY'));
  if (!registry) throw new Error('RULE_REGISTRY_MISSING');
  return registry.text;
}

export function parseRuleRegistry(text) {
  const rows = [];
  for (const line of String(text).split('\n')) {
    const match = line.match(/^\|\s*`([A-Z][A-Z0-9-]*-\d+)`\s*\|/);
    if (!match) continue;
    const cells = line.split('|').map((cell) => cell.trim()).filter((cell) => cell.length > 0);
    if (cells.length !== 8) continue;
    rows.push({
      id: match[1],
      ruleClass: cells[1],
      applicability: cells[2],
      parent: cells[3],
      sourcePart: cells[4],
      statement: cells[5],
      verification: cells[6],
      gate: cells[7],
    });
  }
  return rows;
}

// [::TICKET::] PX-426, PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-426|PX-425) --for-spec --no-implementation-order`.
function buildSections({ documents, date }) {
  const sections = [];
  for (const document of documents) {
    const documentSlug = slug(basename(document.path, '.md'));
    const lines = document.text.split('\n');
    const boundaries = [];
    for (let index = 0; index < lines.length; index += 1) {
      if (/^##\s+\S/.test(lines[index])) boundaries.push(index);
    }
    if (boundaries.length === 0) {
      sections.push(makeSection({ document, documentSlug, title: titleOf(document.text) ?? documentSlug, body: document.text, start: 1, end: lines.length, date }));
      continue;
    }
    if (boundaries[0] > 0) {
      const preamble = lines.slice(0, boundaries[0]).join('\n').trim();
      if (preamble.length > 0) sections.push(makeSection({ document, documentSlug, title: titleOf(document.text) ?? documentSlug, body: preamble, start: 1, end: boundaries[0], date }));
    }
    boundaries.forEach((start, index) => {
      const end = index + 1 < boundaries.length ? boundaries[index + 1] : lines.length;
      const title = lines[start].replace(/^##\s+/, '').trim();
      sections.push(makeSection({ document, documentSlug, title, body: lines.slice(start, end).join('\n').trim(), start: start + 1, end, date }));
    });
  }
  return sections;
}

// [::TICKET::] PX-426, PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-426|PX-425) --for-spec --no-implementation-order`.
function makeSection({ document, documentSlug, title, body, start, end, date }) {
  const sectionSlug = slug(title);
  return {
    id: `sources/${documentSlug}/${sectionSlug}`,
    path: `sources/${documentSlug}/${sectionSlug}.md`,
    title,
    sourceAlias: document.alias,
    start,
    end,
    frontmatter: {
      type: 'Section',
      title,
      description: firstParagraph(body),
      sources: [{ resource: document.alias, id: `${documentSlug}-${sectionSlug}`, title }],
      generated: { by: 'build-law-skill', at: date },
      verified: [{ by: 'human:law-review', at: date }],
      status: 'stable',
      'x-document': document.alias,
      'x-source-span': `${start}-${end}`,
    },
    body: `${body}\n`,
  };
}

// [::TICKET::] PX-426, PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-426|PX-425) --for-spec --no-implementation-order`.
function buildRules({ registry, documents, sections, date }) {
  const registryIds = new Set(registry.map((rule) => rule.id));
  const rules = registry.map((row) => {
    const location = locateRule(row.id, documents, sections);
    const section = location?.section ?? sections[0];
    const conceptId = `rules/${row.ruleClass.toLowerCase()}/${row.id.toLowerCase()}`;
    const explicit = collectRequires(row.statement, '', registryIds, row.id);
    const globalPrerequisites = row.id === 'APP-01'
      ? []
      : (row.id === 'ARC-01' ? ['APP-01'] : ['APP-01', 'ARC-01']);
    const requiredRules = [...new Set([
      ...globalPrerequisites.filter((id) => registryIds.has(id) && id !== row.id),
      ...explicit,
    ])].sort();
    const phase = phaseFor(row.id);
    const title = `${row.id} — ${row.statement}`;
    const body = renderRuleBody({ row, section, ruleId: row.id });
    return {
      id: conceptId,
      concept_id: conceptId,
      path: `${conceptId}.md`,
      rule_id: row.id,
      frontmatter: {
        type: 'Rule',
        title,
        description: row.statement,
        sources: [{ resource: section?.sourceAlias ?? 'sources/15-RULE-REGISTRY.md', id: row.id.toLowerCase(), title: row.id }],
        generated: { by: 'build-law-skill', at: date },
        verified: [{ by: 'human:law-review', at: date }],
        status: 'stable',
        'x-rule-id': row.id,
        'x-rule-class': row.ruleClass,
        'x-applies-to': appliesFor(row),
        'x-parent': row.parent,
        'x-source-part': row.sourcePart,
        'x-verification': row.verification,
        'x-enforcement': row.gate,
        'x-phase': phase,
        'x-source-span': `${location?.line ?? 1}-${location?.line ?? 1}`,
        'x-requires': [],
      },
      body,
      requires_rules: requiredRules,
    };
  });

  const byRuleId = new Map(rules.map((rule) => [rule.rule_id, rule]));
  for (const rule of rules) {
    rule.frontmatter['x-requires'] = rule.requires_rules
      .map((id) => byRuleId.get(id)?.id)
      .filter(Boolean)
      .sort();
  }
  return rules;
}

// [::TICKET::] PX-426, PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-426|PX-425) --for-spec --no-implementation-order`.
function locateRule(ruleId, documents, sections) {
  const ordered = [...documents].sort((left, right) => {
    const leftRegistry = left.path.includes('15-RULE-REGISTRY') ? 1 : 0;
    const rightRegistry = right.path.includes('15-RULE-REGISTRY') ? 1 : 0;
    return leftRegistry - rightRegistry;
  });
  for (const document of ordered) {
    const lines = document.text.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      if (!new RegExp(`\\b${escapeRegExp(ruleId)}\\b`).test(lines[index])) continue;
      const line = index + 1;
      const section = sections.find((entry) => entry.sourceAlias === document.alias && entry.start <= line && line <= entry.end);
      if (section) return { document, line, section };
    }
  }
  return null;
}

// [::TICKET::] PX-426, PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-426|PX-425) --for-spec --no-implementation-order`.
function collectRequires(statement, sectionBody, registryIds, selfId) {
  const text = `${statement}\n${sectionBody}`;
  const found = new Set();
  for (const match of text.matchAll(RULE_PATTERN)) {
    if (match[0] !== selfId && registryIds.has(match[0])) found.add(match[0]);
  }
  return [...found].sort();
}

// [::TICKET::] PX-426, PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-426|PX-425) --for-spec --no-implementation-order`.
function renderRuleBody({ row, section, ruleId }) {
  const target = section ? relative(`rules/${row.ruleClass.toLowerCase()}`, section.path) : '../../15-rule-registry/registry.md';
  return [
    `# ${ruleId}`,
    '',
    row.statement,
    '',
    '| Field | Value |',
    '|---|---|',
    `| Class | ${row.ruleClass} |`,
    `| Applies to | ${row.applicability} |`,
    `| Parent | ${row.parent} |`,
    `| Source part | ${row.sourcePart} |`,
    `| Verification | ${row.verification} |`,
    `| Enforcement | ${row.gate} |`,
    '',
    `[${section?.title ?? 'Rule Registry'}](${target})`,
    '',
    `[^${ruleId.toLowerCase()}]: ${section?.sourceAlias ?? 'sources/15-RULE-REGISTRY.md'}`,
    '',
  ].join('\n');
}

// [::TICKET::] PX-426, PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-426|PX-425) --for-spec --no-implementation-order`.
function phaseFor(ruleId) {
  const prefix = ruleId.split('-')[0];
  if (prefix === 'IMP') return 'adapter';
  if (['AUTH', 'OPS', 'OP', 'SEC', 'AUTHZ', 'SSO', 'ID', 'IDN'].includes(prefix)) return 'operation';
  if (['REST', 'WS', 'CLI', 'GRPC', 'MCP', 'A2A'].includes(prefix)) return 'adapter';
  if (['DOC', 'VAL', 'BP'].includes(prefix)) return 'docs';
  if (prefix === 'CONF') return 'conformance';
  if (['ARC', 'CORE'].includes(prefix)) return 'core';
  if (prefix === 'APP') return 'scope';
  if (prefix === 'MIG') return 'review';
  return 'operation';
}

// [::TICKET::] PX-426, PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-426|PX-425) --for-spec --no-implementation-order`.
function appliesFor(row) {
  const interfaceName = { REST: 'rest', WS: 'websocket', CLI: 'cli', GRPC: 'grpc', MCP: 'mcp', A2A: 'a2a' }[row.id.split('-')[0]];
  return interfaceName ?? row.applicability ?? 'all';
}

// [::TICKET::] PX-426, PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-426|PX-425) --for-spec --no-implementation-order`.
function renderRuleMap(rules) {
  const byRule = {};
  for (const rule of rules) {
    byRule[rule.rule_id] = {
      rule_id: rule.rule_id,
      concept_id: rule.id,
      path: rule.path,
      phase: rule.frontmatter['x-phase'],
      requires: rule.frontmatter['x-requires'],
      required_rules: rule.requires_rules,
      applies_to: rule.frontmatter['x-applies-to'],
      source_alias: rule.frontmatter.sources[0].resource,
      source_span: rule.frontmatter['x-source-span'],
    };
  }
  return { schema: 'law-rule-concepts/v1', byRule };
}

// [::TICKET::] PX-426, PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-426|PX-425) --for-spec --no-implementation-order`.
function renderLock({ rules, sections, documents }) {
  return {
    schema: 'law-atoms/v2',
    check_set_version: '3',
    rules: rules.map((rule) => ({
      rule_id: rule.rule_id,
      concept_id: rule.id,
      path: rule.path,
      content_sha256: sha256(`${rule.body}\n`),
    })),
    sections: sections.map((section) => ({
      concept_id: section.id,
      path: section.path,
      content_sha256: sha256(`${section.body}\n`),
    })),
    sources: documents.map((document) => ({ alias: document.alias, sha256: sha256(document.text) })),
  };
}

// [::TICKET::] PX-426, PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-426|PX-425) --for-spec --no-implementation-order`.
function renderSourceView(documents) {
  const parts = ['# Source View', '', 'Generated from the source documents. Do not edit.', ''];
  for (const document of documents) parts.push(`# Source: ${document.alias}`, '', document.text.replace(/\n+$/, ''), '');
  return parts.join('\n');
}

// [::TICKET::] PX-426, PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-426|PX-425) --for-spec --no-implementation-order`.
function loadBundleSync(outDir) {
  const files = listMarkdownFiles(outDir).map((path) => ({
    path: relative(outDir, path).replace(/\\/g, '/'),
    text: readFileSync(path, 'utf8'),
  }));
  const tree = parseTree(files);
  const directories = new Set(['']);
  for (const file of files) {
    let directory = dirname(file.path);
    while (directory !== '.' && directory !== '') {
      directories.add(directory);
      directory = dirname(directory);
    }
  }
  return {
    root: outDir,
    tree,
    concepts: tree.concepts,
    byId: new Map(tree.concepts.map((concept) => [concept.id, concept])),
    reserved: tree.reserved,
    files: tree.files,
    directories: [...directories].sort(),
    diagnostics: [],
  };
}

// [::TICKET::] PX-426, PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-426|PX-425) --for-spec --no-implementation-order`.
function listMarkdownFiles(directory) {
  const collected = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collected.push(...listMarkdownFiles(path));
    else if (entry.isFile() && entry.name.endsWith('.md')) collected.push(path);
  }
  return collected.sort();
}

// [::TICKET::] PX-426, PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-426|PX-425) --for-spec --no-implementation-order`.
function titleOf(text) {
  const line = String(text).split('\n').find((entry) => /^#\s+\S/.test(entry));
  return line ? line.replace(/^#\s+/, '').trim() : null;
}

// [::TICKET::] PX-426, PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-426|PX-425) --for-spec --no-implementation-order`.
function firstParagraph(text) {
  const line = String(text).split('\n').find((entry) => entry.trim().length > 0 && !entry.startsWith('#'));
  return (line ?? '').trim().slice(0, 200);
}

// [::TICKET::] PX-426, PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-426|PX-425) --for-spec --no-implementation-order`.
function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
}

// [::TICKET::] PX-426, PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-426|PX-425) --for-spec --no-implementation-order`.
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// [::TICKET::] PX-426, PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-426|PX-425) --for-spec --no-implementation-order`.
function sha256(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}

// [::TICKET::] PX-426, PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-426|PX-425) --for-spec --no-implementation-order`.
function writeFile(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

if (process.argv[1] && process.argv[1].endsWith('generate-law-bundle.mjs')) {
  const args = process.argv.slice(2);
  const option = (name) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : null;
  };
  const result = generateLawBundle({
    sourceRoot: option('source-root'),
    sourcePaths: option('source-paths') ? option('source-paths').split(',') : null,
    outDir: option('out'),
    sourceDir: option('source-dir') ?? undefined,
    date: option('date') ?? '1970-01-01',
  });
  process.stdout.write(`${JSON.stringify({ rules: result.rules.length, sections: result.sections.length })}\n`);
}
