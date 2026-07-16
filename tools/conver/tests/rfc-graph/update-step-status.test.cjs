/**
 * update-step-status.test.cjs — Tests for update-step-status.js
 *
 * Test framework: Node.js standard node:test + node:assert/strict
 * Covers all functions of the target module.
 * Includes actual file I/O tests using temporary directories.
 */

const { describe, it, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Load target module via require path
const {
  parseArguments,
  readStatus,
  createDefaultStatus,
  validateStepNumber,
  executeStartStep,
  executeEndStep,
  executeFailStep,
  executeResetToStep,
  executeStatus,
  executeCleanup,
  atomicWrite,
  MIN_STEP,
  MAX_STEP,
  ALLOWED_SUBCOMMANDS,
  STATUS_PENDING,
  STATUS_RUNNING,
  STATUS_DONE,
  STATUS_ERROR,
} = require('../../.claude/scripts/rfc-graph/update-step-status.js');

// ============================================================
// Test Utilities
// ============================================================

/** Temporary directory path for tests */
let tmpDir;

/** Status file path for tests */
let testStatusPath;

/**
 * Create valid test status data
 *
 * @param {number} currentStep — The currentStep value to set
 * @param {Object<string, string>} [overrides] — Step status overrides
 * @returns {Object} Status data
 */
function createTestStatus(currentStep = 1, overrides = {}) {
  const steps = {};
  for (let i = MIN_STEP; i <= MAX_STEP; i++) {
    steps[String(i)] = STATUS_PENDING;
  }
  Object.assign(steps, overrides);
  return {
    sourceFile: '/test/source.md',
    graphFile: '/test/source-GRAPH.json',
    currentStep,
    steps,
  };
}

/**
 * Write a test status file
 *
 * @param {Object} data — Status data to write
 * @returns {string} Path to the created file
 */
function writeTestStatusFile(data) {
  const filePath = path.join(tmpDir, 'test-GRAPHIFY-Status.json');
  fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
  return filePath;
}

// ============================================================
// Constants Tests
// ============================================================

describe('Constants', () => {
  it('MIN_STEP should be 0', () => {
    assert.strictEqual(MIN_STEP, 0);
  });

  it('MAX_STEP should be 5', () => {
    assert.strictEqual(MAX_STEP, 5);
  });

  it('ALLOWED_SUBCOMMANDS should contain 7 subcommand names', () => {
    assert.deepStrictEqual(ALLOWED_SUBCOMMANDS, [
      'start-step',
      'end-step',
      'fail-step',
      'reset-to-step',
      'status',
      'cleanup',
      'backup',
    ]);
  });

  it('Step status constants should be correct', () => {
    assert.strictEqual(STATUS_PENDING, 'pending');
    assert.strictEqual(STATUS_RUNNING, 'running');
    assert.strictEqual(STATUS_DONE, 'done');
    assert.strictEqual(STATUS_ERROR, 'error');
  });
});

// ============================================================
// validateStepNumber Tests
// ============================================================

describe('validateStepNumber()', () => {
  it('1 should be a valid step number', () => {
    assert.strictEqual(validateStepNumber(1), true);
  });

  it('3 should be a valid step number', () => {
    assert.strictEqual(validateStepNumber(3), true);
  });

  it('5 should be a valid step number', () => {
    assert.strictEqual(validateStepNumber(5), true);
  });

  it('0 should be a valid step number (Step 0: heading deduplication)', () => {
    assert.strictEqual(validateStepNumber(0), true);
  });

  it('5 should be a valid step number (upper bound)', () => {
    assert.strictEqual(validateStepNumber(5), true);
  });

  it('6 should be an invalid step number (out of range)', () => {
    assert.strictEqual(validateStepNumber(6), false);
  });

  it('Negative should be an invalid step number', () => {
    assert.strictEqual(validateStepNumber(-1), false);
  });

  it('Decimal should be an invalid step number', () => {
    assert.strictEqual(validateStepNumber(2.5), false);
  });

  it('NaN should be an invalid step number', () => {
    assert.strictEqual(validateStepNumber(NaN), false);
  });
});

// ============================================================
// Subcommand Execution Tests (pure functions)
// ============================================================

describe('executeStartStep()', () => {
  it('start-step 1 should set steps[1]=running, currentStep=1', () => {
    const status = createTestStatus(1);
    executeStartStep(status, 1);
    assert.strictEqual(status.steps['1'], STATUS_RUNNING);
    assert.strictEqual(status.currentStep, 1);
  });

  it('start-step 5 should set steps[5]=running, currentStep=5 (last step)', () => {
    const status = createTestStatus(4);
    executeStartStep(status, 5);
    assert.strictEqual(status.steps['5'], STATUS_RUNNING);
    assert.strictEqual(status.currentStep, 5);
  });

  it('start-step on an already done step should still overwrite (re-execution support)', () => {
    const status = createTestStatus(2, { '2': STATUS_DONE });
    executeStartStep(status, 2);
    assert.strictEqual(status.steps['2'], STATUS_RUNNING);
  });
});

describe('executeEndStep()', () => {
  it('end-step 1 should set steps[1]=done, currentStep=2', () => {
    const status = createTestStatus(1);
    executeEndStep(status, 1);
    assert.strictEqual(status.steps['1'], STATUS_DONE);
    assert.strictEqual(status.currentStep, 2);
  });

  it('end-step 5 should set steps[5]=done, currentStep=6 (all complete)', () => {
    const status = createTestStatus(5);
    executeEndStep(status, 5);
    assert.strictEqual(status.steps['5'], STATUS_DONE);
    assert.strictEqual(status.currentStep, 6);
  });

  it('repeated end-step should be idempotent', () => {
    const status = createTestStatus(1);
    executeEndStep(status, 1);
    executeEndStep(status, 1);
    assert.strictEqual(status.steps['1'], STATUS_DONE);
  });
});

describe('executeFailStep()', () => {
  it('fail-step 2 should set steps[2]=error, currentStep unchanged', () => {
    const status = createTestStatus(3);
    executeFailStep(status, 2);
    assert.strictEqual(status.steps['2'], STATUS_ERROR);
    assert.strictEqual(status.currentStep, 3);
  });

  it('repeated fail-step should be idempotent', () => {
    const status = createTestStatus(1);
    executeFailStep(status, 1);
    executeFailStep(status, 1);
    assert.strictEqual(status.steps['1'], STATUS_ERROR);
  });
});

describe('executeResetToStep()', () => {
  it('reset-to-step 2 should reset steps[3]~steps[5]=pending, currentStep=2, steps[1]~steps[2] unchanged', () => {
    const status = createTestStatus(4, {
      '1': STATUS_DONE,
      '2': STATUS_DONE,
      '3': STATUS_DONE,
      '4': STATUS_RUNNING,
    });
    executeResetToStep(status, 2);
    assert.strictEqual(status.steps['1'], STATUS_DONE);   // unchanged
    assert.strictEqual(status.steps['2'], STATUS_DONE);   // unchanged
    assert.strictEqual(status.steps['3'], STATUS_PENDING); // reset
    assert.strictEqual(status.steps['4'], STATUS_PENDING); // reset
    assert.strictEqual(status.steps['5'], STATUS_PENDING); // reset
    assert.strictEqual(status.currentStep, 2);
  });

  it('reset-to-step 5 should reset nothing (no steps beyond 5)', () => {
    const status = createTestStatus(5, {
      '1': STATUS_DONE,
      '2': STATUS_DONE,
      '3': STATUS_DONE,
      '4': STATUS_DONE,
      '5': STATUS_RUNNING,
    });
    executeResetToStep(status, 5);
    assert.strictEqual(status.steps['1'], STATUS_DONE);
    assert.strictEqual(status.steps['5'], STATUS_RUNNING);
    assert.strictEqual(status.currentStep, 5);
  });
});

describe('executeStatus()', () => {
  it('status subcommand should output formatted JSON', () => {
    const status = createTestStatus(2, { '1': STATUS_DONE });
    const originalLog = console.log;
    const capturedOutput = [];
    console.log = (msg) => { capturedOutput.push(msg); };
    try {
      executeStatus(status);
      const output = capturedOutput.join('');
      const parsed = JSON.parse(output);
      assert.strictEqual(parsed.currentStep, 2);
      assert.strictEqual(parsed.steps['1'], STATUS_DONE);
      assert.strictEqual(parsed.steps['2'], STATUS_PENDING);
    } finally {
      console.log = originalLog;
    }
  });
});

// ============================================================
// parseArguments Tests (process.argv mock)
// ============================================================

describe('parseArguments()', () => {
  const originalArgv = process.argv;

  after(() => {
    process.argv = originalArgv;
  });

  it('should parse start-step with valid arguments', () => {
    process.argv = ['node', 'script.js', '--graphify-status=/tmp/status.json', 'start-step', '1'];
    const result = parseArguments();
    assert.strictEqual(result.statusPath, '/tmp/status.json');
    assert.strictEqual(result.subcommand, 'start-step');
    assert.strictEqual(result.stepNumber, 1);
  });

  it('should parse status without step number', () => {
    process.argv = ['node', 'script.js', '--graphify-status=/tmp/status.json', 'status'];
    const result = parseArguments();
    assert.strictEqual(result.statusPath, '/tmp/status.json');
    assert.strictEqual(result.subcommand, 'status');
    assert.strictEqual(result.stepNumber, null);
  });

  it('should throw error when missing subcommand', () => {
    process.argv = ['node', 'script.js', '--graphify-status=/tmp/status.json'];
    assert.throws(() => parseArguments(), /Insufficient arguments/);
  });

  it('should throw error when start-step has no step number', () => {
    process.argv = ['node', 'script.js', '--graphify-status=/tmp/status.json', 'start-step'];
    assert.throws(() => parseArguments(), /requires a step number/);
  });

  it('should throw error for unknown subcommand', () => {
    process.argv = ['node', 'script.js', '--graphify-status=/tmp/status.json', 'unknown-cmd', '1'];
    assert.throws(() => parseArguments(), /Unknown subcommand/);
  });

  it('should throw error when --graphify-status= has empty path', () => {
    process.argv = ['node', 'script.js', '--graphify-status=', 'start-step', '1'];
    assert.throws(() => parseArguments(), /Path is empty/);
  });

  it('should throw error when --graphify-status flag is missing', () => {
    process.argv = ['node', 'script.js', '/tmp/status.json', 'start-step', '1'];
    assert.throws(() => parseArguments(), /--graphify-status/);
  });

  it('should throw error when step number is not a number', () => {
    process.argv = ['node', 'script.js', '--graphify-status=/tmp/s.json', 'start-step', 'abc'];
    assert.throws(() => parseArguments(), /is not a number/);
  });

  // ============================================================
  // --status= Alias Flag Tests
  // ============================================================

  it('should parse start-step with --status= alias', () => {
    process.argv = ['node', 'script.js', '--status=/tmp/boundify.json', 'start-step', '1'];
    const result = parseArguments();
    assert.strictEqual(result.statusPath, '/tmp/boundify.json');
    assert.strictEqual(result.subcommand, 'start-step');
    assert.strictEqual(result.stepNumber, 1);
  });

  it('should parse status with --status= alias (no step number)', () => {
    process.argv = ['node', 'script.js', '--status=/tmp/boundify.json', 'status'];
    const result = parseArguments();
    assert.strictEqual(result.statusPath, '/tmp/boundify.json');
    assert.strictEqual(result.subcommand, 'status');
    assert.strictEqual(result.stepNumber, null);
  });

  it('both FLAG_GRAPHIFY_STATUS and FLAG_ALIAS_STATUS should be defined', () => {
    // Verify FLAG_ALIAS_STATUS exists (referenced from module.exports for testing)
    const mod = require('../../.claude/scripts/rfc-graph/update-step-status.js');
    assert.ok(mod.FLAG_GRAPHIFY_STATUS);
    assert.ok(mod.FLAG_ALIAS_STATUS);
    assert.strictEqual(mod.FLAG_GRAPHIFY_STATUS, '--graphify-status=');
    assert.strictEqual(mod.FLAG_ALIAS_STATUS, '--status=');
  });

  it('should throw error when --status= path is empty', () => {
    process.argv = ['node', 'script.js', '--status=', 'start-step', '1'];
    assert.throws(() => parseArguments(), /Path is empty/);
  });

  it('should throw error for --stat=path typo', () => {
    process.argv = ['node', 'script.js', '--stat=/tmp/s.json', 'start-step', '1'];
    assert.throws(() => parseArguments(), /--graphify-status/);
  });
});

// ============================================================
// File I/O Tests (using temporary directory)
// ============================================================

describe('File I/O', () => {
  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'update-step-status-test-'));
    testStatusPath = path.join(tmpDir, 'test-GRAPHIFY-Status.json');
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('createDefaultStatus()', () => {
    it('should create default status from non-existent path', () => {
      const nonExistentPath = path.join(tmpDir, 'non-existent-GRAPHIFY-Status.json');
      const status = createDefaultStatus(nonExistentPath);
      assert.ok(status.sourceFile.endsWith('non-existent.md'));
      assert.ok(status.graphFile.endsWith('non-existent-GRAPH.json'));
      assert.strictEqual(status.currentStep, MIN_STEP);
      assert.strictEqual(status.steps['0'], STATUS_PENDING);
      assert.strictEqual(status.steps['5'], STATUS_PENDING);
      assert.strictEqual(Object.keys(status.steps).length, MAX_STEP - MIN_STEP + 1);
    });
  });

  describe('readStatus()', () => {
    it('should read an existing file correctly', () => {
      const testData = createTestStatus(2, { '1': STATUS_DONE });
      const filePath = writeTestStatusFile(testData);
      const loaded = readStatus(filePath);
      assert.strictEqual(loaded.currentStep, 2);
      assert.strictEqual(loaded.steps['1'], STATUS_DONE);
    });

    it('should return default status for non-existent file', () => {
      const nonExistentPath = path.join(tmpDir, 'no-such-file-GRAPHIFY-Status.json');
      const status = readStatus(nonExistentPath);
      assert.strictEqual(status.currentStep, MIN_STEP);
      assert.strictEqual(status.steps['0'], STATUS_PENDING);
    });

    it('should throw error for malformed JSON file', () => {
      const badPath = path.join(tmpDir, 'bad-json-GRAPHIFY-Status.json');
      fs.writeFileSync(badPath, '{ invalid json }', 'utf8');
      assert.throws(() => readStatus(badPath), /SyntaxError/);
    });

    it('should throw error for file missing required fields', () => {
      const badPath = path.join(tmpDir, 'incomplete-Status.json');
      fs.writeFileSync(badPath, JSON.stringify({ foo: 'bar' }), 'utf8');
      assert.throws(() => readStatus(badPath), /invalid format/);
    });
  });

  describe('atomicWrite()', () => {
    // NOTE: tmpDir is set in before(), so it resolves at test execution time, not describe evaluation time
    function getTestFilePath() {
      return path.join(tmpDir, 'atomic-test.json');
    }

    afterEach(() => {
      // Cleanup
      try { fs.unlinkSync(getTestFilePath()); } catch { /* Ignore */ }
    });

    it('should write a file successfully', () => {
      atomicWrite(getTestFilePath(), JSON.stringify({ key: 'value' }));
      const content = fs.readFileSync(getTestFilePath(), 'utf8');
      assert.strictEqual(JSON.parse(content).key, 'value');
    });

    it('should not leave temporary files after write', () => {
      atomicWrite(getTestFilePath(), JSON.stringify({ test: 'data' }));
      const tmpFiles = fs.readdirSync(tmpDir).filter(f => f.includes('.tmp.'));
      assert.strictEqual(tmpFiles.length, 0);
    });

    it('should handle large JSON data correctly', () => {
      const largeObj = {
        sourceFile: '/test/big.md',
        graphFile: '/test/big-GRAPH.json',
        currentStep: 3,
        steps: {
          '1': 'done', '2': 'done', '3': 'running',
          '4': 'pending', '5': 'pending',
        },
        nodes: Array.from({ length: 100 }, (_, i) => ({ id: `N${String(i + 1).padStart(4, '0')}` })),
      };
      const json = JSON.stringify(largeObj);
      assert.ok(json.length > 1000); // Verify size exceeds 1000 bytes equivalent
      atomicWrite(getTestFilePath(), json);
      const loaded = JSON.parse(fs.readFileSync(getTestFilePath(), 'utf8'));
      assert.strictEqual(loaded.currentStep, 3);
      assert.strictEqual(loaded.nodes.length, 100);
    });
  });
});

