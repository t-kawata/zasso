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
import { parseExpertPackage } from './lib/expert-package.mjs';
import { buildCoverageLedger } from './lib/coverage-ledger.mjs';
import { resolveRuleRow } from './lib/rule-alias.mjs';

const RULE_PATTERN = /\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+\b/g;
const PHASE_ORDER = ['scope', 'contract', 'core', 'operation', 'adapter', 'docs', 'conformance', 'review'];

export function generateLawBundle({
  sourceRoot,
  sourcePaths = null,
  outDir,
  sourceDir = join(dirname(outDir), 'source'),
  packagePath = null,
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
  let coverageLedger = null;
  if (packagePath && existsSync(packagePath)) {
    const packageTree = parseExpertPackage(redactText(
      readFileSync(packagePath, 'utf8').replace(/\r\n?/g, '\n'),
      redaction,
    ));
    const aliases = loadPackageAliases(sourceDir);
    const packageAlias = `sources/${basename(packagePath)}`;
    const packageSections = buildPackageSectionConcepts({ tree: packageTree, date, packageAlias });
    applyPackageRuleCoverage({
      rules,
      tree: packageTree,
      aliases,
      date,
      packageAlias,
      packageSections,
    });
    sections.push(...packageSections);
    coverageLedger = buildCoverageLedger({
      headings: packageTree.headings,
      concepts: packageSections.map((section) => ({ id: section.id, sourcePath: section.coveragePath })),
      nonNormative: loadNonNormative(sourceDir),
      ruleRows: packageTree.ruleRows,
      ruleConcepts: new Map(rules.filter((rule) => rule.rule_id).map((rule) => [rule.rule_id, rule.id])),
      aliases,
    });
    if (coverageLedger.counts.unmappedHeadings > 0 || coverageLedger.counts.unmappedRuleRows > 0) {
      throw Object.assign(
        new Error(`COVERAGE_GAP: headings=${coverageLedger.counts.unmappedHeadings} rules=${coverageLedger.counts.unmappedRuleRows}`),
        { code: 'COVERAGE_GAP', ledger: coverageLedger },
      );
    }
    writeFile(join(sourceDir, 'coverage-v3.json'), `${JSON.stringify(coverageLedger, null, 2)}\n`);
  }
  appendSectionRuleLinks({ sections, rules });
  sections.push(makeRuleIndexSection({ rules, date }));

  for (const section of sections) writeConcept({ outDir, concept: section });
  for (const rule of rules) writeConcept({ outDir, concept: rule });

  const ruleMapPath = join(sourceDir, 'rule-concepts.json');
  const lockPath = join(dirname(outDir), 'atoms.lock.json');
  writeFile(ruleMapPath, `${JSON.stringify(renderRuleMap(rules), null, 2)}\n`);
  writeFile(lockPath, `${JSON.stringify(renderLock({ rules, sections, documents }), null, 2)}\n`);
  writeFile(join(sourceDir, 'delivery.json'), `${JSON.stringify({ schema: 'law-delivery/v3', rules: rules.map((rule) => ({ rule_id: rule.rule_id, concept_id: rule.id, decision: 'must' })) }, null, 2)}\n`);
  writeFile(join(sourceDir, 'coverage.json'), `${JSON.stringify({ schema: 'law-coverage/v3', rules: rules.length, sections: sections.length, sources: documents.length }, null, 2)}\n`);
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

// [::TICKET::] PX-426, PX-425, PX-428, PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-426|PX-425|PX-428|PX-427) --for-spec --no-implementation-order`.
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

// [::TICKET::] PX-426, PX-425, PX-427, PX-428 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-426|PX-425|PX-427|PX-428) --for-spec --no-implementation-order`.
function buildRules({ registry, documents, sections, date }) {
  const registryIds = new Set(registry.map((rule) => rule.id));
  const rules = registry.map((row) => {
    const location = locateRule(row.id, documents, sections);
    const section = location?.section ?? null;
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
      section_id: section?.id ?? null,
      _row: row,
      _section: section,
    };
  });

  const byRuleId = new Map(rules.map((rule) => [rule.rule_id, rule]));
  for (const rule of rules) {
    rule.frontmatter['x-requires'] = rule.requires_rules
      .map((id) => byRuleId.get(id)?.id)
      .filter(Boolean)
      .sort();
  }

  const bySection = new Map();
  for (const rule of rules) {
    if (!bySection.has(rule.section_id)) bySection.set(rule.section_id, []);
    bySection.get(rule.section_id).push(rule);
  }
  for (const rule of rules) {
    const siblings = (bySection.get(rule.section_id) ?? []).filter((entry) => entry.id !== rule.id);
    const prerequisites = rule.requires_rules.map((id) => byRuleId.get(id)).filter(Boolean);
    rule.body = renderRuleBody({
      row: rule._row,
      section: rule._section,
      ruleId: rule.rule_id,
      related: [...prerequisites, ...siblings],
    });
    delete rule._row;
    delete rule._section;
  }
  return rules;
}

// [::TICKET::] PX-426, PX-425, PX-427, PX-428 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-426|PX-425|PX-427|PX-428) --for-spec --no-implementation-order`.
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
      if (document.path.includes('15-RULE-REGISTRY')) return { document, line, section: null };
      const section = sections.find((entry) => entry.sourceAlias === document.alias && entry.start <= line && line <= entry.end);
      if (section) return { document, line, section };
    }
  }
  return null;
}

