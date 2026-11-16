// @verifies C005
'use strict';

/**
 * consolidate-stubs-gate.test.js — the Step 5 blocking gate.
 *
 * The gate must distinguish four tree states:
 *   - zero markers, no manifest    → pass (nothing to consolidate)
 *   - markers, no manifest         → fail (consolidation never ran)
 *   - zero markers, stale manifest → fail (manifest references a resolved marker)
 *   - markers, matching manifest   → pass (manifest is consumable)
 *
 * The zero-stub pass mirrors require-consolidated-manifest.js: the manifest is
 * legitimately absent when there is nothing to group into units.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const GATE = path.resolve(__dirname, '../../scripts/tickets/consolidate-stubs-gate.sh');

const MARKER_LINE =
  '// [::STUB::] P0-1: audio primitives pending -- Implement audio primitives in src/a.rs';
const MARKER_FILE = 'src/a.rs';

let passed = 0;
let failed = 0;

// [::TICKET::] PX-431 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-431 --for-spec --no-implementation-order`.
function assert(condition, message) {
  if (condition) {
    passed++;
    process.stdout.write('  ✓ ' + message + '\n');
  } else {
    failed++;
    process.stdout.write('  ✗ ' + message + '\n');
  }
}

/** Build a throwaway Tickets.json root with the given tree state. */
// [::TICKET::] PX-431 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-431 --for-spec --no-implementation-order`.
function createWorkspace({ marker, manifest }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'consolidate-gate-test-'));
  fs.mkdirSync(path.join(directory, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(directory, MARKER_FILE),
    marker ? MARKER_LINE + '\n' : 'pub fn a() {}\n'
  );
  fs.writeFileSync(
    path.join(directory, 'Tickets.json'),
    JSON.stringify({
      title: 'gate fixture',
      round: 1,
      metadata: { source: 'gate fixture', generatedAt: '2026-01-01' },
      phases: [
        {
          id: 0,
          name: 'P0',
          tickets: [{ id: 1, phaseId: 0, title: 'fixture ticket', status: 'reviewed' }],
        },
      ],
      identity: {},
    })
  );
  if (manifest) {
    fs.mkdirSync(path.join(directory, 'manifests'), { recursive: true });
    fs.writeFileSync(
      path.join(directory, 'manifests', 'CONSOLIDATED-MANIFEST-20260101000000.json'),
      JSON.stringify(manifest, null, 2) + '\n'
    );
  }
  return directory;
}

// [::TICKET::] PX-431 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-431 --for-spec --no-implementation-order`.
function runGate(directory) {
  return spawnSync('bash', [GATE], { cwd: directory, encoding: 'utf8' });
}

// [::TICKET::] PX-431 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-431 --for-spec --no-implementation-order`.
function manifestForCurrentMarker() {
  return [{ sourceKey: 'P0-1', stubs: [{ file: MARKER_FILE, line: 1, content: MARKER_LINE }] }];
}

{
  const directory = createWorkspace({ marker: false, manifest: null });
  const result = runGate(directory);
  assert(result.status === 0, 'zero markers with no manifest exits 0');
  fs.rmSync(directory, { recursive: true, force: true });
}

{
  const directory = createWorkspace({ marker: true, manifest: null });
  const result = runGate(directory);
  assert(result.status !== 0, 'markers without a manifest exits non-zero');
  fs.rmSync(directory, { recursive: true, force: true });
}

{
  const directory = createWorkspace({ marker: false, manifest: manifestForCurrentMarker() });
  const result = runGate(directory);
  assert(result.status !== 0, 'stale manifest referencing a resolved marker exits non-zero');
  fs.rmSync(directory, { recursive: true, force: true });
}

{
  const directory = createWorkspace({ marker: true, manifest: manifestForCurrentMarker() });
  const result = runGate(directory);
  assert(
    result.status === 0,
    'matching manifest exits 0' +
      (result.status === 0 ? '' : ' (stderr: ' + (result.stderr || '').trim().split('\n')[0] + ')')
  );
  fs.rmSync(directory, { recursive: true, force: true });
}

process.stdout.write('\nconsolidate-stubs-gate.test.cjs: ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed === 0 ? 0 : 1);
