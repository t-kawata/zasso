// @verifies C001 C002 C003 C004 C005 C006 C012
/**
 * PX-426 core: law bundle generation, identity, closure, gate/attest,
 * conformance, and the enforcement audit.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateLawBundle } from '../../../.claude/skills/rust-interface-law/scripts/generate-law-bundle.mjs';
import { loadRuleMap, explainRule } from '../../../.claude/skills/rust-interface-law/scripts/lib/law-bundle.mjs';
import { buildLawManifest } from '../../../.claude/skills/rust-interface-law/scripts/lib/closure.mjs';
import { buildAttestation, checkAttestation } from '../../../.claude/skills/rust-interface-law/scripts/lib/attest.mjs';
import { validateConformance, lintBundle, checkProfile, loadBundle } from '../../../.claude/scripts/amend-rfc-up/okf-core/index.mjs';
import { auditEnforcementSurfaces } from '../../../.claude/skills/rust-interface-law/scripts/lib/enforcement-audit.mjs';

const REPO = process.cwd();
const LAW = join(REPO, '.claude/skills/rust-interface-law');

// [::TICKET::] PX-426, PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-426|PX-425) --for-spec --no-implementation-order`.
function miniSources() {
  const root = mkdtempSync(join(tmpdir(), 'law-src-'));
  writeFileSync(join(root, '15-RULE-REGISTRY.md'), [
    '# 15 — Rule Registry',
    '',
    '| ID | Class | Applicability | Parent | Source | Short statement | Verification | Gate |',
    '|---|---|---|---|---|---|---|---|',
    '| `REST-01` | G | rest | REST | Part III.6 | Credentials come only from `Authorization: Bearer`. | V3 test. | conformance driver |',
    '| `REST-02` | G | rest | REST | Part III.6 | Tokens MUST NOT appear in query strings or paths. | V3 test. | conformance driver |',
    '| `WS-01` | C | websocket | WS | Part III.7 | A WebSocket message maps to one operation invocation. | V3 test. | conformance driver |',
    '| `ID-01` | C | all | ID | Part II | Identity is verified before authorization. | V3 test. | conformance driver |',
    '',
  ].join('\n'));
  writeFileSync(join(root, '30-REST.md'), [
    '# 30 — REST Adapter',
    '',
    '## 6. HTTP Rules',
    '',
    '| ID | Rule | Fixed | Open | Verification |',
    '|---|---|---|---|---|',
    '| REST-01 | Credentials come only from `Authorization: Bearer`. | Header and scheme. | Token contents. | V3 test. |',
    '| REST-02 | Tokens MUST NOT appear in query strings or paths. | Forbidden. | — | V3 test. |',
    '',
    '## 7. Error Mapping',
    '',
    'REST errors use the semantic envelope.',
    '',
  ].join('\n'));
  writeFileSync(join(root, '31-WEBSOCKET.md'), [
    '# 31 — WebSocket Adapter',
    '',
    '## 6. WebSocket Rules',
    '',
    '| ID | Rule | Verification |',
    '|---|---|---|',
    '| WS-01 | A WebSocket message maps to one operation invocation. | V3 test. |',
    '',
  ].join('\n'));
  writeFileSync(join(root, '22-IDENTITY.md'), [
    '# 22 — Identity',
    '',
    '## 5. Identity Rules',
    '',
    '| ID | Rule | Verification |',
    '|---|---|---|',
    '| ID-01 | Identity is verified before authorization. | V3 test. |',
    '',
  ].join('\n'));
  return root;
}

test('C001: every registry row becomes one path-based Rule concept', async () => {
  const sourceRoot = miniSources();
  const skillRoot = mkdtempSync(join(tmpdir(), 'law-bundle-'));
  const outDir = join(skillRoot, 'okf');
  try {
    const result = generateLawBundle({ sourceRoot, outDir, sourceDir: join(skillRoot, 'source'), date: '2026-11-13' });
    assert.equal(result.rules.length, 4);
    const rest = result.rules.find((rule) => rule.rule_id === 'REST-01');
    assert.equal(rest.concept_id, 'rules/g/rest-01');
    assert.equal(rest.path, 'rules/g/rest-01.md');
    assert.equal(rest.frontmatter.type, 'Rule');
    assert.equal(rest.frontmatter['x-rule-id'], 'REST-01');
    assert.equal(rest.frontmatter['x-applies-to'], 'rest');
    assert.ok(rest.frontmatter.sources[0].resource.endsWith('30-REST.md'));
    assert.match(rest.body, /Authorization: Bearer/);
    assert.match(rest.body, /HTTP Rules/);
    const bundle = await loadBundle(outDir);
    assert.equal(bundle.concepts.length, result.rules.length + result.sections.length);
    assert.deepEqual(validateConformance(bundle), []);
  } finally {
    rmSync(sourceRoot, { recursive: true, force: true });
    rmSync(skillRoot, { recursive: true, force: true });
  }
});

test('C002: explain --rule resolves through x-rule-id after a path rename', async () => {
  const sourceRoot = miniSources();
  const skillRoot = mkdtempSync(join(tmpdir(), 'law-bundle-'));
  const outDir = join(skillRoot, 'okf');
  try {
    generateLawBundle({ sourceRoot, outDir, sourceDir: join(skillRoot, 'source'), date: '2026-11-13' });
    const ruleMapPath = join(skillRoot, 'source/rule-concepts.json');
    const ruleMap = loadRuleMap(ruleMapPath);
    assert.equal(ruleMap.byRule.get('REST-01').concept_id, 'rules/g/rest-01');
    renameSync(join(outDir, 'rules/g/rest-01.md'), join(outDir, 'rules/g/rest-01-renamed.md'));
    ruleMap.byRule.get('REST-01').concept_id = 'rules/g/rest-01-renamed';
    const output = await explainRule({ ruleId: 'REST-01', ruleMap, skillRoot });
    assert.match(output, /REST-01/);
    assert.match(output, /Authorization: Bearer/);
    assert.equal(ruleMap.byRule.get('REST-01').concept_id, 'rules/g/rest-01-renamed');
  } finally {
    rmSync(sourceRoot, { recursive: true, force: true });
    rmSync(skillRoot, { recursive: true, force: true });
  }
});

test('C003: the law manifest carries rule and concept ids and a complete closure', async () => {
  const sourceRoot = miniSources();
  const skillRoot = mkdtempSync(join(tmpdir(), 'law-skill-'));
  try {
    prepareMiniLawSkill({ sourceRoot, skillRoot });
    const manifest = await buildLawManifest({
      skillRoot,
      units: [{ id: 'app-rest', role: 'rest', interfaces: ['rest'], phases: ['adapter'] }],
    });
    const rest = manifest.nodes.find((node) => node.id === 'REST-01');
    assert.ok(rest);
    assert.equal(rest.concept_id, 'rules/g/rest-01');
    assert.equal(rest.phase, 'adapter');
    assert.ok(Array.isArray(rest.requires));
    const bundle = await loadBundle(join(skillRoot, 'okf'));
    const set = await buildLawContext({ bundle, manifest, ruleId: 'REST-01' });
    assert.ok(set.required.includes('rules/g/rest-01'));
  } finally {
    rmSync(sourceRoot, { recursive: true, force: true });
    rmSync(skillRoot, { recursive: true, force: true });
  }
});

test('C004: gate exit semantics and attest rows carry rule and concept ids', async () => {
  const manifest = {
    nodes: [
      { id: 'REST-01', concept_id: 'rules/g/rest-01', phase: 'adapter', delivery: 'must', verify: [{ mode: 'process' }] },
      { id: 'REST-02', concept_id: 'rules/g/rest-02', phase: 'adapter', delivery: 'must', verify: [{ mode: 'process' }] },
      { id: 'WS-01', concept_id: 'rules/c/ws-01', phase: 'adapter', delivery: 'must', verify: [{ mode: 'process' }] },
    ],
  };
  const rows = buildAttestation(manifest, 'adapter');
  assert.ok(rows.rows.every((row) => row.rule && row.concept_id));
  assert.throws(() => checkAttestation(manifest, 'adapter', rows.rows), /unset rule/);
  assert.throws(
    () => checkAttestation(manifest, 'adapter', rows.rows.map((row) => ({ ...row, status: 'applied' }))),
    /requires evidence/,
  );
});

test('C005: broken links pass conformance but fail lint; a missing required rule fails profile', async () => {
  const sourceRoot = miniSources();
  const skillRoot = mkdtempSync(join(tmpdir(), 'law-bundle-'));
  const outDir = join(skillRoot, 'okf');
  try {
    generateLawBundle({ sourceRoot, outDir, sourceDir: join(skillRoot, 'source'), date: '2026-11-13' });
    const bundle = await loadBundle(outDir);
    assert.deepEqual(validateConformance(bundle), []);
    writeFileSync(join(outDir, 'rules/g/rest-01.md'), `${readFileSync(join(outDir, 'rules/g/rest-01.md'), 'utf8')}\n[missing](./missing.md)\n`);
    const changed = await loadBundle(outDir);
    assert.deepEqual(validateConformance(changed), []);
    assert.ok(lintBundle(changed).some((finding) => finding.code === 'LINK_BROKEN'));
    assert.ok(checkProfile(changed, { requiredRules: ['REST-99'] }).some((finding) => finding.code === 'MISSING_REQUIRED_RULE'));
  } finally {
    rmSync(sourceRoot, { recursive: true, force: true });
    rmSync(skillRoot, { recursive: true, force: true });
  }
});

test('C006: every enforcement surface is audited and gate/attest is preserved', () => {
  const audit = auditEnforcementSurfaces({ root: REPO });
  assert.ok(audit.surfaces.length >= 12);
  assert.equal(audit.findings.filter((finding) => finding.code === 'STALE_OKF_PHRASE').length, 0);
  for (const file of ['CLAUDE.md', '.claude/CLAUDE.md', '.claude/commands/start-ticket.md', '.claude/commands/review-ticket.md']) {
    assert.ok(audit.surfaces.some((surface) => surface.file.endsWith(file)), file);
  }
  assert.ok(audit.surfaces.every((surface) => surface.gateAttestPreserved));
});

// [::TICKET::] PX-426, PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-426|PX-425) --for-spec --no-implementation-order`.
function prepareMiniLawSkill({ sourceRoot, skillRoot }) {
  const outDir = join(skillRoot, 'okf');
  mkdirSync(outDir, { recursive: true });
  generateLawBundle({ sourceRoot, outDir, sourceDir: join(skillRoot, 'source'), date: '2026-11-13' });
  cpSync(join(REPO, '.claude/skills/rust-interface-law/scripts'), join(skillRoot, 'scripts'), { recursive: true });
  cpSync(join(REPO, '.claude/scripts/amend-rfc-up/okf-core'), join(skillRoot, 'okf-core'), { recursive: true });

}

// [::TICKET::] PX-426, PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-426|PX-425) --for-spec --no-implementation-order`.
async function buildLawContext({ bundle, manifest, ruleId }) {
  const node = manifest.nodes.find((entry) => entry.id === ruleId);
  const required = [node.concept_id];
  return { required };
}