// [::TICKET::] PX-426, PX-425, PX-428, PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-426|PX-425|PX-428|PX-427) --for-spec --no-implementation-order`.
function collectRequires(statement, sectionBody, registryIds, selfId) {
  const text = `${statement}\n${sectionBody}`;
  const found = new Set();
  for (const match of text.matchAll(RULE_PATTERN)) {
    if (match[0] !== selfId && registryIds.has(match[0])) found.add(match[0]);
  }
  return [...found].sort();
}

// [::TICKET::] PX-426, PX-425, PX-427, PX-428 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-426|PX-425|PX-427|PX-428) --for-spec --no-implementation-order`.
function renderRuleBody({ row, section, ruleId, related = [] }) {
  const ruleDirectory = `rules/${row.ruleClass.toLowerCase()}`;
  const rulePath = `${ruleDirectory}/${ruleId.toLowerCase()}.md`;
  const target = section ? relative(ruleDirectory, section.path) : relative(ruleDirectory, 'sources/15-rule-registry/1-registry.md');
  const lines = [
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
  ];
  lines.push(...renderRelatedSection({ rulePath, related }));
  lines.push(
    `[^${ruleId.toLowerCase()}]: ${section?.sourceAlias ?? 'sources/15-RULE-REGISTRY.md'}`,
    '',
  );
  return lines.join('\n');
}

/**
 * Render the sibling and prerequisite links that make the law graph navigable.
 *
 * The source citation alone leaves each rule as a leaf. These body links give
 * the OKF graph real rule-to-rule edges and give backlinks a target.
 */
// [::TICKET::] PX-427, PX-428 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-427|PX-428) --for-spec --no-implementation-order`.
function renderRelatedSection({ rulePath, related }) {
  const unique = new Map();
  for (const rule of related) {
    if (rule && !unique.has(rule.id)) unique.set(rule.id, rule);
  }
  if (unique.size === 0) return [];
  const lines = ['## Related', ''];
  for (const rule of unique.values()) {
    const label = `${rule.rule_id} — ${shortStatement(rule.frontmatter.description)}`;
    lines.push(`- [${label}](${relative(dirname(rulePath), rule.path)})`);
  }
  lines.push('');
  return lines;
}

