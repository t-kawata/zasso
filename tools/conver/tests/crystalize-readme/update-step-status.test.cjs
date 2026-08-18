/**
 * update-step-status.test.cjs — Tests for the crystalize update-step-status.js
 * @verifies C002
 *
 * Manages CRYSTALIZE-Status.json: step transitions 0..4 plus the Step 1
 * per-heading TOC grill. The grill records a durable toc.nodes tree
 * ({id, heading, level, confirmedContent, status}) where level and parent are
 * derived from the hierarchical-path id (never stored). All writes are atomic.
 */

const { describe, it, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SCRIPT = path.resolve(__dirname, '../../.claude/scripts/crystalize-readme/update-step-status.js');
const {
  parseArguments,
  readStatus,
  createDefaultStatus,
  validateStepNumber,
  executeStartStep,
  executeEndStep,
  executeFailStep,
  executeResetToStep,
  executeProposeHeading,
  executeConfirmHeading,
  executeDeleteHeading,
  executeResetToc,
  isTocComplete,
  executeApproveToc,
  executeResolveSection,
  executeMarkResidue,
  executeResetSections,
  atomicWrite,
  MIN_STEP,
  MAX_STEP,
  ALLOWED_SUBCOMMANDS,
  CRYSTALIZE_STATUS_FILENAME,
  STATUS_PENDING,
  STATUS_RUNNING,
  STATUS_DONE,
  STATUS_ERROR,
} = require(SCRIPT);

let tmpDir;
let graphPath;
let statusPath;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'px154-uss-'));
  graphPath = path.join(tmpDir, 'RFC-ROOT-GRAPH.json');
  fs.writeFileSync(graphPath, JSON.stringify({
    sourceFile: path.join(tmpDir, 'RFC-ROOT.md'),
    mainLanguage: 'rust',
    nodes: [],
    edges: [],
  }), 'utf8');
  statusPath = path.join(tmpDir, CRYSTALIZE_STATUS_FILENAME);
});

afterEach(() => fs.rmSync(statusPath, { force: true }));
after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('parseArguments', () => {
  it('parses --graph=<path> with a step subcommand', () => {
    const parsed = parseArguments([`--graph=${graphPath}`, 'start-step', '0']);
    assert.equal(parsed.graphPath, graphPath);
    assert.equal(parsed.subcommand, 'start-step');
    assert.equal(parsed.stepNumber, 0);
  });

  it('parses --status=<path> with a subcommand', () => {
    const parsed = parseArguments([`--status=${statusPath}`, 'status']);
    assert.equal(parsed.statusPath, statusPath);
    assert.equal(parsed.subcommand, 'status');
  });

  it('parses propose-heading without an extra argument (stdin JSON)', () => {
    const parsed = parseArguments([`--graph=${graphPath}`, 'propose-heading']);
    assert.equal(parsed.subcommand, 'propose-heading');
    assert.equal(parsed.stepNumber, null);
  });

  it('parses confirm-heading without an extra argument (stdin JSON)', () => {
    const parsed = parseArguments([`--graph=${graphPath}`, 'confirm-heading']);
    assert.equal(parsed.subcommand, 'confirm-heading');
    assert.equal(parsed.stepNumber, null);
  });

  it('parses reset-toc without extra arguments', () => {
    const parsed = parseArguments([`--graph=${graphPath}`, 'reset-toc']);
    assert.equal(parsed.subcommand, 'reset-toc');
  });

  it('parses reset-sections without extra arguments', () => {
    const parsed = parseArguments([`--graph=${graphPath}`, 'reset-sections']);
    assert.equal(parsed.subcommand, 'reset-sections');
    assert.equal(parsed.stepNumber, null);
  });

  it('rejects an unknown subcommand', () => {
    assert.throws(() => parseArguments([`--graph=${graphPath}`, 'bogus']));
  });

  it('rejects a step subcommand without a step number', () => {
    assert.throws(() => parseArguments([`--graph=${graphPath}`, 'start-step']));
  });

  it('rejects a missing first flag', () => {
    assert.throws(() => parseArguments(['start-step', '0']));
  });

  it('exports the allowed subcommand list including the grill subcommands', () => {
    assert.ok(ALLOWED_SUBCOMMANDS.includes('approve-toc'));
    assert.ok(ALLOWED_SUBCOMMANDS.includes('resolve-section'));
    assert.ok(ALLOWED_SUBCOMMANDS.includes('mark-residue'));
    assert.ok(!ALLOWED_SUBCOMMANDS.includes('approve-examples'));
    assert.ok(ALLOWED_SUBCOMMANDS.includes('status'));
    assert.ok(ALLOWED_SUBCOMMANDS.includes('propose-heading'));
    assert.ok(ALLOWED_SUBCOMMANDS.includes('confirm-heading'));
    assert.ok(ALLOWED_SUBCOMMANDS.includes('reset-toc'));
    assert.ok(ALLOWED_SUBCOMMANDS.includes('reset-sections'));
  });
});

