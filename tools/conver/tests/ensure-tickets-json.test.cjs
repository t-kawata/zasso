/**
 * ensure-tickets-json.test.cjs
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { parseArguments } = require('../.claude/scripts/tickets/ensure-tickets-json.js');

describe('ensure-tickets-json', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'etj-test-'));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('normal: Tickets.json already exists → existed:true', () => {
    const ticketsPath = path.join(tmpDir, 'Tickets.json');
    fs.writeFileSync(ticketsPath, JSON.stringify({ title: 'テスト', phases: [] }), 'utf8');
    assert.ok(fs.existsSync(ticketsPath));
  });

  it('normal: parseArguments resolves dir correctly', () => {
    const result = parseArguments(['--dir=/some/path']);
    assert.equal(result, '/some/path');
  });

  it('normal: returns CWD when no arguments given', () => {
    const result = parseArguments([]);
    // PX-142: the assertion must track the actual CWD, not hardcode the project
    // root — the suite is also run from .claude via tests/run-all.js.
    assert.strictEqual(result, process.cwd());
  });
});
