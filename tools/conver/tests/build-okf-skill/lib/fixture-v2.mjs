/**
 * OKF v0.2 fixtures for the PX-425 core tests.
 *
 * A fixture writes a real bundle tree so every assertion reads files, not a
 * hand-written model. The helper keeps the test setup in one place and makes
 * the red phase fail on the missing core modules, not on fixture drift.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync, cpSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { loadBundle } from '../../../.claude/scripts/amend-rfc-up/okf-core/index.mjs';
import { conceptBody } from '../../../.claude/scripts/amend-rfc-up/okf-core/context/assemble.mjs';
import { writeConcept } from '../../../.claude/scripts/amend-rfc-up/okf-core/authoring/write.mjs';
import { writeDirectoryIndexes } from '../../../.claude/scripts/amend-rfc-up/okf-core/authoring/index.mjs';
import { writeLog } from '../../../.claude/scripts/amend-rfc-up/okf-core/authoring/log.mjs';

export function createBundle(files) {
  const root = mkdtempSync(join(tmpdir(), 'okf-v2-'));
  for (const [relativePath, text] of Object.entries(files)) {
    writeFile(root, relativePath, text);
  }
  return {
    root,
// [::TICKET::] PX-425, PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-425|PX-426) --for-spec --no-implementation-order`.
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

export function writeFile(root, relativePath, text) {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

export function conceptText(fields, body) {
  const frontmatter = Object.entries(fields)
    .map(([key, value]) => `${key}: ${formatValue(value)}`)
    .join('\n');
  return `---\n${frontmatter}\n---\n${body}\n`;
}

// [::TICKET::] PX-425, PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-425|PX-426) --for-spec --no-implementation-order`.
function formatValue(value) {
  if (Array.isArray(value)) {
    if (value.every((entry) => entry === null || typeof entry !== 'object')) {
      return `[${value.map((entry) => String(entry)).join(', ')}]`;
    }
    const rows = value.map((entry) => {
      const fields = Object.entries(entry);
      return fields
        .map(([key, item], index) => `${index === 0 ? '  - ' : '    '}${key}: ${formatValue(item)}`)
        .join('\n');
    });
    return `\n${rows.join('\n')}`;
  }
  if (value && typeof value === 'object') {
    return `\n${Object.entries(value).map(([key, entry]) => `  ${key}: ${formatValue(entry)}`).join('\n')}`;
  }
  if (typeof value === 'string' && /[:#\n]/.test(value)) return JSON.stringify(value);
  return String(value);
}

export function createBasicBundle() {
  return createBundle({
    'index.md': '# Knowledge\n\n- [Rules](./rules/index.md)\n- [Identity](./identity/index.md)\n',
    'rules/index.md': '# Rules\n\n- [A](./a.md)\n- [REST](./rest.md)\n',
    'identity/index.md': '# Identity\n\n- [Identity rule](./id.md)\n',
    'rules/a.md': conceptText({
      type: 'Rule',
      title: 'Rule A',
      description: 'Rule A delegates to REST and identity.',
      sources: [{ resource: 'sources/a.md', id: 'a1', title: 'Source A' }],
      generated: { by: 'test', at: '2026-11-13' },
      verified: [{ by: 'machine', at: '2026-11-13' }],
      status: 'stable',
      stale_after: '2027-11-13',
    }, [
      '# Rule A',
      '',
      'See [REST](/rules/rest.md) and [Identity](../identity/id.md).',
      '',
      'External reference: [example](https://example.com).',
      '',
      'Source: [^a1].',
      '',
      '```md',
      '[not a link](/rules/secret.md)',
      '```',
      '',
      '[^a1]: Source A.',
    ].join('\n')),
    'rules/rest.md': conceptText({
      type: 'Rule',
      title: 'REST rule',
      description: 'REST is a thin adapter.',
      sources: [{ resource: 'sources/rest.md', id: 'rest1', title: 'REST' }],
      verified: [{ by: 'human', at: '2026-11-13' }],
      status: 'stable',
    }, '# REST rule\n\nREST is a thin adapter. [^rest1]\n\n[^rest1]: REST source.'),
    'identity/id.md': conceptText({
      type: 'Identity',
      title: 'Identity rule',
      description: 'Identity owns the subject.',
      sources: [{ resource: 'sources/id.md', id: 'id1', title: 'Identity' }],
      status: 'deprecated',
    }, '# Identity rule\n\nIdentity owns the subject. [^id1]\n\n[^id1]: Identity source.'),
    'assets/logo.svg': '<svg></svg>\n',
  });
}

export function createRequiresBundle() {
  return createBundle({
    'index.md': '# Requires\n\n- [A](./A.md)\n- [E](./E.md)\n',
    'A.md': conceptText({
      type: 'Rule',
      title: 'A',
      description: 'A requires B and C.',
      'x-requires': ['B', 'C'],
    }, '# A'),
    'B.md': conceptText({
      type: 'Rule',
      title: 'B',
      description: 'B requires D.',
      'x-requires': ['D'],
    }, '# B'),
    'C.md': conceptText({
      type: 'Rule',
      title: 'C',
      description: 'C requires D.',
      'x-requires': ['D'],
    }, '# C'),
    'D.md': conceptText({
      type: 'Rule',
      title: 'D',
      description: 'D is a leaf.',
    }, '# D'),
    'E.md': conceptText({
      type: 'Rule',
      title: 'E',
      description: 'E requires F.',
      'x-requires': ['F'],
    }, '# E'),
    'F.md': conceptText({
      type: 'Rule',
      title: 'F',
      description: 'F requires E.',
      'x-requires': ['E'],
    }, '# F'),
  });
}

export function createLintBundle() {
  return createBundle({
    'index.md': '# Lint\n\n- [Broken](./broken.md)\n',
    'broken.md': conceptText({
      type: 'Mystery',
      title: 'Broken',
      description: 'Broken has a missing target and a stale date.',
      stale_after: '2020-01-01',
      'x-custom': 'kept',
    }, '# Broken\n\n[Missing](./missing.md) and [^ghost]\n\n[^ghost]: ghost.'),
    'orphan.md': conceptText({
      type: 'Rule',
      title: 'Orphan',
      description: 'Orphan is not indexed.',
    }, '# Orphan'),
  });
}

export function createOneHopBundle() {
  return createBundle({
    'index.md': '# One hop\n\n- [A](./a.md)\n- [B](./b.md)\n- [C](./c.md)\n- [D](./d.md)\n',
    'a.md': conceptText({
      type: 'Rule',
      title: 'A',
      description: 'A links to B and C.',
      sources: [{ resource: 'sources/a.md', id: 'a1' }, { resource: 'sources/a.md', id: 'a2' }],
      verified: [{ by: 'machine', at: '2026-11-13' }],
      stale_after: '2027-01-01',
    }, '# A\n\n[B](./b.md) and [C](./c.md) [^a1] [^a2]\n\n[^a1]: one.\n[^a2]: two.'),
    'B.md': conceptText({ type: 'Rule', title: 'B', description: 'B links to A.' }, '# B\n\n[A](./a.md)'),
    'C.md': conceptText({ type: 'Rule', title: 'C', description: 'C links to A.' }, '# C\n\n[A](./a.md)'),
    'D.md': conceptText({ type: 'Rule', title: 'D', description: 'D links to A.' }, '# D\n\n[A](./a.md)'),
  });
}

export function createSyntheticBundle({ concepts = 2500, edges = 10000 } = {}) {
  const files = { 'index.md': '# Synthetic\n\n' };
  const lines = [];
  for (let index = 1; index <= concepts; index += 1) {
    const id = `concept-${String(index).padStart(4, '0')}`;
    const target = `concept-${String(((index * 7) % concepts) + 1).padStart(4, '0')}`;
    lines.push(`- [${id}](./${id}.md)`);
    files[`${id}.md`] = conceptText({
      type: 'Rule',
      title: id,
      description: `${id} synthetic concept.`,
    }, `# ${id}\n\n[target](./${target}.md)`);
  }
  files['index.md'] = `# Synthetic\n\n${lines.join('\n')}\n`;
  return createBundle(files);
}

export const BUILD_DATE = '2026-11-13';

export async function buildMiniSkillV2({
  sources = {
    'auth.md': '# Auth\n\nTokens expire after 15 minutes.\n',
    'session.md': '# Session\n\nSessions persist until sign-out.\n',
  },
  name = 'mini-okf',
  root = null,
} = {}) {
  const base = join(process.cwd(), 'target', 'okf-test');
  mkdirSync(base, { recursive: true });
  const buildRoot = root ?? mkdtempSync(join(base, 'root-'));
  mkdirSync(buildRoot, { recursive: true });
  const skillDir = mkdtempSync(join(buildRoot, `${name}-`));
  const okfDir = join(skillDir, 'okf');
  const concepts = conceptsFromSources(sources);
  concepts.forEach((concept, index) => {
    if (index > 0) concept.frontmatter['x-requires'] = [concepts[index - 1].id];
  });
  for (const concept of concepts) writeConcept({ outDir: okfDir, concept });
  const bundle = await loadBundle(okfDir);
  writeDirectoryIndexes({ bundle, outDir: okfDir });
  writeLog({ outDir: okfDir, entries: [{ date: BUILD_DATE, text: `Generated ${concepts.length} concepts.` }] });

  const coreSource = join(process.cwd(), '.claude/scripts/amend-rfc-up/okf-core');
  cpSync(coreSource, join(skillDir, 'okf-core'), { recursive: true });
  writeFile(skillDir, 'scripts/cli.mjs', "import { main } from '../okf-core/cli.mjs';\nmain(process.argv.slice(2)).then((code) => { process.exitCode = code; });\n");
  writeFile(skillDir, 'package.json', `${JSON.stringify({ name, dependencies: { '@okforest/okf': '^0.14.0' } }, null, 2)}\n`);
  writeFile(skillDir, 'THIRD_PARTY_NOTICES.md', '# Third-party notices\n\n@okforest/okf 0.14.0 — Apache-2.0.\n');
  writeFile(skillDir, 'SKILL.md', manualV2(name));
  writeFile(skillDir, 'DESIGN.md', `# ${name} design\n\nGenerated from ${Object.keys(sources).length} source documents.\n`);
  writeFile(skillDir, 'IMPLEMENTATION-LEFTOVERS.md', '# Leftovers\n\nNone.\n');
  writeFile(skillDir, 'install.js', installScript());
  writeFile(skillDir, 'tests/smoke.test.mjs', "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('skill loads', () => assert.ok(true));\n");
  writeFile(skillDir, 'tests/fixtures/runtime/runtime.json', `${JSON.stringify({ ok: true })}\n`);

  await build({
    entryPoints: [join(skillDir, 'scripts/cli.mjs')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: join(skillDir, 'dist/skill.mjs'),
    absWorkingDir: skillDir,
    logLevel: 'silent',
    legalComments: 'none',
    sourcemap: false,
    banner: {
      js: "import { createRequire as __okfCreateRequire } from 'node:module'; const require = __okfCreateRequire(import.meta.url);",
    },
  });

  const manifest = renderManifest(sources);
  const sourceDir = `sources-${basename(skillDir)}`;
  for (const [path, text] of Object.entries(sources)) writeFile(buildRoot, `${sourceDir}/${basename(path)}`, text);
  writeFile(skillDir, 'source/manifest.toml', manifest);
  writeFile(skillDir, 'source/input-ledger.json', `${JSON.stringify({ schema: 'okf-input-ledger/v1', entries: Object.keys(sources).map((path) => ({ alias: `sources/${basename(path)}`, decision: 'included' })) }, null, 2)}\n`);
  const primaryName = Object.keys(sources)[0];
  const primaryText = String(sources[primaryName]).replace(/\r\n?/g, '\n');
  writeFile(skillDir, 'PRE-OKF-ORIGINAL.md', primaryText);
  writeFile(skillDir, 'source/pre-okf-original.json', `${JSON.stringify({
    schema: 'pre-okf-original/v1',
    source: `sources/${basename(primaryName)}`,
    sha256: createHash('sha256').update(primaryText, 'utf8').digest('hex'),
    bytes: Buffer.byteLength(primaryText, 'utf8'),
  }, null, 2)}\n`);
  writeFile(skillDir, 'source/okf-profile.toml', 'domain = "mini"\nlanguage = "en"\n');
  writeFile(skillDir, 'source/okf-log.json', `${JSON.stringify({ schema: 'okf-log/v1', entries: [{ date: BUILD_DATE, text: `Generated ${concepts.length} concepts.` }] }, null, 2)}\n`);
  writeFile(skillDir, 'source/concept-inventory.json', `${JSON.stringify({ schema: 'okf-concept-inventory/v1', entries: concepts.map((concept) => ({ id: concept.id, path: concept.path, source: concept.frontmatter.sources[0].resource })) }, null, 2)}\n`);
  // [::TICKET::] PX-429 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-429 --for-spec --no-implementation-order`.
  // The coverage ledger is the proof that every source line reached a concept.
  // The fixture is a verified build, so its counts are zero by construction.
  const coverageSources = Object.keys(sources).map((path) => ({
    alias: `sources/${basename(path)}`,
    lines: String(sources[path]).split('\n').length,
    concepts: concepts.filter((concept) => concept.frontmatter.sources[0].resource === `sources/${basename(path)}`).length,
    unmappedHeadings: 0,
    unmappedPreamble: 0,
    unmappedLines: 0,
  }));
  writeFile(skillDir, 'source/coverage.json', `${JSON.stringify({
    schema: 'okf-source-coverage/v1',
    sources: coverageSources,
    counts: {
      sources: coverageSources.length,
      concepts: concepts.length,
      unmappedHeadings: 0,
      unmappedPreamble: 0,
      unmappedLines: 0,
    },
  }, null, 2)}\n`);
  writeFile(skillDir, 'source/shared-engine.json', `${JSON.stringify({ schema: 'okf-shared-engine/v1', modules: [] }, null, 2)}\n`);
  writeFile(skillDir, 'atoms.lock.json', `${JSON.stringify(lockFromConcepts(bundle.concepts), null, 2)}\n`);

  const aliasPath = join(buildRoot, `${basename(skillDir)}.path-alias.json`);
  writeFile(buildRoot, basename(aliasPath), `${JSON.stringify({ schema: 'okf-path-alias/v1', input_roots: [buildRoot], aliases: Object.fromEntries(Object.keys(sources).map((path) => [`sources/${basename(path)}`, `${sourceDir}/${basename(path)}`])) }, null, 2)}\n`);
  return { root: buildRoot, skillDir, aliasPath, sourceDir, concepts, bundle };
}

// [::TICKET::] PX-425, PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-425|PX-426) --for-spec --no-implementation-order`.
function conceptsFromSources(sources) {
  const concepts = [];
  for (const [sourcePath, text] of Object.entries(sources)) {
    const sourceSlug = slug(sourcePath.replace(/\.md$/, ''));
    const sections = splitSections(text);
    sections.forEach((section, index) => {
      const sourceId = `${sourceSlug}-${index + 1}`;
      const body = ensureFootnote(section.body, sourceId, sourcePath);
      concepts.push({
        id: `pages/${sourceSlug}/${section.slug}`,
        path: `pages/${sourceSlug}/${section.slug}.md`,
        frontmatter: {
          type: 'Page',
          title: section.title,
          description: firstParagraph(section.body),
          sources: [{ resource: `sources/${basename(sourcePath)}`, id: sourceId, title: section.title }],
          generated: { by: 'build-okf-skill', at: BUILD_DATE },
          verified: [{ by: 'machine', at: BUILD_DATE }],
          status: 'stable',
        },
        body,
      });
    });
  }
  return concepts.sort((left, right) => left.path.localeCompare(right.path));
}

// [::TICKET::] PX-425, PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-425|PX-426) --for-spec --no-implementation-order`.
function splitSections(text) {
  const lines = String(text).split('\n');
  const sections = [];
  let title = 'Document';
  let body = [];
  const push = () => {
    if (body.join('\n').trim().length === 0) return;
    sections.push({ title, slug: slug(title), body: body.join('\n').trim() });
  };
  for (const line of lines) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      push();
      title = heading[1].trim();
      body = [`## ${title}`];
      continue;
    }
    const titleHeading = line.match(/^#\s+(.+)$/);
    if (titleHeading && sections.length === 0 && body.length === 0) {
      title = titleHeading[1].trim();
      body = [`# ${title}`];
      continue;
    }
    body.push(line);
  }
  push();
  return sections.length > 0 ? sections : [{ title, slug: slug(title), body: String(text) }];
}

// [::TICKET::] PX-425, PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-425|PX-426) --for-spec --no-implementation-order`.
function ensureFootnote(body, sourceId, sourcePath) {
  if (body.includes(`[^${sourceId}]`)) return body;
  return `${body}\n\nSource [^${sourceId}].\n\n[^${sourceId}]: ${sourcePath}.`;
}

// [::TICKET::] PX-425, PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-425|PX-426) --for-spec --no-implementation-order`.
function firstParagraph(body) {
  const paragraph = String(body).split('\n').find((line) => line.trim().length > 0 && !line.startsWith('#')) ?? '';
  return paragraph.trim().slice(0, 200);
}

// [::TICKET::] PX-425, PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-425|PX-426) --for-spec --no-implementation-order`.
function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'document';
}

// [::TICKET::] PX-425, PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-425|PX-426) --for-spec --no-implementation-order`.
function manifestFromConcepts(concepts) {
  return concepts.map((concept) => ({
    id: concept.id,
    path: concept.path,
    type: concept.type,
    title: concept.title,
    body_sha256: sha256(conceptBody(concept)),
    sources: concept.sources,
  }));
}

// [::TICKET::] PX-425, PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-425|PX-426) --for-spec --no-implementation-order`.
function lockFromConcepts(concepts) {
  return { schema: 'okf-atoms/v2', check_set_version: '2', concepts: manifestFromConcepts(concepts) };
}

// [::TICKET::] PX-425, PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-425|PX-426) --for-spec --no-implementation-order`.
function renderManifest(sources) {
  const lines = ['spec_version = "0.2"', ''];
  for (const path of Object.keys(sources)) {
    lines.push('[[file]]');
    lines.push(`path = "sources/${basename(path)}"`);
    lines.push(`sha256 = "${sha256(sources[path])}"`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

// [::TICKET::] PX-425, PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-425|PX-426) --for-spec --no-implementation-order`.
function sha256(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}

// [::TICKET::] PX-425, PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-425|PX-426) --for-spec --no-implementation-order`.
function manualV2(name) {
  const sections = [
    ['## Start Here', `Use ${name} when a task needs a cited answer from the frozen source set.`],
    ['## Directory Traversal', 'Run `list --path /` then `list --path <directory>`.'],
    ['## Concept Page', 'Run `show <concept-id>` to read the body and its one-hop neighborhood.'],
    ['## Outgoing and Incoming', 'Run `outgoing <id>` and `incoming <id>`; use `neighbors <id>` for both.'],
    ['## Multi-Hop Reach', 'Repeat `outgoing` on the returned concept ids; stop when the required set is covered.'],
    ['## Required Context', 'Run `required --entry <id>` and `context --entry <id> --budget <bytes>`.'],
    ['## Zero Results', 'An empty `search` result is an answer: widen the query or list the directory.'],
    ['## Budget Exceeded', '`BUDGET_EXCEEDED` means narrow the entry set; never expect a truncated context.'],
    ['## Trust and Freshness', 'Read `trustTier`, `status`, `stale`, and `staleAfter` from `show`.'],
    ['## Sources and Citation', 'Use `sources <id>`; every citation names a concept id and a source id.'],
    ['## Authoring and Update', 'Add a concept, rebuild the index and log, then run `validate --mode conformance`.'],
    ['## Failure Modes', 'A missing concept is `UNKNOWN_CONCEPT`; a root escape is `blocked`; a broken link is lint-only.'],
  ];
  const scenarios = Array.from({ length: 10 }, (_, index) => [
    `### Scenario ${index + 1}`,
    '',
    `Ask a question, run \`search --query <terms>\`, then \`show <id>\`.`,
    '',
  ].join('\n'));
  return [`# ${name}`, '', ...sections.flatMap(([heading, text]) => [heading, '', text, '']), ...scenarios].join('\n');
}

// [::TICKET::] PX-425, PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-425|PX-426) --for-spec --no-implementation-order`.
function installScript() {
  return [
    "const { cpSync, existsSync, mkdirSync } = require('node:fs');",
    "const { join, basename } = require('node:path');",
    'const root = __dirname;',
    'const target = process.argv[2] ?? process.cwd();',
    "const skillDir = join(target, '.claude/skills', basename(root));",
    "if (!existsSync(join(root, 'dist/skill.mjs'))) process.exit(1);",
    "mkdirSync(join(skillDir, 'dist'), { recursive: true });",
    "cpSync(join(root, 'dist/skill.mjs'), join(skillDir, 'dist/skill.mjs'));",
    "for (const part of ['okf-core', 'scripts', 'okf', 'source', 'tests/fixtures/runtime']) cpSync(join(root, part), join(skillDir, part), { recursive: true });",
    "for (const file of ['PRE-OKF-ORIGINAL.md', 'atoms.lock.json', 'SKILL.md', 'DESIGN.md', 'IMPLEMENTATION-LEFTOVERS.md', 'package.json', 'THIRD_PARTY_NOTICES.md']) cpSync(join(root, file), join(skillDir, file));",
    '',
  ].join('\n');
}
