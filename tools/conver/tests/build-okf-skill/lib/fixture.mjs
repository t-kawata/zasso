// @verifies C001
// @verifies C002
// @verifies C011
/**
 * PX-424 — build a complete mini OKF skill for verifier and acceptance tests.
 *
 * The fixture uses the same engine modules the build command uses. It proves
 * composition, not a hand-written golden tree: every hash is computed from the
 * bytes the engine writes.
 */

import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { measureSources, extractClaims } from '../../../.claude/scripts/amend-rfc-up/okf-engine/scripts/lib/atoms.mjs';
import { buildClaimRegistry } from '../../../.claude/scripts/amend-rfc-up/okf-engine/scripts/lib/claims.mjs';
import {
  buildLock,
  renderClaimInventory,
  renderKnowledgeCoverage,
  renderManifestToml,
} from '../../../.claude/scripts/amend-rfc-up/okf-engine/scripts/lib/manifest.mjs';
import { renderOkf } from '../../../.claude/scripts/amend-rfc-up/okf-engine/scripts/lib/render-okf.mjs';
import { normalizeSharedModule } from '../../../.claude/scripts/amend-rfc-up/okf-engine/scripts/lib/drift.mjs';

export const ENGINE_DIR = new URL('../../../.claude/scripts/amend-rfc-up/okf-engine/', import.meta.url).pathname;
export const LAW_LIB_DIR = new URL('../../../.claude/skills/rust-interface-law/scripts/lib/', import.meta.url).pathname;

export const SHARED_MODULES = Object.freeze([
  ['scripts/lib/markdown.mjs', 'markdown.mjs'],
  ['scripts/lib/redact.mjs', 'redact.mjs'],
  ['scripts/lib/toml.mjs', 'toml.mjs'],
  ['scripts/lib/path-alias.mjs', 'path-alias.mjs'],
  ['scripts/lib/okf.mjs', 'okf.mjs'],
  ['scripts/lib/coverage.mjs', 'coverage.mjs'],
]);

export function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function createSourceTree(files) {
  const root = mkdtempSync(join(tmpdir(), 'okf-sources-'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, name), text);
  return root;
}

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
function write(path, text) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, text);
}

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
function usageManual(name) {
  return [
    `# ${name}`,
    '',
    'Answer from verified OKF nodes. Every answer cites a node id.',
    '',
    '## When to Use',
    '',
    'Use when a task needs a factual answer grounded in the frozen source set.',
    '',
    '## Query Recipes',
    '',
    'Ask a question, then read the cited page.',
    '',
    '## Evidence and Citation',
    '',
    'Every claim names a node and a source span.',
    '',
    '## Freshness and Conflict',
    '',
    'Report stale nodes and symmetric conflicts.',
    '',
    '## Update Procedure',
    '',
    'Add a source, rebuild, and verify.',
    '',
    '## Page Authoring',
    '',
    'Keep one claim per page and link related pages.',
    '',
    '## Failure Modes',
    '',
    'Return no answer when no cited node supports it.',
    '',
    '## Examples',
    '',
    '### Example 1',
    '',
    'Ask: when do tokens expire? Answer with [AUTH-01].',
    '',
    '### Example 2',
    '',
    'Ask: when do sessions end? Answer with [SESS-01].',
    '',
  ].join('\n');
}