// [::TICKET::] PX-427, PX-428 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-427|PX-428) --for-spec --no-implementation-order`.
function shortStatement(statement) {
  const text = String(statement ?? '').replace(/\s+/g, ' ').trim();
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

// [::TICKET::] PX-427, PX-428 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-427|PX-428) --for-spec --no-implementation-order`.
function appendSectionRuleLinks({ sections, rules }) {
  const bySection = new Map();
  for (const rule of rules) {
    if (!bySection.has(rule.section_id)) bySection.set(rule.section_id, []);
    bySection.get(rule.section_id).push(rule);
  }
  for (const section of sections) {
    const members = bySection.get(section.id) ?? [];
    if (members.length === 0) continue;
    const lines = ['## Rules in this section', ''];
    for (const rule of members) {
      const label = `${rule.rule_id} — ${shortStatement(rule.frontmatter.description)}`;
      lines.push(`- [${label}](${relative(dirname(section.path), rule.path)})`);
    }
    section.body = `${section.body.trimEnd()}\n\n${lines.join('\n')}\n`;
  }
}

// [::TICKET::] PX-427, PX-428 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-427|PX-428) --for-spec --no-implementation-order`.
function makeRuleIndexSection({ rules, date }) {
  const lines = [
    '# Rule index',
    '',
    '## Rule index',
    '',
  ];
  for (const rule of [...rules].sort((left, right) => left.rule_id.localeCompare(right.rule_id))) {
    const label = `${rule.rule_id} — ${shortStatement(rule.frontmatter.description)}`;
    lines.push(`- [${label}](${relative('sources/15-rule-registry', rule.path)})`);
  }
  return {
    id: 'sources/15-rule-registry/rule-index',
    path: 'sources/15-rule-registry/rule-index.md',
    title: 'Rule index',
    frontmatter: {
      type: 'Section',
      title: 'Rule index',
      description: 'Every rule concept linked from one index.',
      sources: [{ resource: 'sources/15-RULE-REGISTRY.md', id: 'rule-index', title: 'Rule index' }],
      generated: { by: 'build-law-skill', at: date },
      verified: [{ by: 'human:law-review', at: date }],
      status: 'stable',
      'x-document': 'sources/15-RULE-REGISTRY.md',
      'x-source-span': '1-1',
    },
    body: `${lines.join('\n')}\n`,
  };
}

// [::TICKET::] PX-428, PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-428|PX-427) --for-spec --no-implementation-order`.
function loadPackageAliases(sourceDir) {
  const path = join(sourceDir, 'package-aliases.json');
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { aliases: {} };
}

// [::TICKET::] PX-428, PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-428|PX-427) --for-spec --no-implementation-order`.
function loadNonNormative(sourceDir) {
  const path = join(sourceDir, 'package-non-normative.json');
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')).entries ?? [] : [];
}

/**
 * Turn package headings into Section concepts (Parts II/III/IV) or
 * Documentation concepts (Part I and front matter).
 */
// [::TICKET::] PX-428, PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-428|PX-427) --for-spec --no-implementation-order`.
function buildPackageSectionConcepts({ tree, date, packageAlias }) {
  const concepts = [];
  for (const heading of tree.headings) {
    const documentation = heading.part === 'part-i' || heading.part === 'front';
    const prefix = documentation ? 'docs' : 'sources';
    const id = `${prefix}/${heading.path}`;
    const path = `${id}.md`;
    const children = tree.headings.filter((entry) => (
      entry.level === 3
      && entry.part === heading.part
      && entry.start > heading.start
      && entry.start < heading.end
    ));
    const lines = [heading.text];
    if (children.length > 0) {
      lines.push('', '## Subsections', '');
      for (const child of children) {
        const href = relative(dirname(path), `${prefix}/${child.path}.md`);
        lines.push(`- [${child.title}](${href})`);
      }
    }
    concepts.push({
      id,
      path,
      title: heading.title,
      coveragePath: heading.path,
      frontmatter: {
        type: documentation ? 'Documentation' : 'Section',
        title: heading.title,
        description: firstParagraph(heading.text).slice(0, 200),
        sources: [{ resource: packageAlias, id: heading.path, title: heading.title }],
        generated: { by: 'build-law-skill', at: date },
        verified: [{ by: 'human:law-review', at: date }],
        status: 'stable',
        'x-document': packageAlias,
        'x-source-span': `${heading.line}-${heading.line}`,
        'x-coverage-path': heading.path,
      },
      body: `${lines.join('\n')}\n`,
    });
  }
  addPartFourSection({ tree, date, packageAlias, concepts });
  return concepts;
}

// [::TICKET::] PX-428, PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-428|PX-427) --for-spec --no-implementation-order`.
function addPartFourSection({ tree, date, packageAlias, concepts }) {
  const part = tree.parts.find((entry) => entry.id === 'part-iv');
  if (!part) return;
  const text = tree.lines.join('\n').slice(part.start, part.end).trim();
  if (text.length < 40) return;
  const path = 'part-iv/document-map';
  tree.headings.push({
    path,
    level: 2,
    title: 'Document map and self-containment',
    line: part.line,
    start: part.start,
    end: part.end,
    part: 'part-iv',
    text,
  });
  concepts.push({
    id: `sources/${path}`,
    path: `sources/${path}.md`,
    title: 'Document map and self-containment',
    coveragePath: path,
    frontmatter: {
      type: 'Section',
      title: 'Document map and self-containment',
      description: firstParagraph(text).slice(0, 200),
      sources: [{ resource: packageAlias, id: path, title: 'Document map' }],
      generated: { by: 'build-law-skill', at: date },
      verified: [{ by: 'human:law-review', at: date }],
      status: 'stable',
      'x-document': packageAlias,
      'x-source-span': `${part.line}-${part.line}`,
      'x-coverage-path': path,
    },
    body: `${text}\n`,
  });
}

const PACKAGE_RULE_DEFAULTS = Object.freeze({
  FREE: { ruleClass: 'G', parent: 'FREE', phase: 'scope', verification: 'V4 review.', gate: 'human review' },
  VER: { ruleClass: 'G', parent: 'VER', phase: 'review', verification: 'V4 review.', gate: 'human review' },
  INV: { ruleClass: 'C', parent: 'INV', phase: 'core', verification: 'V4 review.', gate: 'conformance driver' },
});

// [::TICKET::] PX-428, PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-428|PX-427) --for-spec --no-implementation-order`.
function applyPackageRuleCoverage({ rules, tree, aliases, date, packageAlias, packageSections }) {
  const byRule = new Map(rules.map((rule) => [rule.rule_id, rule]));
  const sectionByPath = new Map(packageSections.map((section) => [section.coveragePath, section]));
  const rows = tree.ruleRows.map((row) => ({ ...row, ...resolveRuleRow(row, aliases) }));

  for (const row of rows) {
    if (row.disposition !== 'concept' || byRule.has(row.targetConcept)) continue;
    const rule = makePackageRule({ row, sections: sectionByPath, date, packageAlias, byRule });
    rules.push(rule);
    byRule.set(rule.rule_id, rule);
  }

  const rowsBySection = new Map();
  for (const row of rows) {
    const rule = byRule.get(row.targetConcept);
    if (!rule || !row.sectionPath) continue;
    if (!rowsBySection.has(row.sectionPath)) rowsBySection.set(row.sectionPath, []);
    rowsBySection.get(row.sectionPath).push(rule);
    rule.packageSection = sectionByPath.get(row.sectionPath) ?? null;
  }

  for (const rule of rules) {
    if (!rule.packageSection) continue;
    const section = rule.packageSection;
    const siblings = (rowsBySection.get(section.coveragePath) ?? []).filter((entry) => entry.id !== rule.id);
    const prerequisites = rule.requires_rules.map((id) => byRule.get(id)).filter(Boolean);
    rule.body = renderRuleBody({
      row: rowFromRule(rule),
      section: {
        id: section.id,
        path: section.path,
        title: section.title,
        sourceAlias: packageAlias,
      },
      ruleId: rule.rule_id,
      related: [...prerequisites, ...siblings],
    });
    rule.section_id = section.id;
  }

  const aliasIdsByTarget = new Map();
  for (const [legacyId, entry] of Object.entries(aliases.aliases ?? {})) {
    if (!aliasIdsByTarget.has(entry.target)) aliasIdsByTarget.set(entry.target, []);
    aliasIdsByTarget.get(entry.target).push(legacyId);
  }
  for (const rule of rules) {
    const legacyIds = aliasIdsByTarget.get(rule.rule_id) ?? [];
    if (legacyIds.length > 0) rule.frontmatter['x-alias-rule-ids'] = legacyIds.sort();
  }
}

// [::TICKET::] PX-428, PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-428|PX-427) --for-spec --no-implementation-order`.
function makePackageRule({ row, sections, date, packageAlias, byRule }) {
  const id = row.targetConcept;
  const family = id.split('-')[0];
  const defaults = PACKAGE_RULE_DEFAULTS[family] ?? {
    ruleClass: 'C', parent: family, phase: 'operation', verification: 'V4 review.', gate: 'conformance driver',
  };
  const conceptId = `rules/${defaults.ruleClass.toLowerCase()}/${id.toLowerCase()}`;
  const section = sections.get(row.sectionPath) ?? null;
  const sectionForBody = section
    ? { id: section.id, path: section.path, title: section.title, sourceAlias: packageAlias }
    : null;
  const prerequisites = ['APP-01', 'ARC-01']
    .map((ruleId) => byRule.get(ruleId)?.id)
    .filter(Boolean)
    .sort();
  const body = renderRuleBody({
    row: {
      statement: row.statement,
      ruleClass: defaults.ruleClass,
      applicability: 'all',
      parent: defaults.parent,
      sourcePart: 'Part II',
      verification: row.verification ?? defaults.verification,
      gate: defaults.gate,
    },
    section: sectionForBody,
    ruleId: id,
    related: [],
  });
  return {
    id: conceptId,
    concept_id: conceptId,
    path: `${conceptId}.md`,
    rule_id: id,
    section_id: section?.id ?? null,
    requires_rules: ['APP-01', 'ARC-01'].filter((ruleId) => byRule.has(ruleId) && ruleId !== id),
    frontmatter: {
      type: 'Rule',
      title: `${id} — ${row.statement}`,
      description: row.statement,
      sources: [{ resource: packageAlias, id: id.toLowerCase(), title: id }],
      generated: { by: 'build-law-skill', at: date },
      verified: [{ by: 'human:law-review', at: date }],
      status: 'stable',
      'x-rule-id': id,
      'x-rule-class': defaults.ruleClass,
      'x-applies-to': 'all',
      'x-parent': defaults.parent,
      'x-source-part': 'Part II',
      'x-verification': row.verification ?? defaults.verification,
      'x-enforcement': defaults.gate,
      'x-phase': defaults.phase,
      'x-source-span': `${row.line}-${row.line}`,
      'x-requires': prerequisites,
    },
    body,
  };
}

// [::TICKET::] PX-428, PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-428|PX-427) --for-spec --no-implementation-order`.
function rowFromRule(rule) {
  const frontmatter = rule.frontmatter ?? {};
  return {
    statement: frontmatter.description ?? rule.title,
    ruleClass: frontmatter['x-rule-class'] ?? 'C',
    applicability: frontmatter['x-applies-to'] ?? 'all',
    parent: frontmatter['x-parent'] ?? '',
    sourcePart: frontmatter['x-source-part'] ?? '',
    verification: frontmatter['x-verification'] ?? '',
    gate: frontmatter['x-enforcement'] ?? '',
  };
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

// [::TICKET::] PX-426, PX-425, PX-428, PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-426|PX-425|PX-428|PX-427) --for-spec --no-implementation-order`.
function renderRuleMap(rules) {
  const byRule = {};
  const aliases = {};
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
    for (const legacyId of rule.frontmatter['x-alias-rule-ids'] ?? []) {
      aliases[legacyId] = { rule_id: rule.rule_id, concept_id: rule.id };
    }
  }
  return { schema: 'law-rule-concepts/v1', byRule, aliases };
}

// [::TICKET::] PX-426, PX-425, PX-428, PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-426|PX-425|PX-428|PX-427) --for-spec --no-implementation-order`.
function renderLock({ rules, sections, documents }) {
  return {
    schema: 'law-atoms/v3',
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
    packagePath: option('package-path'),
    date: option('date') ?? '1970-01-01',
  });
  process.stdout.write(`${JSON.stringify({ rules: result.rules.length, sections: result.sections.length })}\n`);
}
