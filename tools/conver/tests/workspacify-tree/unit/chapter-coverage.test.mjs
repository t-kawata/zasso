// A numbered specification chapter is a unit of design. If no package
// responsibility names it, the workspace has no directory that can implement it.
// These tests pin the gate that refuses to publish such a manifest, including the
// case the previous gate accepted: a pulse candidate settled in spec_defects.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkChapterCoverage } from '../../../.claude/scripts/workspacify-tree/lib/chapter-coverage.mjs';
import { runGatePipeline } from '../../../.claude/scripts/workspacify-tree/lib/validation.mjs';
import { GATE_STATUS } from '../../../.claude/scripts/workspacify-tree/lib/errors.mjs';
import { stageTreeDecisions } from '../helpers/stage-tree-decisions.mjs';
import { settlePulseCandidates } from '../helpers/settle-pulse.mjs';

const RUN_SCRIPT = fileURLToPath(new URL('../../../.claude/scripts/workspacify-tree/run.mjs', import.meta.url));

const headings = [
  { id: 'h-000001', level: 1, text: 'Design' },
  { id: 'h-000002', level: 2, text: 'S18 Autonomous tools; WASM; Exact ABI' },
  { id: 'h-000003', level: 2, text: 'S19 Proof AST; evaluator updates' },
  { id: 'h-000004', level: 2, text: 'S20 Finite certification; words; generalization; search arithmetic' },
];

const storageObject = {
  id: 'obj-000001',
  canonical_name: 'StorageRecord',
  classification: 'record',
  owner_package: 'pkg-0001',
  source_refs: [{ line_start: 1, byte_start: 0, byte_end: 10 }],
};

const packageWith = (responsibilities) => ({
  id: 'pkg-0001',
  name: 'storage',
  path: 'crates/protocol/storage',
  layer: 'protocol',
  kind: 'production-library',
  responsibilities,
  seed_required: true,
  owns: { objects: ['obj-000001'], claims: [], invariants: [], state_machines: [], error_codes: [], required_tests: [] },
});

const pipelineInput = ({ responsibilities, specDefects = [], specPulse = { candidates: [] }, chapterHeadings = headings }) => ({
  structure: { reconstruction: { status: 'PASS' }, headings: chapterHeadings, spec_pulse: specPulse },
  inventory: {
    objects: [storageObject],
    claims: [],
    terms: [],
    invariants: [],
    stateMachines: [],
    errorCodes: [],
    requiredTests: [],
    normalization_decisions: [],
    unresolved_candidates: [],
  },
  workspace: {
    packages: [packageWith(responsibilities)],
    tree: [{ name: 'crates', path: 'crates', kind: 'dir', children: [{ name: 'protocol', path: 'crates/protocol', kind: 'dir', children: [{ name: 'storage', path: 'crates/protocol/storage', kind: 'dir', children: [] }] }] }],
  },
  dependencies: { normalEdges: [], forbiddenEdges: [], boundaries: [] },
  adapters: { ports: [], databasePolicy: { applicable: false } },
  review: { candidates: [] },
  decisions: {
    approvals: [],
    ownership: [],
    semantic_review: { status: 'APPROVED', statement: 'checked', approver: 'ai-session' },
    spec_defects: specDefects,
    residual_questions: [],
    dependency_reviews: [],
  },
});

const gate = (pipeline, id) => pipeline.gates.find((entry) => entry.id === id);

test('a numbered chapter no responsibility names is uncovered', () => {
  const report = checkChapterCoverage({
    headings,
    packages: [packageWith(['owns proof records (S19)'])],
  });

  assert.equal(report.ok, false);
  assert.equal(report.required_chapter_count, 3);
  assert.equal(report.uncovered_chapter_count, 2);
  assert.deepEqual(report.uncovered.map((entry) => entry.section_id), ['S18', 'S20']);
  assert.ok(report.errors.some((message) => message.includes('S18')));
  assert.ok(report.errors.some((message) => message.includes('S20')));
});

test('a numbered chapter named by any responsibility is covered', () => {
  const report = checkChapterCoverage({
    headings,
    packages: [packageWith(['owns proof records (S19)', 'hosts plugin acquisition (S18)', 'implements finite certification (S20)'])],
  });

  assert.equal(report.ok, true);
  assert.equal(report.uncovered_chapter_count, 0);
  assert.deepEqual(report.uncovered, []);
});

test('headings without the S-numbering are not imposed on another specification', () => {
  const report = checkChapterCoverage({
    headings: [
      { id: 'h-1', level: 2, text: 'Object Catalog' },
      { id: 'h-2', level: 2, text: 'Rules' },
    ],
    packages: [packageWith(['owns storage records'])],
  });

  assert.equal(report.ok, true);
  assert.equal(report.required_chapter_count, 0);
});

