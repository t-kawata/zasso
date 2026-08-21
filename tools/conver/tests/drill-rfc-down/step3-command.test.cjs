/**
 * step3-command.test.cjs — Static verification of the Step 3 boundify command (PX-161, PX-164)
 *
 * PX-164 reframes Step 3 to the AI-as-engineer staging flow: scripts provide
 * candidate information and safe editing tools (dirs-tree-crud.js), the AI
 * designs the evolution on a STAGING Dirs-Tree, and --approve validates +
 * promotes without re-running the analyzer.
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
  it('documents the stage -> AI design (dirs-tree-crud.js on staging) -> approve (validate promote) loop', () => {
    const step3 = step3Section();
    assert.match(step3, /--stage/, '--stage flag documented');
    assert.match(step3, /--approve/, '--approve flag documented');
    assert.match(step3, /--reject/, '--reject flag documented');
    assert.match(step3, /\.staging\.json/, 'staging copy path documented');
    assert.match(step3, /dirs-tree-crud\.js/, 'dirs-tree-crud.js (only write path) referenced');
    assert.match(step3, /validate-dirs-tree-schema/, 'validate-dirs-tree-schema referenced');
  });

  it('casts the analyzer output as candidate information and forbids analyzer re-run on approve', () => {
    const step3 = step3Section();
    assert.match(step3, /candidates\.json/, 'candidates file referenced');
    assert.match(step3, /情報|候補/, 'candidates framed as information for AI judgment');
    assert.match(step3, /再実行せず/, '--approve does not re-run the analyzer');
    assert.match(step3, /手書き/, 'AI hand-editing of JSON is forbidden');
  });

  it('documents src analysis and destructive-change prohibition', () => {
    const step3 = step3Section();
    assert.match(step3, /src|実ファイル/, 'src analysis referenced');
    assert.match(step3, /破壊|除去|削除/, 'destructive change concern mentioned');
  });
});
