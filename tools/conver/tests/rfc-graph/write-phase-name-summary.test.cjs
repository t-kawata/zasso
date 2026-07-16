/**
 * write-phase-name-summary.test.cjs — Tests for write-phase-name-summary.js
 *
 * Spawns a child process, passes name/summary via stdin, and verifies that
 * Tickets.json is updated correctly.
 *
 * Test framework: Node.js standard node:test + node:assert/strict
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const SCRIPT_PATH = path.resolve(__dirname, '../../.claude/scripts/rfc-graph/write-phase-name-summary.js');

describe('write-phase-name-summary', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpns-'));
  const ticketsPath = path.join(tmpDir, 'Tickets.json');

  before(function() {
    const sample = {
      title: 'test',
      metadata: { source: '', generatedAt: '2026-01-01' },
      phases: [
        { id: 0, name: 'P0', tickets: [], nodeIds: ['N0001'] },
        { id: 1, name: 'P1', tickets: [], nodeIds: ['N0002'] },
      ],
    };
    fs.writeFileSync(ticketsPath, JSON.stringify(sample, null, 2) + '\n');
  });

  after(function() {
    try {
      const files = fs.readdirSync(tmpDir);
      for (const f of files) {
        if (f !== '.' && f !== '..') fs.rmSync(path.join(tmpDir, f), { force: true });
      }
      fs.rmdirSync(tmpDir);
    } catch { /* cleanup errors non-fatal */ }
  });

  it('should write name and summary to existing phase', function() {
    const input = JSON.stringify({ name: 'Authentication', summary: 'Auth token generation, verification, and session management' });
    const result = spawnSync('node', [SCRIPT_PATH, ticketsPath, 'P0'], {
      input: input,
      encoding: 'utf8',
      timeout: 5000,
    });

    assert.strictEqual(result.status, 0, 'exit code 0. stderr: ' + result.stderr);

    const updated = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
    const p0 = updated.phases.find(function(p) { return p.id === 0; });
    assert.strictEqual(p0.name, 'Authentication');
    assert.strictEqual(p0.summary, 'Auth token generation, verification, and session management');
  });

  it('should reject empty name', function() {
    const input = JSON.stringify({ name: '', summary: 'test' });
    const result = spawnSync('node', [SCRIPT_PATH, ticketsPath, 'P0'], {
      input: input,
      encoding: 'utf8',
      timeout: 5000,
    });

    assert.notStrictEqual(result.status, 0, 'should fail with empty name');
  });

  it('should reject empty summary', function() {
    const input = JSON.stringify({ name: 'test', summary: '' });
    const result = spawnSync('node', [SCRIPT_PATH, ticketsPath, 'P1'], {
      input: input,
      encoding: 'utf8',
      timeout: 5000,
    });

    assert.notStrictEqual(result.status, 0, 'should fail with empty summary');
  });

  it('should reject invalid JSON input', function() {
    const result = spawnSync('node', [SCRIPT_PATH, ticketsPath, 'P0'], {
      input: 'not json',
      encoding: 'utf8',
      timeout: 5000,
    });

    assert.notStrictEqual(result.status, 0, 'should fail with invalid JSON');
  });

  it('should reject unknown phase', function() {
    const input = JSON.stringify({ name: 'test', summary: 'test' });
    const result = spawnSync('node', [SCRIPT_PATH, ticketsPath, 'P99'], {
      input: input,
      encoding: 'utf8',
      timeout: 5000,
    });

    assert.notStrictEqual(result.status, 0, 'should fail with unknown phase');
  });

  it('should reject missing arguments', function() {
    const result = spawnSync('node', [SCRIPT_PATH], {
      encoding: 'utf8',
      timeout: 5000,
    });

    assert.strictEqual(result.status, 2, 'should exit 2 with missing args');
  });
});