describe('createDefaultStatus', () => {
  it('builds a default status with steps 0..3 pending and an empty toc tree', () => {
    const status = createDefaultStatus(graphPath);
    assert.equal(status.graphFile, graphPath);
    assert.equal(status.sourceFile, path.join(tmpDir, 'RFC-ROOT.md'));
    assert.equal(status.currentStep, MIN_STEP);
    assert.equal(status.steps['3'], STATUS_PENDING);
    assert.equal(status.grill.tocApproved, false);
    assert.equal(status.grill.examplesApproved, false);
    assert.deepEqual(status.grill.toc.nodes, []);
    assert.deepEqual(status.grill.sections, []);
  });
});

describe('readStatus', () => {
  it('returns the default when the status file does not exist', () => {
    const status = readStatus(statusPath, graphPath);
    assert.equal(status.currentStep, MIN_STEP);
    assert.deepEqual(status.grill.toc.nodes, []);
  });

  it('reads an existing status file and backfills a missing toc tree', () => {
    fs.writeFileSync(statusPath, JSON.stringify({
      sourceFile: path.join(tmpDir, 'RFC-ROOT.md'),
      graphFile: graphPath,
      currentStep: 2,
      steps: { 0: 'done', 1: 'done', 2: 'running', 3: 'pending', 4: 'pending' },
      grill: { tocApproved: true, examplesApproved: false },
    }), 'utf8');
    const status = readStatus(statusPath, graphPath);
    assert.equal(status.currentStep, 2);
    assert.equal(status.grill.tocApproved, true);
    assert.deepEqual(status.grill.toc.nodes, []);
  });

  it('migrates legacy proposedIds/confirmedIds into toc.nodes', () => {
    fs.writeFileSync(statusPath, JSON.stringify({
      sourceFile: path.join(tmpDir, 'RFC-ROOT.md'),
      graphFile: graphPath,
      currentStep: 1,
      steps: { 0: 'done', 1: 'running', 2: 'pending', 3: 'pending', 4: 'pending' },
      grill: { tocApproved: false, examplesApproved: false, proposedIds: ['H1', 'H1-1'], confirmedIds: ['H1'] },
    }), 'utf8');
    const status = readStatus(statusPath, graphPath);
    assert.equal(status.grill.toc.nodes.length, 2);
    assert.equal(status.grill.toc.nodes.find((n) => n.id === 'H1').status, 'confirmed');
    assert.equal(status.grill.toc.nodes.find((n) => n.id === 'H1-1').status, 'proposed');
  });
});

describe('validateStepNumber', () => {
  it('accepts 0..3 and rejects out-of-range values', () => {
    assert.equal(MIN_STEP, 0);
    assert.equal(MAX_STEP, 3);
    assert.ok(validateStepNumber(0));
    assert.ok(validateStepNumber(3));
    assert.ok(!validateStepNumber(4));
    assert.ok(!validateStepNumber(-1));
  });
});

