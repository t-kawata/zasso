/**
 * update-step-status.test.cjs — Tests for the crystalize update-step-status.js
 *
 * Manages CRYSTALIZE-Status.json: step transitions 0..4 plus grill approvals
 * (approve-toc / approve-examples). All writes are atomic (temp-file + rename).
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
  executeApproveToc,
  executeApproveExamples,
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
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'px152-uss-'));
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
  it('parses --graph=<path> with a subcommand', () => {
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

  it('parses approve-toc without a step number', () => {
    const parsed = parseArguments([`--graph=${graphPath}`, 'approve-toc']);
    assert.equal(parsed.subcommand, 'approve-toc');
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

  it('exports the allowed subcommand list including approve-toc/approve-examples', () => {
    assert.ok(ALLOWED_SUBCOMMANDS.includes('approve-toc'));
    assert.ok(ALLOWED_SUBCOMMANDS.includes('approve-examples'));
    assert.ok(ALLOWED_SUBCOMMANDS.includes('status'));
  });
});

describe('createDefaultStatus', () => {
  it('builds a default status from the graph with steps 0..4 pending', () => {
    const status = createDefaultStatus(graphPath);
    assert.equal(status.graphFile, graphPath);
    assert.equal(status.sourceFile, path.join(tmpDir, 'RFC-ROOT.md'));
    assert.equal(status.currentStep, MIN_STEP);
    assert.equal(status.steps['4'], STATUS_PENDING);
    assert.equal(status.grill.tocApproved, false);
    assert.equal(status.grill.examplesApproved, false);
  });
});

describe('readStatus', () => {
  it('returns the default when the status file does not exist', () => {
    const status = readStatus(statusPath, graphPath);
    assert.equal(status.currentStep, MIN_STEP);
  });

  it('reads an existing status file', () => {
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
  });
});

describe('validateStepNumber', () => {
  it('accepts 0..4 and rejects out-of-range values', () => {
    assert.equal(MIN_STEP, 0);
    assert.equal(MAX_STEP, 4);
    assert.ok(validateStepNumber(0));
    assert.ok(validateStepNumber(4));
    assert.ok(!validateStepNumber(5));
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

  it('end-step marks a step done and advances currentStep', () => {
    const status = createDefaultStatus(graphPath);
    executeEndStep(status, 1);
    assert.equal(status.steps['1'], STATUS_DONE);
    assert.equal(status.currentStep, 2);
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

  it('approve-toc and approve-examples set the grill flags', () => {
    const status = createDefaultStatus(graphPath);
    executeApproveToc(status);
    executeApproveExamples(status);
    assert.equal(status.grill.tocApproved, true);
    assert.equal(status.grill.examplesApproved, true);
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
