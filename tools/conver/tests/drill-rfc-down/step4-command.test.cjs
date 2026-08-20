/**
 * step4-command.test.cjs — Static verification of the Step 4 split command (PX-162)
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const COMMAND_FILE = path.resolve(__dirname, '../../.claude/commands/drill-rfc-down.md');
const md = fs.readFileSync(COMMAND_FILE, 'utf8');

function step4Section() {
  const start = md.indexOf('### Step 4: split');
  const end = md.indexOf('### Step 5: verify', start);
  assert.ok(start !== -1, 'Step 4 present');
  assert.ok(end !== -1, 'Step 5 present (bounds Step 4)');
  return md.slice(start, end);
}

describe('Step 4 command definition', () => {
  it('documents the dry-run -> AI judgment -> write -> validate-tickets loop', () => {
    const step4 = step4Section();
    assert.match(step4, /validate-tickets/, 'validate-tickets referenced');
    assert.match(step4, /dry-run|dry run/, 'dry-run mentioned');
    assert.match(step4, /tickets-delta\.json/, 'tickets-delta.json referenced');
  });

  it('documents existing-status preservation and destructive-change prohibition', () => {
    const step4 = step4Section();
    assert.match(step4, /status.*保全|保全/, 'status preservation mentioned');
    assert.match(step4, /破壊|削除/, 'destructive change concern mentioned');
  });
});
