/**
 * step2-command.test.cjs — Static verification of the Step 2 graphify command (PX-160)
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const COMMAND_FILE = path.resolve(__dirname, '../../.claude/commands/drill-rfc-down.md');
const md = fs.readFileSync(COMMAND_FILE, 'utf8');

function step2Section() {
  const start = md.indexOf('### Step 2: graphify');
  const end = md.indexOf('### Step 3: boundify', start);
  assert.ok(start !== -1, 'Step 2 present');
  assert.ok(end !== -1, 'Step 3 present (bounds Step 2)');
  return md.slice(start, end);
}

describe('Step 2 command definition', () => {
  it('documents the dry-run -> AI judgment -> crud.js -> verify.js loop', () => {
    const step2 = step2Section();
    assert.match(step2, /crud\.js/, 'crud.js (only write path) referenced');
    assert.match(step2, /verify\.js/, 'verify.js referenced');
    assert.match(step2, /dry-run|dry run/, 'dry-run mentioned');
  });

  it('documents graph-delta.json and destructive-change prohibition', () => {
    const step2 = step2Section();
    assert.match(step2, /graph-delta\.json/, 'graph-delta.json referenced');
    assert.match(step2, /破壊|削除/, 'destructive change concern mentioned');
  });
});