test('a longer chapter number is not the same chapter', () => {
  const report = checkChapterCoverage({
    headings,
    packages: [packageWith(['owns proof records (S19)', 'owns S180 records', 'implements S20 certification'])],
  });

  assert.deepEqual(report.uncovered.map((entry) => entry.section_id), ['S18']);
});

test('a clause reference and a parenthesized or leading reference all name the chapter', () => {
  for (const responsibilities of [
    ['owns S18.C01 contracts', 'owns proof records (S19)', 'implements S20 certification'],
    ['owns (S18) contracts', 'owns proof records (S19)', 'implements S20 certification'],
    ['S18 owns the host path', 'owns proof records (S19)', 'implements S20 certification'],
  ]) {
    const report = checkChapterCoverage({ headings, packages: [packageWith(responsibilities)] });
    assert.equal(report.uncovered_chapter_count, 0, responsibilities.join(' | '));
  }
});

test('a responsibility that embeds the number inside a word does not name the chapter', () => {
  const report = checkChapterCoverage({
    headings,
    packages: [packageWith(['owns XS18 records', 'owns proof records (S19)', 'implements S20 certification'])],
  });

  assert.deepEqual(report.uncovered.map((entry) => entry.section_id), ['S18']);
});

test('null inputs and packages without responsibilities are treated as empty', () => {
  const empty = checkChapterCoverage({ headings: null, packages: null });
  assert.equal(empty.ok, true);
  assert.equal(empty.required_chapter_count, 0);

  const missing = checkChapterCoverage({
    headings,
    packages: [{ id: 'pkg-without-responsibilities' }],
  });
  assert.equal(missing.uncovered_chapter_count, 3);
});

test('only level-2 headings and string titles are chapters', () => {
  const report = checkChapterCoverage({
    headings: [
      { id: 'h-1', level: 3, text: 'S18 a subsection' },
      { id: 'h-2', level: 2, text: null },
      { id: 'h-3', level: 2, text: 42 },
    ],
    packages: [],
  });

  assert.equal(report.required_chapter_count, 0);
  assert.equal(report.ok, true);
});

test('a payload without headings reports zero uncovered chapters', () => {
  const pipeline = runGatePipeline(
    pipelineInput({
      responsibilities: ['owns proof records (S19)'],
      chapterHeadings: null,
    })
  );

  assert.equal(gate(pipeline, 'G3').counts.uncovered_chapter_count, 0);
  assert.equal(pipeline.finalAudit.uncovered_chapter_count, 0);
});