describe('step transitions', () => {
  it('start-step sets a step to running', () => {
    const status = createDefaultStatus(graphPath);
    executeStartStep(status, 1);
    assert.equal(status.steps['1'], STATUS_RUNNING);
    assert.equal(status.currentStep, 1);
  });

  it('end-step marks a step done and advances currentStep when Step 1 is complete', () => {
    const status = createDefaultStatus(graphPath);
    executeProposeHeading(status, { id: 'H1', heading: 'クイックスタート' });
    executeConfirmHeading(status, { id: 'H1', confirmedContent: 'クイックスタート本文' });
    executeEndStep(status, 1);
    assert.equal(status.steps['1'], STATUS_DONE);
    assert.equal(status.currentStep, 2);
  });

  it('end-step 1 throws while the TOC grill is incomplete (C002-Inv)', () => {
    const status = createDefaultStatus(graphPath);
    executeProposeHeading(status, { id: 'H1', heading: 'クイックスタート' });
    assert.throws(() => executeEndStep(status, 1), /TOC grill is incomplete/);
    assert.equal(status.steps['1'], STATUS_PENDING);
  });

  it('fail-step marks a step error without moving currentStep', () => {
    const status = createDefaultStatus(graphPath);
    executeFailStep(status, 1);
    assert.equal(status.steps['1'], STATUS_ERROR);
    assert.equal(status.currentStep, MIN_STEP);
  });

  it('reset-to-step resets later steps to pending', () => {
    const status = createDefaultStatus(graphPath);
    executeEndStep(status, 2);
    executeResetToStep(status, 1);
    assert.equal(status.steps['2'], STATUS_PENDING);
    assert.equal(status.currentStep, 1);
  });

  it('approve-toc derives tocApproved from full confirmation', () => {
    const status = createDefaultStatus(graphPath);
    executeProposeHeading(status, { id: 'H1', heading: 'クイックスタート' });
    executeProposeHeading(status, { id: 'H1-1', heading: 'アカウントの追加' });
    executeApproveToc(status);
    assert.equal(status.grill.tocApproved, false);
    executeConfirmHeading(status, { id: 'H1', confirmedContent: '本文1' });
    executeConfirmHeading(status, { id: 'H1-1', confirmedContent: '本文2' });
    executeApproveToc(status);
    assert.equal(status.grill.tocApproved, true);
  });
});

describe('section state subcommands — PX-156', () => {
  it('resolve-section marks a section complete', () => {
    const status = createDefaultStatus(graphPath);
    executeResolveSection(status, { id: 'H1', heading: 'クイックスタート' });
    assert.equal(status.grill.sections.length, 1);
    assert.equal(status.grill.sections[0].id, 'H1');
    assert.equal(status.grill.sections[0].state, 'complete');
  });

  it('resolve-section upserts an existing section without duplicating it', () => {
    const status = createDefaultStatus(graphPath);
    executeResolveSection(status, { id: 'H1', heading: 'クイックスタート' });
    executeResolveSection(status, { id: 'H1', heading: 'クイックスタート' });
    assert.equal(status.grill.sections.length, 1);
  });

  it('mark-residue marks a section as residue', () => {
    const status = createDefaultStatus(graphPath);
    executeMarkResidue(status, { id: 'H1-1', heading: 'アカウントの追加' });
    const section = status.grill.sections.find((s) => s.id === 'H1-1');
    assert.equal(section.state, 'residue');
  });

  it('resolve-section / mark-residue require an id and heading', () => {
    const status = createDefaultStatus(graphPath);
    assert.throws(() => executeResolveSection(status, { heading: 'x' }), /id/);
    assert.throws(() => executeMarkResidue(status, { id: 'H1' }), /heading/);
  });

  it('resolve-section copies confirmedContent from the matching toc node into the section record', () => {
    const status = createDefaultStatus(graphPath);
    status.grill.toc.nodes.push({ id: 'H1', heading: 'クイックスタート', confirmedContent: '本文1', status: 'confirmed' });
    executeResolveSection(status, { id: 'H1', heading: 'クイックスタート' });
    assert.equal(status.grill.sections[0].state, 'complete');
    assert.equal(status.grill.sections[0].confirmedContent, '本文1');
  });

  it('mark-residue copies confirmedContent from the matching toc node into the section record', () => {
    const status = createDefaultStatus(graphPath);
    status.grill.toc.nodes.push({ id: 'H1-1', heading: 'アカウントの追加', confirmedContent: '本文2', status: 'confirmed' });
    executeMarkResidue(status, { id: 'H1-1', heading: 'アカウントの追加' });
    const section = status.grill.sections.find((s) => s.id === 'H1-1');
    assert.equal(section.state, 'residue');
    assert.equal(section.confirmedContent, '本文2');
  });

  it('resolve-section / mark-residue set confirmedContent to null when the node is missing', () => {
    const status = createDefaultStatus(graphPath);
    executeResolveSection(status, { id: 'H1', heading: 'クイックスタート' });
    executeMarkResidue(status, { id: 'H1-1', heading: 'アカウントの追加' });
    assert.equal(status.grill.sections.find((s) => s.id === 'H1').confirmedContent, null);
    assert.equal(status.grill.sections.find((s) => s.id === 'H1-1').confirmedContent, null);
  });

  it('resolve-section refreshes confirmedContent onto an existing section record (upsert)', () => {
    const status = createDefaultStatus(graphPath);
    status.grill.toc.nodes.push({ id: 'H1', heading: 'クイックスタート', confirmedContent: '最新リード', status: 'confirmed' });
    executeResolveSection(status, { id: 'H1', heading: 'クイックスタート' });
    executeResolveSection(status, { id: 'H1', heading: 'クイックスタート' });
    assert.equal(status.grill.sections.length, 1);
    assert.equal(status.grill.sections[0].confirmedContent, '最新リード');
  });
});

