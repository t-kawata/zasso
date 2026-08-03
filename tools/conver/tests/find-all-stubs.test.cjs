#!/usr/bin/env node
// find-all-stubs.test.cjs — Tests for .claude/scripts/tickets/review/find-all-stubs.js
//
// Verifies that scanFile reports real stub markers in comments but skips
// data references where the marker token appears inside a quoted string
// (e.g. test assertions checking for the absence of a marker).
const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');

let mod;
try { mod = require('../.claude/scripts/tickets/review/find-all-stubs.js'); } catch (e) { mod = null; }
const stats = { passed: 0, failed: 0, total: 0 };
function test(n, fn) { stats.total++; try { fn(); stats.passed++; console.log('  ✅', n); } catch (e) { stats.failed++; console.log('  ❌', n); console.error('     ' + e.message); } }

console.log('\n--- find-all-stubs tests ---\n');

if (!mod || !mod.scanFile) {
  test('module loads', () => { throw new Error('find-all-stubs.js not loaded'); });
} else {
  const { scanFile } = mod;

  function withTempFile(content, fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fas-'));
    const file = path.join(dir, 'sample.js');
    fs.writeFileSync(file, content, 'utf8');
    try {
      fn(file);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  test('実マーカー（コメント内）は報告される', () => {
    withTempFile('// [::STUB::] PX-1: reason\nconst a = 1;\n', (file) => {
      const results = [];
      scanFile(file, results);
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].line, 1);
      assert.ok(results[0].content.includes('[::STUB::]'));
    });
  });

  test('データ参照（クォート内の [::STUB::]）は報告されない', () => {
    withTempFile(
      "const has = source.includes('[::STUB::] PX-46');\nassert(!has, '[::STUB::] PX-46 removed');\n",
      (file) => {
        const results = [];
        scanFile(file, results);
        assert.strictEqual(results.length, 0);
      },
    );
  });

  test('クォートが先行しても実マーカー（コメント内）は報告される', () => {
    withTempFile('const m = "x"; // [::STUB::] PX-2: reason\n', (file) => {
      const results = [];
      scanFile(file, results);
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].line, 1);
    });
  });
}

console.log(`\n${stats.passed}/${stats.total} passed`);
if (stats.failed > 0) process.exit(1);