test('the command document states the chapter-coverage rule and its finalAudit count', () => {
  const doc = readFileSync(fileURLToPath(new URL('../../../.claude/commands/workspacify-tree.md', import.meta.url)), 'utf8');
  assert.match(doc, /Numbered-chapter coverage is a G3 refusal/);
  assert.match(doc, /uncovered_chapter_count/);
  assert.match(doc, /spec_defects`? entry settles an observation/);
});

test('G3 refuses an unowned numbered chapter and reports finalAudit.uncovered_chapter_count', () => {
  const pipeline = runGatePipeline(pipelineInput({ responsibilities: ['owns proof records (S19)'] }));

  assert.equal(gate(pipeline, 'G3').status, GATE_STATUS.REVIEW_REQUIRED);
  assert.equal(gate(pipeline, 'G3').counts.uncovered_chapter_count, 2);
  assert.ok(gate(pipeline, 'G3').reasons.some((reason) => reason.includes('S18')));
  assert.ok(gate(pipeline, 'G3').reasons.some((reason) => reason.includes('S20')));
  assert.equal(pipeline.finalAudit.uncovered_chapter_count, 2);
  assert.notEqual(pipeline.status, GATE_STATUS.COMPLETE);
});

test('settling the pulse candidate in spec_defects does not substitute for an owner', () => {
  const specPulse = {
    candidates: [
      { id: 'pulse-000001', kind: 'isolated_chapter', chapter_ref: 'h-000002', observation: 'S18 is isolated.', evidence_refs: ['s-000020'] },
      { id: 'pulse-000002', kind: 'extraction_gap', chapter_ref: 'h-000004', observation: 'S20 has no item.', evidence_refs: ['s-000022'] },
    ],
  };
  const specDefects = specPulse.candidates.map((candidate) => ({
    candidate_id: candidate.id,
    ai_interpretation: 'The chapter is self-contained.',
    chosen_default: 'Its obligations are carried by pkg-0001 as package responsibilities.',
    rationale: 'The package responsibility is the traceable owner.',
  }));

  const pipeline = runGatePipeline(
    pipelineInput({ responsibilities: ['owns proof records (S19)'], specDefects, specPulse })
  );

  assert.equal(gate(pipeline, 'G3').status, GATE_STATUS.REVIEW_REQUIRED);
  assert.equal(gate(pipeline, 'G3').counts.spec_defect_count, 0);
  assert.equal(gate(pipeline, 'G3').counts.uncovered_chapter_count, 2);
  assert.notEqual(pipeline.status, GATE_STATUS.COMPLETE);
});

test('naming every chapter in a package responsibility lets the same input complete', () => {
  const pipeline = runGatePipeline(
    pipelineInput({
      responsibilities: ['owns proof records (S19)', 'hosts plugin acquisition (S18)', 'implements finite certification (S20)'],
    })
  );

  assert.equal(gate(pipeline, 'G3').status, GATE_STATUS.PASS);
  assert.equal(gate(pipeline, 'G3').counts.uncovered_chapter_count, 0);
  assert.equal(pipeline.finalAudit.uncovered_chapter_count, 0);
  assert.equal(pipeline.status, GATE_STATUS.COMPLETE);
});

test('the CLI gate reads the headings and refuses the unowned chapters', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wst-chapter-coverage-'));
  try {
    const specPath = join(dir, 'spec.md');
    writeFileSync(
      specPath,
      [
        '# Design',
        '',
        '## S18 Autonomous tools; WASM; Exact ABI',
        '',
        '| object | kind |',
        '|---|---|',
        '| PluginHost | record |',
        '',
        'Plugin acquisition is required.',
        '',
        '## S20 Finite certification; words; generalization; search arithmetic',
        '',
        'Finite certification is required.',
        '',
      ].join('\n')
    );

    const decisions = {
      workspace: [
        {
          id: 'pkg-0001',
          name: 'storage',
          path: 'crates/storage',
          layer: 'protocol',
          kind: 'production-library',
          responsibilities: ['owns proof records (S19)'],
          seed_required: true,
          owns: { objects: ['obj-000001'], claims: [], invariants: [], state_machines: [], error_codes: [], required_tests: [] },
        },
      ],
      tree: [{ name: 'crates', path: 'crates', kind: 'dir', children: [{ name: 'storage', path: 'crates/storage', kind: 'dir', children: [] }] }],
      ownership: [{ objectId: 'obj-000001', packageId: 'pkg-0001' }],
      dependencies: [],
      boundaries: [],
      adapters: { ports: [], databasePolicy: { applicable: false } },
      approvals: [],
      spec_defects: [],
      residual_questions: [],
      dependency_reviews: [],
      semantic_review: { status: 'APPROVED', statement: 'checked', approver: 'ai-session' },
    };
    stageTreeDecisions(dir, settlePulseCandidates({ specPath, decisions }));

    const refused = spawnSync(process.execPath, [RUN_SCRIPT, 'gate', `--spec=${specPath}`], { cwd: dir, encoding: 'utf8' });
    const refusedReport = JSON.parse(readFileSyncLine(refused.stdout));
    assert.notEqual(refused.status, 0, refused.stdout + refused.stderr);
    assert.equal(refusedReport.finalAudit.uncovered_chapter_count, 2);
    assert.ok(refused.stderr.includes('S18'), refused.stderr);
    assert.ok(refused.stderr.includes('S20'), refused.stderr);

    // finalize shares prepareForwardPipeline, so the publish path must refuse too.
    const refusedPublish = spawnSync(process.execPath, [RUN_SCRIPT, 'finalize', `--spec=${specPath}`], { cwd: dir, encoding: 'utf8' });
    assert.notEqual(refusedPublish.status, 0, refusedPublish.stdout + refusedPublish.stderr);
    assert.equal(existsSync(join(dir, 'WORKSPACIFY-TREE-MANIFEST.json')), false, 'a refused finalize must publish nothing');

    decisions.workspace[0].responsibilities = [
      'owns proof records (S19)',
      'hosts plugin acquisition and the Exact ABI contracts (S18)',
      'implements finite certification and search arithmetic (S20)',
    ];
    stageTreeDecisions(dir, settlePulseCandidates({ specPath, decisions }));

    const accepted = spawnSync(process.execPath, [RUN_SCRIPT, 'gate', `--spec=${specPath}`], { cwd: dir, encoding: 'utf8' });
    const acceptedReport = JSON.parse(readFileSyncLine(accepted.stdout));
    assert.equal(accepted.status, 0, accepted.stdout + accepted.stderr);
    assert.equal(acceptedReport.finalAudit.uncovered_chapter_count, 0);
    assert.equal(acceptedReport.status, GATE_STATUS.COMPLETE);

    const published = spawnSync(process.execPath, [RUN_SCRIPT, 'finalize', `--spec=${specPath}`], { cwd: dir, encoding: 'utf8' });
    assert.equal(published.status, 0, published.stdout + published.stderr);
    assert.equal(existsSync(join(dir, 'WORKSPACIFY-TREE-MANIFEST.json')), true, 'a complete finalize publishes the manifest');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function readFileSyncLine(stdout) {
  return stdout.split('\n').find((line) => line.startsWith('{')) ?? '{}';
}
