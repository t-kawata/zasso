// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
/**
 * Full-skill staging helpers.
 *
 * Update mode never edits the installed tree. It copies the baseline into a
 * staging directory, patches only the artifacts the revision changes, and lets
 * the canonical verifier decide whether the result is installable.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { sha256Text } from './determinism.mjs';
import { failRevision } from './errors.mjs';

export function prepareSkillTree({ baselineSkill, outDir }) {
  if (!existsSync(baselineSkill)) {
    failRevision('REVISION_BASELINE_MISSING', `baseline skill is absent: ${baselineSkill}`, { target: baselineSkill });
  }
  rmSync(outDir, { recursive: true, force: true });
  cpSync(baselineSkill, outDir, { recursive: true });
  // A staging tree must describe this update only; a previous revision ledger
  // would make the new verification read stale evidence.
  rmSync(join(outDir, 'source/revision'), { recursive: true, force: true });
  mkdirSync(join(outDir, 'source/revision'), { recursive: true });
  return outDir;
}

export function readJsonFile(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function writeJsonFile(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function readTextFile(path) {
  return readFileSync(path, 'utf8');
}

export function writeTextFile(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

export function writeAliasFile({ aliasPath, schema, skill, aliases, inputRoots = [] }) {
  if (!aliasPath) return null;
  writeJsonFile(aliasPath, { schema, skill, input_roots: inputRoots, aliases });
  return aliasPath;
}

export function aliasPathFor({ sourceRoot, targetPath }) {
  if (!sourceRoot) return resolve(targetPath);
  return relative(resolve(sourceRoot), resolve(targetPath));
}

/**
 * Append or replace one TOML file entry. The laws verifier parses a narrow
 * block shape, so the writer keeps `path` before `sha256` and one blank line
 * between entries.
 */
export function upsertManifestFile({ manifestPath, alias, sha256, bytes = null, lines = null }) {
  const text = existsSync(manifestPath) ? readFileSync(manifestPath, 'utf8') : '';
  const entries = splitManifest(text);
  const next = entries.filter((entry) => entry.alias !== alias);
  next.push({ alias, sha256, bytes, lines });
  const header = text.split('[[file]]')[0].replace(/\n+$/, '');
  const blocks = next.map((entry) => renderManifestEntry(entry)).join('\n\n');
  writeTextFile(manifestPath, `${header}\n\n${blocks}\n`);
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function splitManifest(text) {
  const chunks = text.split('[[file]]').slice(1);
  return chunks.map((chunk) => {
    const read = (name) => {
      const match = chunk.match(new RegExp(`^${name}\\s*=\\s*"([^"]*)"`, 'm'));
      return match ? match[1] : null;
    };
    return { alias: read('path'), sha256: read('sha256'), bytes: read('bytes'), lines: read('lines') };
  }).filter((entry) => entry.alias);
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function renderManifestEntry({ alias, sha256, bytes, lines }) {
  const linesOut = [`[[file]]`, `path = "${alias}"`, `sha256 = "${sha256}"`];
  if (lines !== null) linesOut.push(`lines = "${lines}"`);
  if (bytes !== null) linesOut.push(`bytes = "${bytes}"`);
  return linesOut.join('\n');
}

export function writePreOkfOriginal({ outDir, text, alias }) {
  writeTextFile(join(outDir, 'PRE-OKF-ORIGINAL.md'), text);
  writeJsonFile(join(outDir, 'source/pre-okf-original.json'), {
    schema: 'pre-okf-original/v1',
    source: alias,
    sha256: sha256Text(text),
    bytes: Buffer.byteLength(text, 'utf8'),
  });
}

export function appendInputLedger({ outDir, entry }) {
  const path = join(outDir, 'source/input-ledger.json');
  const ledger = existsSync(path) ? readJsonFile(path) : { schema: 'revision-input-ledger/v1', entries: [] };
  const entries = Array.isArray(ledger.entries) ? ledger.entries : [];
  const next = entries.filter((existing) => existing.alias !== entry.alias);
  next.push(entry);
  writeJsonFile(path, { ...ledger, entries: next });
}

export function appendOkfInputLedger({ outDir, entry }) {
  const path = join(outDir, 'source/input-ledger.json');
  const ledger = existsSync(path) ? readJsonFile(path) : { schema: 'okf-input-ledger/v1', inputs: [], counts: { included: 0, excluded: 0 } };
  const inputs = Array.isArray(ledger.inputs) ? ledger.inputs : [];
  const next = inputs.filter((existing) => existing.path !== entry.path);
  next.push(entry);
  const included = next.filter((input) => input.status === 'included').length;
  writeJsonFile(path, { ...ledger, inputs: next, counts: { ...(ledger.counts ?? {}), included } });
}

export function appendSourceView({ outDir, baselineSkill, notice }) {
  const source = join(baselineSkill, 'source/source-view.md');
  const base = existsSync(source)
    ? readFileSync(source, 'utf8').replace(/\n+$/, '')
    : '# Source View\n\nGenerated from the source documents. Do not edit.';
  const text = `${base}\n\n${notice}\n`;
  writeTextFile(join(outDir, 'source/source-view.md'), text);
  writeTextFile(join(outDir, 'source/source.baseline.md'), text);
  return text;
}

export function updatePackageVersion({ outDir, version }) {
  const path = join(outDir, 'package.json');
  if (!existsSync(path)) return null;
  const record = readJsonFile(path);
  writeJsonFile(path, { ...record, version });
  return version;
}

/**
 * Generated law tests carry the build's rule count. An update that adds or
 * retires a rule must regenerate that expectation; the tests still assert the
 * bijection and lock equality, so the count is not the only evidence.
 */
export function syncGeneratedRuleCount({ outDir, baselineCount, effectiveCount }) {
  if (baselineCount === effectiveCount) return;
  for (const file of ['tests/integration.test.mjs', 'tests/source-rederivation.test.mjs']) {
    const path = join(outDir, file);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, 'utf8');
    const next = text.split(String(baselineCount)).join(String(effectiveCount));
    if (next !== text) writeTextFile(path, next);
  }
}

export function stripFrontmatter(text) {
  const match = String(text).match(/^---\n[\s\S]*?\n---\n/);
  return match ? { frontmatterText: match[0], body: String(text).slice(match[0].length) } : { frontmatterText: '', body: String(text) };
}
