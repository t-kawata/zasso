// PX-368 @verifies C006
// The pre-Step-5 state is design-complete, not complete. A session-status that says
// "Complete" at 1-12 is the overclaim the DRILL-REPORT exists to remove.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SESSION_STATUS = path.resolve(__dirname, '../../.claude/scripts/drill-rfc-down/session-status.js');

let tmpRoot;

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'px368-session-status-'));
});

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

// [::TICKET::] PX-368 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-368 --for-spec --no-implementation-order`.
function makeSession(name, state) {
  const directory = path.join(tmpRoot, name);
  fs.mkdirSync(directory, { recursive: true });
  const iso = '2026-01-01T00:00:00.000Z';
  fs.writeFileSync(path.join(directory, 'Status.json'), JSON.stringify({
    state, researchPath: '/tmp/rfc.md', rfcPath: '/tmp/rfc.md', rfcDir: '/tmp', reviewLoopCount: 0,
    createdAt: iso, updatedAt: iso,
  }));
  fs.writeFileSync(path.join(directory, 'DesignTree.json'), JSON.stringify({ version: 1, nodes: [] }));
  return directory;
}

describe('session-status completion labels', () => {
  it('C006 error: legacy DONE prints DESIGN_DONE and never Complete', () => {
    const result = spawnSync(process.execPath, [SESSION_STATUS, makeSession('legacy', 'DONE')], { encoding: 'utf8' });
    assert.match(result.stdout, /DESIGN_DONE/);
    assert.doesNotMatch(result.stdout, /Step: .*Complete/);
  });

  it('DESIGN_DONE points at the Step 5 report', () => {
    const result = spawnSync(process.execPath, [SESSION_STATUS, makeSession('design', 'DESIGN_DONE')], { encoding: 'utf8' });
    assert.match(result.stdout, /DESIGN_DONE/);
    assert.match(result.stdout, /DRILL-REPORT/);
  });

  it('COMPLETE is the only state labelled Complete', () => {
    const result = spawnSync(process.execPath, [SESSION_STATUS, makeSession('complete', 'COMPLETE')], { encoding: 'utf8' });
    assert.match(result.stdout, /Step: .*Complete/);
  });
});
