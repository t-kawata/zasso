/**
 * step3-command.test.cjs — Static verification of the Step 3 boundify command (PX-161)
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const COMMAND_FILE = path.resolve(__dirname, '../../.claude/commands/drill-rfc-down.md');
const md = fs.readFileSync(COMMAND_FILE, 'utf8');

function step3Section() {
  const start = md.indexOf('### Step 3: boundify');
  const end = md.indexOf('### Step 4: split', start);
  assert.ok(start !== -1, 'Step 3 present');
  assert.ok(end !== -1, 'Step 4 present (bounds Step 3)');
  return md.slice(start, end);
}

describe('Step 3 command definition', () => {
  it('documents the dry-run -> AI judgment -> write -> validate-dirs-tree-schema loop', () => {
    const step3 = step3Section();
    assert.match(step3, /validate-dirs-tree-schema/, 'validate-dirs-tree-schema referenced');
    assert.match(step3, /dry-run|dry run/, 'dry-run mentioned');
    assert.match(step3, /dirs-tree-delta\.json/, 'dirs-tree-delta.json referenced');
  });

  it('documents src analysis and destructive-change prohibition', () => {
    const step3 = step3Section();
    assert.match(step3, /src|実ファイル/, 'src analysis referenced');
    assert.match(step3, /破壊|除去|削除/, 'destructive change concern mentioned');
  });
});
