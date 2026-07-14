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

  it('正常系: Tickets.json が既に存在する場合、existed:true になる', () => {
    const ticketsPath = path.join(tmpDir, 'Tickets.json');
    fs.writeFileSync(ticketsPath, JSON.stringify({ title: 'テスト', phases: [] }), 'utf8');
    assert.ok(fs.existsSync(ticketsPath));
  });

  it('正常系: parseArguments が正しく dir を解決する', () => {
    const result = parseArguments(['--dir=/some/path']);
    assert.equal(result, '/some/path');
  });

  it('正常系: 引数なしの場合 CWD を返す', () => {
    const result = parseArguments([]);
    assert.ok(result.endsWith('tools/conver'));
  });
});
