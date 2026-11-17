import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL = fileURLToPath(new URL('../', import.meta.url));
const SCANNED_EXTENSIONS = ['.md', '.mjs', '.json', '.toml'];
// Tokens are assembled at runtime so this file does not match its own scan.
const LAW_TOKEN = ['rust', 'interface', 'law'].join('-');
const INTEGRATION_TOKEN = ['law-skill', 'checkpoint'].join(':');
const USERS_PREFIX = ['', 'Users', ''].join('/');
const FORBIDDEN = [
  [new RegExp('[\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff]'), 'CJK'],
  [new RegExp('\\bPX-\\d+\\b'), 'TICKET_ID'],
  [new RegExp(`${USERS_PREFIX}[A-Za-z0-9._-]+`), 'ABSOLUTE_PATH'],
  [new RegExp(LAW_TOKEN), 'LAW_LEAK'],
  [new RegExp(INTEGRATION_TOKEN), 'INTEGRATION_LEAK'],
];
const REQUIRED_SECTIONS = [
  '## Traversal Contract',
  '## Start Here',
  '## Directory Traversal',
  '## Concept Page',
  '## Outgoing and Incoming',
  '## Multi-Hop Reach',
  '## Required Context',
  '## Zero Results',
  '## Budget Exceeded',
  '## Trust and Freshness',
  '## Sources and Citation',
  '## Authoring and Update',
  '## Failure Modes',
];

function treeFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) files.push(...treeFiles(path));
    else files.push(path);
  }
  return files;
}

test('the generated tree carries no host, ticket, law, or CJK token', () => {
  const findings = [];
  for (const file of treeFiles(SKILL)) {
    if (!SCANNED_EXTENSIONS.some((extension) => file.endsWith(extension))) continue;
    const text = readFileSync(file, 'utf8');
    for (const [pattern, code] of FORBIDDEN) {
      if (pattern.test(text)) findings.push(`${code}:${relative(SKILL, file)}`);
    }
  }
  assert.deepEqual(findings, []);
});

test('the manual teaches all thirteen sections', () => {
  const manual = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');
  for (const section of REQUIRED_SECTIONS) assert.ok(manual.includes(section), section);
  assert.ok(manual.split('\n').length > 40);
});

test('the manual carries at least ten scenario recipes', () => {
  const manual = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');
  const scenarios = (manual.match(/^### Scenario/gm) ?? []).length;
  assert.ok(scenarios >= 10, `scenarios: ${scenarios}`);
});

test('the manual does not name a machine output mode', () => {
  const manual = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');
  assert.equal(manual.includes('--format json'), false);
  assert.equal(manual.includes('--format=json'), false);
});

test('the traversal contract is the engine protocol verbatim', () => {
  const manual = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');
  const start = manual.indexOf('## Traversal Contract');
  const rest = manual.slice(start + '## Traversal Contract'.length);
  const end = rest.indexOf('\n## ');
  const section = `## Traversal Contract${end === -1 ? rest : rest.slice(0, end)}`.trim();
  const protocol = readFileSync(join(SKILL, 'okf-core/traversal-protocol.md'), 'utf8')
    .trimEnd()
    .split('\n')
    .map((line, index) => {
      if (index === 0) return line.replace(/^# /, '## ');
      return line.replace(/^## /, '### ');
    })
    .join('\n')
    .trim();
  assert.equal(section, protocol);
});