// ============================================================
// Integration Tests (subcommand execution via file)
// ============================================================

describe('read-modify-write integration', () => {
  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'update-step-status-integration-'));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should read file, apply start-step, and write back', () => {
    const statusPath = path.join(tmpDir, 'flow-test-GRAPHIFY-Status.json');
    const initialData = createTestStatus(1);
    fs.writeFileSync(statusPath, JSON.stringify(initialData), 'utf8');

    // read → modify → write
    const status = readStatus(statusPath);
    executeStartStep(status, 1);
    atomicWrite(statusPath, JSON.stringify(status, null, 2));

    const loaded = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    assert.strictEqual(loaded.steps['1'], STATUS_RUNNING);
    assert.strictEqual(loaded.currentStep, 1);
  });

  it('should start from non-existent file with full flow (start→end→reset)', () => {
    const statusPath = path.join(tmpDir, 'full-flow-GRAPHIFY-Status.json');

    // Step 1: no file exists, load default (starting from MIN_STEP)
    let status = readStatus(statusPath);
    assert.strictEqual(status.currentStep, MIN_STEP);
    assert.strictEqual(status.steps['0'], STATUS_PENDING);

    // Step 2: advance to start-step 1
    executeStartStep(status, 1);
    atomicWrite(statusPath, JSON.stringify(status, null, 2));
    status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    assert.strictEqual(status.currentStep, 1);
    assert.strictEqual(status.steps['1'], STATUS_RUNNING);

    // Step 3: end-step 1
    executeEndStep(status, 1);
    atomicWrite(statusPath, JSON.stringify(status, null, 2));
    status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    assert.strictEqual(status.currentStep, 2);
    assert.strictEqual(status.steps['1'], STATUS_DONE);

    // Step 4: fail-step 2
    executeFailStep(status, 2);
    atomicWrite(statusPath, JSON.stringify(status, null, 2));
    status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    assert.strictEqual(status.steps['2'], STATUS_ERROR);
    assert.strictEqual(status.currentStep, 2); // fail does not change currentStep

    // Step 5: reset-to-step 1
    executeResetToStep(status, 1);
    atomicWrite(statusPath, JSON.stringify(status, null, 2));
    status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    assert.strictEqual(status.currentStep, 1);
    assert.strictEqual(status.steps['1'], STATUS_DONE);   // unchanged
    assert.strictEqual(status.steps['2'], STATUS_PENDING); // reset
    assert.strictEqual(status.steps['3'], STATUS_PENDING);
  });

  // ============================================================
  // cleanup Subcommand Tests
  // ============================================================

  describe('cleanup', () => {
    it('should delete _fix_graph_hints.json after cleanup', () => {
      // Arrange: cleanup looks for temp files from CWD
      const status = createTestStatus(2);
      const testGraphFile = path.join(tmpDir, 'test-GRAPH.json');
      status.graphFile = testGraphFile;
      fs.writeFileSync(testGraphFile, JSON.stringify({ nodes: [], edges: [] }), 'utf8');
      const hintsFile = path.join(process.cwd(), '_fix_graph_hints.json');
      try {
        fs.writeFileSync(hintsFile, JSON.stringify({ diagnosis: 'test' }), 'utf8');

        // Act: execute cleanup
        executeCleanup(status);

        // Assert: _fix_graph_hints.json is deleted
        assert.strictEqual(fs.existsSync(hintsFile), false);
      } finally {
        // Cleanup (ensure deletion even on test failure)
        try { fs.unlinkSync(hintsFile); } catch { /* Ignore */ }
      }
    });

    it('should not delete required files (graph JSON) after cleanup', () => {
      // Arrange
      const status = createTestStatus(2);
      const testGraphFile = path.join(tmpDir, 'test-GRAPH.json');
      status.graphFile = testGraphFile;
      fs.writeFileSync(testGraphFile, JSON.stringify({ nodes: [], edges: [] }), 'utf8');
      const hintsFile = path.join(process.cwd(), '_fix_graph_hints.json');
      try {
        fs.writeFileSync(hintsFile, JSON.stringify({ diagnosis: 'test' }), 'utf8');

        // Act
        executeCleanup(status);

        // Assert: graph JSON remains
        assert.strictEqual(fs.existsSync(testGraphFile), true);
      } finally {
        try { fs.unlinkSync(hintsFile); } catch { /* Ignore */ }
      }
    });

    it('should not error when _fix_graph_hints.json does not exist (idempotent)', () => {
      // Arrange: do not create _fix_graph_hints.json
      const status = createTestStatus(2);
      const testGraphFile = path.join(tmpDir, 'test-GRAPH.json');
      status.graphFile = testGraphFile;
      fs.writeFileSync(testGraphFile, JSON.stringify({ nodes: [], edges: [] }), 'utf8');

      // Act & Assert: no error should occur
      assert.doesNotThrow(() => executeCleanup(status));
    });
  });
});

console.log('update-step-status.js all tests complete');