describe('reset-sections — full re-analysis restart (PX-156)', () => {
  it('clears grill.sections and examplesApproved so Step 2 re-analyzes every section', () => {
    const status = createDefaultStatus(graphPath);
    executeResolveSection(status, { id: 'H1', heading: 'クイックスタート' });
    executeMarkResidue(status, { id: 'H1-1', heading: 'アカウントの追加' });
    status.grill.examplesApproved = true;
    executeResetSections(status);
    assert.deepEqual(status.grill.sections, []);
    assert.equal(status.grill.examplesApproved, false);
  });

  it('is a no-op on an already-clear sections list', () => {
    const status = createDefaultStatus(graphPath);
    executeResetSections(status);
    assert.deepEqual(status.grill.sections, []);
    assert.equal(status.grill.examplesApproved, false);
  });
});

describe('per-heading grill — C002', () => {
  it('propose-heading records {id, heading, level, status:proposed} from a proposal JSON', () => {
    const status = createDefaultStatus(graphPath);
    executeProposeHeading(status, { id: 'H1', heading: 'クイックスタート' });
    executeProposeHeading(status, { id: 'H1-1', heading: 'アカウントの追加' });
    assert.equal(status.grill.toc.nodes.length, 2);
    assert.equal(status.grill.toc.nodes[0].id, 'H1');
    assert.equal(status.grill.toc.nodes[0].heading, 'クイックスタート');
    assert.equal(status.grill.toc.nodes[0].level, 1);
    assert.equal(status.grill.toc.nodes[0].status, 'proposed');
    assert.equal(status.grill.toc.nodes[1].level, 2); // H1-1 → level 2
  });

  it('propose-heading rejects a child whose parent node is not in the tree (C002-Inv)', () => {
    const status = createDefaultStatus(graphPath);
    executeProposeHeading(status, { id: 'H1', heading: 'クイックスタート' });
    assert.throws(() => executeProposeHeading(status, { id: 'H2-1', heading: '通話' }), /parent/);
    assert.equal(status.grill.toc.nodes.length, 1);
  });

  it('propose-heading upserts an existing id with a new heading', () => {
    const status = createDefaultStatus(graphPath);
    executeProposeHeading(status, { id: 'H1', heading: '旧タイトル' });
    executeProposeHeading(status, { id: 'H1', heading: '新タイトル' });
    assert.equal(status.grill.toc.nodes.length, 1);
    assert.equal(status.grill.toc.nodes[0].heading, '新タイトル');
  });

  it('confirm-heading sets confirmedContent and status=confirmed (C002-Post)', () => {
    const status = createDefaultStatus(graphPath);
    executeProposeHeading(status, { id: 'H1', heading: 'クイックスタート' });
    executeConfirmHeading(status, { id: 'H1', confirmedContent: 'クイックスタート本文' });
    assert.equal(status.grill.toc.nodes[0].confirmedContent, 'クイックスタート本文');
    assert.equal(status.grill.toc.nodes[0].status, 'confirmed');
  });

  it('confirm-heading rejects an unproposed id (C002-Inv)', () => {
    const status = createDefaultStatus(graphPath);
    assert.throws(() => executeConfirmHeading(status, { id: 'H1', confirmedContent: '本文' }), /not proposed/);
  });

  it('isTocComplete is false while any node is unconfirmed and true when all are confirmed', () => {
    const status = createDefaultStatus(graphPath);
    executeProposeHeading(status, { id: 'H1', heading: 'クイックスタート' });
    executeProposeHeading(status, { id: 'H1-1', heading: 'アカウントの追加' });
    assert.equal(isTocComplete(status), false);
    executeConfirmHeading(status, { id: 'H1', confirmedContent: '本文1' });
    assert.equal(isTocComplete(status), false);
    executeConfirmHeading(status, { id: 'H1-1', confirmedContent: '本文2' });
    assert.equal(isTocComplete(status), true);
  });

  it('isTocComplete is false for an empty tree', () => {
    const status = createDefaultStatus(graphPath);
    assert.equal(isTocComplete(status), false);
  });

  it('stores no parentId — level and parent are derived from the id (C002-Inv)', () => {
    const status = createDefaultStatus(graphPath);
    executeProposeHeading(status, { id: 'H1', heading: 'クイックスタート' });
    executeProposeHeading(status, { id: 'H1-2', heading: '通話' });
    executeProposeHeading(status, { id: 'H1-2-1', heading: '保留' });
    assert.ok(!('parentId' in status.grill.toc.nodes[0]));
    assert.equal(status.grill.toc.nodes[2].level, 3);
    assert.equal(status.grill.toc.nodes[2].id, 'H1-2-1');
  });

  it('reset-toc clears the per-heading grill state', () => {
    const status = createDefaultStatus(graphPath);
    executeProposeHeading(status, { id: 'H1', heading: 'クイックスタート' });
    executeConfirmHeading(status, { id: 'H1', confirmedContent: '本文' });
    status.grill.tocApproved = true;
    executeResetToc(status);
    assert.deepEqual(status.grill.toc.nodes, []);
    assert.equal(status.grill.tocApproved, false);
  });
});