export function createMiniSkill({ sources, name = 'mini-okf' } = {}) {
  const files = sources ?? {
    'auth.md': '# Auth\n\nTokens expire after 15 minutes.\n\nRefresh tokens rotate on use.\n',
    'session.md': '# Session\n\nSessions persist until sign-out.\n',
  };
  const root = createSourceTree(files);
  const paths = Object.keys(files);
  const measured = measureSources({ root, paths });
  const claims = extractClaims({ atoms: measured.atoms });
  const registry = buildClaimRegistry({ claims });
  const lock = buildLock({ measured, claims, registry });
  const skillDir = join(root, '.claude/skills', name);
  const okfDir = join(skillDir, 'okf');
  renderOkf({ lock, outDir: okfDir });

  write(join(skillDir, 'source/manifest.toml'), renderManifestToml({ lock }));
  write(join(skillDir, 'source/claim-registry.json'), `${JSON.stringify({ schema: 'okf-claim-registry/v1', entries: registry }, null, 2)}\n`);
  write(join(skillDir, 'source/claim-inventory.json'), `${JSON.stringify(renderClaimInventory({ claims }), null, 2)}\n`);
  write(join(skillDir, 'source/knowledge-coverage.json'), `${JSON.stringify(renderKnowledgeCoverage({ lock }), null, 2)}\n`);
  write(join(skillDir, 'source/line-coverage.json'), `${JSON.stringify({ schema: 'okf-line-coverage/v1', sources: measured.lineCoverage }, null, 2)}\n`);
  write(join(skillDir, 'source/redaction.sha256.json'), '[]\n');
  write(join(skillDir, 'source/redaction.review.json'), `${JSON.stringify({ schema: 'okf-redaction-review/v1', entries: [] }, null, 2)}\n`);
  write(join(skillDir, 'source/input-ledger.json'), `${JSON.stringify({ schema: 'okf-input-ledger/v1', entries: paths.map((path) => ({ alias: `sources/${path}`, decision: 'included' })) }, null, 2)}\n`);
  write(join(skillDir, 'source/okf-profile.toml'), 'domain = "mini"\nlanguage = "en"\n');
  write(join(skillDir, 'atoms.lock.json'), `${JSON.stringify(lock, null, 2)}\n`);
  write(join(skillDir, 'SKILL.md'), usageManual(name));
  write(join(skillDir, 'DESIGN.md'), `# ${name} design\n\nGenerated from the mini source set.\n`);
  write(join(skillDir, 'IMPLEMENTATION-LEFTOVERS.md'), '# Leftovers\n\nNone.\n');

  cpSync(join(ENGINE_DIR, 'scripts'), join(skillDir, 'scripts'), { recursive: true });
  const modules = SHARED_MODULES.map(([copy, law]) => {
    const text = normalizeSharedModule(readFileSync(join(ENGINE_DIR, copy), 'utf8'));
    return { copy, law, sha256: sha256(text), strip: 'ticket-annotation' };
  });
  write(join(skillDir, 'source/shared-engine.json'), `${JSON.stringify({ schema: 'okf-shared-engine/v1', modules }, null, 2)}\n`);

  write(join(skillDir, 'dist/skill.mjs'), "#!/usr/bin/env node\nimport { main } from '../scripts/cli.mjs';\nmain(process.argv.slice(2)).then((code) => { process.exitCode = code; });\n");
  write(join(skillDir, 'install.js'), [
    "const { cpSync, existsSync, mkdirSync } = require('node:fs');",
    "const { join } = require('node:path');",
    'const root = __dirname;',
    'const target = process.argv[2] ?? process.cwd();',
    "const skillDir = join(target, '.claude/skills/' + require('node:path').basename(root));",
    "if (!existsSync(join(root, 'dist/skill.mjs'))) process.exit(1);",
    'mkdirSync(join(skillDir, \'dist\'), { recursive: true });',
    "cpSync(join(root, 'dist/skill.mjs'), join(skillDir, 'dist/skill.mjs'));",
    "for (const part of ['scripts', 'okf', 'source', 'tests/fixtures/runtime']) cpSync(join(root, part), join(skillDir, part), { recursive: true });",
    "for (const file of ['atoms.lock.json', 'SKILL.md', 'DESIGN.md', 'IMPLEMENTATION-LEFTOVERS.md']) cpSync(join(root, file), join(skillDir, file));",
    '',
  ].join('\n'));
  write(join(skillDir, 'tests/smoke.test.mjs'), "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('skill loads', () => assert.ok(true));\n");
  write(join(skillDir, 'tests/fixtures/runtime/runtime.json'), `${JSON.stringify({ ok: true })}\n`);

  const aliasPath = join(root, '.claude/skills', `${name}.path-alias.json`);
  write(aliasPath, `${JSON.stringify({
    schema: 'okf-path-alias/v1',
    input_roots: [root],
    aliases: Object.fromEntries(paths.map((path) => [`sources/${path}`, path])),
  }, null, 2)}\n`);

  return { root, skillDir, aliasPath, lock, measured, claims, registry };
}

export function treeDigest(directory, roots) {
  const digest = createHash('sha256');
  for (const rootName of roots) {
    const absolute = join(directory, rootName);
    for (const file of listFiles(absolute)) {
      digest.update(relative(directory, file));
      digest.update('\0');
      digest.update(readFileSync(file));
      digest.update('\0');
    }
  }
  return digest.digest('hex');
}

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
function listFiles(directory) {
  const collected = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collected.push(...listFiles(path));
    else collected.push(path);
  }
  return collected.sort();
}
