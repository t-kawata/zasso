/**
 * The bundled natenv-okf skill is the ideal exemplar for /build-okf-skill.
 * These tests pin the properties that make it an exemplar: a real prerequisite
 * graph, a non-trivial required closure, and a portable pre-OKF original.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const skill = join(here, '../../../../.claude/skills/natenv-okf');
const cli = join(skill, 'dist/skill.mjs');
const pagesRoot = join(skill, 'okf/pages/pre-okf-original');

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: skill, encoding: 'utf8' });
}

function frontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(match, 'frontmatter is absent');
  const fields = {};
  let key = null;
  for (const line of match[1].split('\n')) {
    const entry = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (entry) {
      key = entry[1];
      fields[key] = entry[2].trim();
    } else if (/^\s+-\s+/.test(line) && key) {
      fields[key] = fields[key] === '' ? [] : fields[key];
      fields[key].push(line.replace(/^\s+-\s+/, '').trim());
    }
  }
  return fields;
}

test('every non-preamble concept declares at least one prerequisite', () => {
  for (const file of readdirSync(pagesRoot)) {
    if (!file.endsWith('.md') || file === 'index.md' || file === 'preamble.md') continue;
    const fields = frontmatter(readFileSync(join(pagesRoot, file), 'utf8'));
    const requires = fields['x-requires'];
    assert.ok(Array.isArray(requires) && requires.length > 0, `${file} has no x-requires`);
  }
});

test('the required closure is transitive and non-trivial', () => {
  const result = run([
    'required',
    '--entry',
    'pages/pre-okf-original/33-wiki-decomposition',
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /preamble/);
  assert.match(result.stdout, /0-execution-contract|1-terms-layers-fidelity/);
  const requiredLine = result.stdout.split('\n').find((line) => line.startsWith('- required:'));
  assert.ok(requiredLine, 'required line is absent');
  const ids = requiredLine.replace('- required:', '').split(',').map((id) => id.trim()).filter(Boolean);
  assert.ok(ids.length >= 5, `closure is too small: ${ids.length}`);
});

test('the exemplar ships and indexes its execution assets', () => {
  const assets = join(skill, 'EXEC_ASSETS');
  assert.ok(existsSync(assets), 'EXEC_ASSETS is absent');
  const files = listFiles(assets);
  assert.equal(files.length, 46);

  const pageDir = join(skill, 'okf/pages/exec-assets');
  const pages = readdirSync(pageDir).filter((name) => name.endsWith('.md') && name !== 'index.md');
  assert.equal(pages.length, files.length);

  const list = run(['list', '--path', 'pages/exec-assets']);
  assert.equal(list.status, 0, list.stderr);
  assert.match(list.stdout, /pages\/exec-assets\/scripts-probe-py/);

  const required = run(['required', '--entry', 'pages/exec-assets/scripts-probe-py']);
  assert.equal(required.status, 0, required.stderr);
  assert.match(required.stdout, /15-minimum-path-acceptance/);

  const install = readFileSync(join(skill, 'install.js'), 'utf8');
  assert.match(install, /EXEC_ASSETS/);

  const record = JSON.parse(readFileSync(join(here, '../../../../target/okf/okf-builds.json'), 'utf8'));
  const build = record.builds.find((entry) => entry.name === 'natenv-okf');
  assert.equal(build.sources[0].assetFiles, files.length);
  assert.equal(build.sources[0].assetConcepts, pages.length);
  assert.equal(build.sources[0].assetUnmappedFiles, 0);
  assert.equal(build.sources[0].assetUnmappedLines, 0);
});

function listFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) files.push(...listFiles(path));
    else files.push(path);
  }
  return files;
}

test('the skill carries a byte-identical PRE-OKF-ORIGINAL.md and its ledger', () => {
  const original = join(skill, 'PRE-OKF-ORIGINAL.md');
  const ledger = join(skill, 'source/pre-okf-original.json');
  assert.ok(existsSync(original), 'PRE-OKF-ORIGINAL.md is absent');
  assert.ok(existsSync(ledger), 'source/pre-okf-original.json is absent');
  const record = JSON.parse(readFileSync(ledger, 'utf8'));
  assert.equal(record.schema, 'pre-okf-original/v1');
  const text = readFileSync(original, 'utf8').replace(/\r\n?/g, '\n');
  const hash = createHash('sha256').update(text, 'utf8').digest('hex');
  assert.equal(record.sha256, hash);
  assert.equal(record.bytes, Buffer.byteLength(text, 'utf8'));
  assert.ok(record.source, 'the ledger must name the source alias');
});

test('the installer ships the pre-OKF original to the installed tree', () => {
  const install = readFileSync(join(skill, 'install.js'), 'utf8');
  assert.match(install, /PRE-OKF-ORIGINAL\.md/);
  assert.match(install, /pre-okf-original\.json/);
});

test('the acceptance record matches the current check-set version', () => {
  const checks = JSON.parse(
    readFileSync(join(here, '../../.claude/scripts/amend-rfc-up/okf-verify/checks.json'), 'utf8'),
  );
  const record = JSON.parse(readFileSync(join(here, '../../../../target/okf/okf-builds.json'), 'utf8'));
  assert.equal(record.schema, 'okf-builds/v2');
  assert.equal(record.check_set_version, checks.check_set_version);
  assert.ok(record.builds.some((build) => build.name === 'natenv-okf'));
});
