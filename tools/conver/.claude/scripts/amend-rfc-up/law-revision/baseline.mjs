// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.

import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { failRevision } from '../revision/errors.mjs';

export function loadLawBaseline({ baselineSkill }) {
  const ruleConceptsPath = join(baselineSkill, 'source/rule-concepts.json');
  if (!existsSync(ruleConceptsPath)) {
    failRevision('REVISION_BASELINE_MISSING', `law baseline has no source/rule-concepts.json: ${baselineSkill}`, { target: baselineSkill });
  }
  const ruleConcepts = readJson(ruleConceptsPath);
  const registryPath = join(baselineSkill, 'source/baseline/registry.json');
  const registry = existsSync(registryPath)
    ? readJson(registryPath)
    : deriveRegistry(ruleConcepts, readConceptMetadata(baselineSkill));
  const lockPath = join(baselineSkill, 'atoms.lock.json');
  const lock = existsSync(lockPath) ? readJson(lockPath) : { rules: [] };
  const descriptorPath = join(baselineSkill, 'source/baseline.json');
  const descriptor = existsSync(descriptorPath) ? readJson(descriptorPath) : null;
  const packagePath = join(baselineSkill, 'package.json');
  const version = descriptor?.version ?? (existsSync(packagePath) ? readJson(packagePath).version : '0.0.0');
  const tombstones = existsSync(join(baselineSkill, 'source/revision/tombstones.json'))
    ? readJson(join(baselineSkill, 'source/revision/tombstones.json')).rules ?? []
    : [];
  return {
    skill: baselineSkill,
    version,
    digest: sha256Text(JSON.stringify({ ruleConcepts, registry, lock })),
    ruleConcepts,
    registry,
    lock,
    tombstones,
  };
}

export function adoptLawBaseline({ baseline, outDir }) {
  const baselineDir = join(outDir, 'source/baseline');
  mkdirSync(baselineDir, { recursive: true });
  writeJson(join(baselineDir, 'rule-concepts.json'), baseline.ruleConcepts);
  writeJson(join(baselineDir, 'registry.json'), baseline.registry);
  writeJson(join(baselineDir, 'atoms.lock.json'), baseline.lock);
  writeJson(join(outDir, 'source/baseline.json'), {
    schema: 'revision-baseline/v1',
    skill: baseline.skill,
    version: baseline.version,
    origin: 'installed',
    digest: baseline.digest,
  });
  return baseline;
}

export function copyBaselineArtifacts({ baselineSkill, outDir }) {
  const sourceDir = join(baselineSkill, 'source');
  const targetDir = join(outDir, 'source/baseline');
  mkdirSync(targetDir, { recursive: true });
  for (const file of ['rule-concepts.json', 'registry.json', 'coverage-v3.json']) {
    const source = join(sourceDir, file);
    if (existsSync(source)) cpSync(source, join(targetDir, file));
  }
  const lock = join(baselineSkill, 'atoms.lock.json');
  if (existsSync(lock)) cpSync(lock, join(targetDir, 'atoms.lock.json'));
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function deriveRegistry(ruleConcepts, metadata = {}) {
  return Object.values(ruleConcepts.byRule ?? {}).map((rule) => {
    const concept = metadata[rule.concept_id] ?? {};
    return {
      id: rule.rule_id,
      class: concept.class ?? (rule.concept_id ?? '').split('/')[1]?.toUpperCase() ?? rule.rule_id.slice(0, 1),
      parent: rule.rule_id.split('-')[0],
      applicability: rule.applies_to ?? 'all',
      statement: rule.statement ?? concept.description ?? rule.rule_id,
      verification: 'V1',
      gate: 'review',
    };
  });
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function readConceptMetadata(skillRoot) {
  const root = join(skillRoot, 'okf/rules');
  const records = {};
  if (!existsSync(root)) return records;
  for (const file of walkMarkdown(root)) {
    const text = readFileSync(file, 'utf8');
    const frontmatter = text.match(/^---\n([\s\S]*?)\n---\n/);
    if (!frontmatter) continue;
    const conceptId = `rules/${file.slice(root.length + 1).replace(/\.md$/, '')}`;
    records[conceptId] = {
      description: readQuoted(frontmatter[1], 'description'),
      class: readQuoted(frontmatter[1], 'x-rule-class'),
    };
  }
  return records;
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function readQuoted(frontmatter, key) {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*("(?:[^"\\\\]|\\\\.)*")`, 'm'));
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function walkMarkdown(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkMarkdown(path));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(path);
  }
  return files;
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function sha256Text(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}
