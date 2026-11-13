'use strict';

/**
 * PX-418 fixtures for /amend-rfc-up tests.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const LAW_SKILL_DIR = path.join(REPO_ROOT, '.claude/skills/rust-interface-law');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function makeFixturePackage({ ticketStatus = 'planned' } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'px418-package-'));
  fs.writeFileSync(path.join(directory, 'Tickets.json'), JSON.stringify({
    title: 'fixture',
    round: 1,
    metadata: { source: 'fixture', generatedAt: '2026-01-01' },
    phases: [{
      id: -1,
      name: '[X] fixture phase',
      tickets: [{ id: 418, phaseId: -1, status: ticketStatus, title: 'fixture ticket' }],
    }],
  }, null, 2) + '\n');
  fs.writeFileSync(path.join(directory, 'RFC.md'), '# RFC\n\n## 1. Design\n\nBase design.\n');
  fs.writeFileSync(path.join(directory, 'RFC-GRAPH.json'), JSON.stringify({ version: 1, nodes: [], edges: [] }, null, 2) + '\n');
  fs.writeFileSync(path.join(directory, 'RFC-Dirs-Tree.json'), JSON.stringify({ version: 1, directories: [], files: [] }, null, 2) + '\n');
  fs.writeFileSync(path.join(directory, 'RFC-SEED.md'), '# Seed\n');
  fs.writeFileSync(path.join(directory, 'FINDINGS.json'), JSON.stringify([{ instruction: 'Change the design' }], null, 2) + '\n');
  fs.mkdirSync(path.join(directory, 'src'), { recursive: true });
  return directory;
}

function makeEmptyDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'px418-empty-'));
}

function cleanup(directory) {
  fs.rmSync(directory, { recursive: true, force: true });
}

const RFC_CHANGE = Object.freeze({
  id: 'CH1',
  artifact: 'rfc',
  operation: 'append',
  target: { kind: 'clause', id: '1. Design' },
  predicate: 'the design states the REST operation entry invariant',
  requiredTest: 'node .claude/skills/rust-interface-law/dist/skill.mjs gate --manifest amend/law/manifest.json',
  text: 'REST-01 requires one typed operation entry.\n\n```rust\npub async fn execute() { handle_request(); }\n```\n\nProof: gate.',
  evidence: ['I1'],
});

const GRAPH_CHANGE = Object.freeze({
  id: 'CH2',
  artifact: 'graph',
  operation: 'owner-rederive',
  owner: 'graphify',
  reason: 'the RFC section changed',
  evidence: ['I2'],
});

const DIRS_TREE_CHANGE = Object.freeze({
  id: 'CH3',
  artifact: 'dirs-tree',
  operation: 'owner-rederive',
  owner: 'boundify',
  reason: 'the graph changed',
  evidence: ['I2'],
  dependsOn: ['CH2'],
});

const TICKETS_CHANGE = Object.freeze({
  id: 'CH4',
  artifact: 'tickets',
  operation: 'owner-rederive',
  owner: 'split',
  reason: 'the dirs-tree changed',
  evidence: ['I2'],
  dependsOn: ['CH3'],
});

function makeChange(overrides = {}) {
  return { ...RFC_CHANGE, ...overrides };
}

function appendRunner() {
  return async ({ change, ticketKey, packageDir, apply }) => {
    if (apply === false) return { outcome: 'dry-run', wouldPromote: true, findings: [], unverifiable: [] };
    const { appendAmendment } = require('../../.claude/scripts/tickets/append-design-amendment.js');
    const rfcPath = path.join(packageDir, 'RFC.md');
    const appended = appendAmendment({
      filePath: rfcPath,
      ticketKey,
      title: change.id,
      body: change.text,
    });
    const ledgerPath = path.join(packageDir, 'amendments', `${ticketKey}-1.json`);
    fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
    fs.writeFileSync(ledgerPath, JSON.stringify({ ticketKey, artifact: change.artifact }) + '\n');
    return { outcome: 'promoted', noChange: appended.noChange === true, ledgerPath };
  };
}

function failingGate() {
  return { findings: [{ code: 'GATE_FAILED', asset: 'fixture', problem: 'forced failure' }] };
}

const APPLIES_OUTPUT = [
  '# Law applicability — APPLIES',
  '',
  '| Field | Value |',
  '|---|---|',
  '| Matched units | `doors-rest` (rest) |',
  '| Phases | contract, adapter |',
  '',
].join('\n');

function makeLawSkillFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'px418-law-skill-'));
  const sourceText = '# Law\n';
  const sourceHash = sha256(sourceText);
  const atomText = 'Rule text';
  const atomHash = sha256(atomText);
  fs.mkdirSync(path.join(directory, 'okf/nodes'), { recursive: true });
  fs.mkdirSync(path.join(directory, 'source'), { recursive: true });
  fs.mkdirSync(path.join(directory, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(directory, 'dist'), { recursive: true });
  fs.mkdirSync(path.join(directory, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'SKILL.md'), '# Fixture Law\n\n## Procedure\n\nUse the CLI.\n');
  fs.writeFileSync(path.join(directory, 'okf/index.md'), '# Index\n');
  fs.writeFileSync(path.join(directory, 'okf/nodes/RULE-01.md'), [
    '---',
    'type: Rule',
    'id: RULE-01',
    'phase: adapter',
    'delivery: must',
    'applies_to: all',
    `content_sha256: ${atomHash}`,
    '---',
    atomText,
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(directory, 'coverage.json'), JSON.stringify({
    spec_version: '0.1.0',
    files: [{ path: 'source.md', sha256: sourceHash, lines: 1, attributed: 1, excluded: 0, gaps: [], overlaps: [] }],
  }, null, 2) + '\n');
  fs.writeFileSync(path.join(directory, 'coverage.md'), '# Coverage\n');
  fs.writeFileSync(path.join(directory, 'source/manifest.toml'), [
    'spec_version = "0.1.0"',
    `redaction_sha256 = "${sha256('')}"`,
    `source_set_sha256 = "${sha256(`source.md\0${sourceHash}`)}"`,
    '',
    '[[file]]',
    'path = "source.md"',
    `sha256 = "${sourceHash}"`,
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(directory, 'source/redaction.sha256.json'), '[]\n');
  fs.writeFileSync(path.join(directory, 'atoms.lock.json'), JSON.stringify({
    spec_version: '0.1.0',
    atoms: [{ id: 'RULE-01', type: 'Rule', content_sha256: atomHash, phase: 'adapter' }],
  }, null, 2) + '\n');
  fs.writeFileSync(path.join(directory, 'dist/skill.mjs'), [
    '#!/usr/bin/env node',
    "process.stdout.write(`check ${process.argv[2] || 'lint'}: 1 node ok\\n`);",
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(directory, 'install.js'), "const fs = require('node:fs');\nfs.copyFileSync('a', 'b');\n");
  fs.writeFileSync(path.join(directory, 'tests/core.test.mjs'), [
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    "test('fixture core test', () => assert.equal(1, 1));",
    '',
  ].join('\n'));
  return directory;
}

function makeLawManifest() {
  return {
    spec_version: '0.4.0',
    units: [{ id: 'doors-rest', crate: 'doors-rest', role: 'rest', interfaces: ['rest'] }],
    phases: ['contract', 'core', 'operation', 'adapter'],
    nodes: [
      {
        id: 'REST-01',
        type: 'Rule',
        phase: 'adapter',
        delivery: 'must',
        body: 'REST adapter MUST expose one typed operation entry.\n\n```rust\npub async fn execute() {}\n```\n',
        references: [],
        file: '/law/REST-01.md',
      },
      {
        id: 'ARC-01',
        type: 'Rule',
        phase: 'core',
        delivery: 'reference',
        body: 'Reference rule.',
        references: [],
        file: '/law/ARC-01.md',
      },
    ],
  };
}

function makeLawAppliesOutput() {
  return [
    '# Law applicability — APPLIES',
    '',
    '| Field | Value |',
    '|---|---|',
    '| Repository | `/tmp/doors` |',
    '| Paths checked | 1 |',
    '| Matched units | `doors-rest` (rest) |',
    '| Applicable units | `doors-rest` (rest) |',
    '| Phases | contract, core, operation, adapter, docs, conformance |',
    '',
  ].join('\n');
}

const TICKET_KEY = 'PX-417';

const VALID_CLAIM = Object.freeze({
  target: { kind: 'clause', id: '1. Design' },
  predicate: 'the design states the REST operation entry invariant',
  requiredTest: 'node .claude/skills/rust-interface-law/dist/skill.mjs gate --manifest target/law/manifest.json --implementation target/law/implementation-report.json --out target/law/gate-report.json',
  title: 'REST-01: operation entry',
  text: 'REST-01 requires one typed operation entry.\n\n```rust\npub async fn execute() {}\n```\n\nProof: gate.',
});

module.exports = {
  APPLIES_OUTPUT,
  DIRS_TREE_CHANGE,
  GRAPH_CHANGE,
  VALID_CLAIM,
  LAW_SKILL_DIR,
  REPO_ROOT,
  RFC_CHANGE,
  TICKETS_CHANGE,
  TICKET_KEY,
  appendRunner,
  cleanup,
  failingGate,
  makeChange,
  makeEmptyDirectory,
  makeFixturePackage,
  makeLawAppliesOutput,
  makeLawManifest,
  makeLawSkillFixture,
  sha256,
};