describe('delete-heading — C002', () => {
  it('removes a node and all its descendants (C002-Post)', () => {
    const status = createDefaultStatus(graphPath);
    executeProposeHeading(status, { id: 'H1', heading: 'クイックスタート' });
    executeProposeHeading(status, { id: 'H1-1', heading: 'アカウントの追加' });
    executeProposeHeading(status, { id: 'H1-1-1', heading: '保留' });
    executeDeleteHeading(status, { id: 'H1-1' });
    assert.deepEqual(status.grill.toc.nodes.map((n) => n.id), ['H1']);
  });

  it('leaves the tree empty when deleting a top-level node', () => {
    const status = createDefaultStatus(graphPath);
    executeProposeHeading(status, { id: 'H1', heading: 'クイックスタート' });
    executeProposeHeading(status, { id: 'H1-1', heading: 'アカウントの追加' });
    executeDeleteHeading(status, { id: 'H1' });
    assert.deepEqual(status.grill.toc.nodes, []);
  });

  it('rejects an id that is not in the tree (C002-Inv)', () => {
    const status = createDefaultStatus(graphPath);
    executeProposeHeading(status, { id: 'H1', heading: 'クイックスタート' });
    assert.throws(() => executeDeleteHeading(status, { id: 'H9' }), /not found/);
    assert.equal(status.grill.toc.nodes.length, 1);
  });

  it('recomputes tocApproved via isTocComplete after deletion (C002-Inv)', () => {
    const status = createDefaultStatus(graphPath);
    executeProposeHeading(status, { id: 'H1', heading: 'クイックスタート' });
    executeProposeHeading(status, { id: 'H1-1', heading: 'アカウントの追加' });
    executeConfirmHeading(status, { id: 'H1', confirmedContent: '本文1' });
    executeConfirmHeading(status, { id: 'H1-1', confirmedContent: '本文2' });
    assert.equal(isTocComplete(status), true);
    executeDeleteHeading(status, { id: 'H1' });
    assert.equal(isTocComplete(status), false);
  });

  it('propose-heading upserts without duplicating an existing id (C002: UPSERT)', () => {
    const status = createDefaultStatus(graphPath);
    executeProposeHeading(status, { id: 'H1', heading: '旧タイトル' });
    executeProposeHeading(status, { id: 'H1', heading: '新タイトル' });
    assert.equal(status.grill.toc.nodes.filter((n) => n.id === 'H1').length, 1);
    assert.equal(status.grill.toc.nodes[0].heading, '新タイトル');
  });
});

describe('atomicWrite', () => {
  it('writes data atomically and leaves no temp file behind', () => {
    const target = path.join(tmpDir, 'out.json');
    atomicWrite(target, JSON.stringify({ ok: true }));
    assert.equal(JSON.parse(fs.readFileSync(target, 'utf8')).ok, true);
    const leftovers = fs.readdirSync(tmpDir).filter((f) => f.includes('.tmp.'));
    assert.deepEqual(leftovers, []);
  });
});
