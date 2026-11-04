// PX-356 @verifies C002
// The coverage gate has two invocation shapes: the split pipeline calls it with no argument
// and expects the canonical Tickets.json, while a caller may name a Tickets.json explicitly.
// Both shapes must hand the resolved path to the material reader, or a readable root sidecar
// is reported as missing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { resolveInvocation } = require('../../.claude/scripts/tickets/verify-all-ticket-coverage.js');
const COVERAGE_SCRIPT = path.resolve('.claude/scripts/tickets/verify-all-ticket-coverage.js');

test('C002 no argument hands the canonical Tickets.json to the material reader', () => {
// [::TICKET::] PX-356 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-356 --for-spec --no-implementation-order`.
  assert.deepEqual(resolveInvocation([], 'Pkg/Tickets.json'), {
    ticketsPath: 'Pkg/Tickets.json',
    materialArgv: ['Pkg/Tickets.json'],
  });
});

test('C002 flags do not displace the canonical Tickets.json', () => {
  assert.deepEqual(resolveInvocation(['--artifact=/root/RFC-sequences.json'], 'Pkg/Tickets.json'), {
    ticketsPath: 'Pkg/Tickets.json',
    materialArgv: ['Pkg/Tickets.json', '--artifact=/root/RFC-sequences.json'],
  });
});

test('C002 an explicit Tickets.json is preserved', () => {
  const resolved = resolveInvocation(
    ['Pkg/Tickets.json', '--artifact=/root/RFC-sequences.json'],
    'Other/Tickets.json',
  );

  assert.equal(resolved.ticketsPath, 'Pkg/Tickets.json');
  assert.deepEqual(resolved.materialArgv, ['Pkg/Tickets.json', '--artifact=/root/RFC-sequences.json']);
});

test('C002 a flag value is not mistaken for Tickets.json', () => {
  assert.deepEqual(resolveInvocation(['--graph', '/tmp/RFC-GRAPH.json'], 'Pkg/Tickets.json'), {
    ticketsPath: 'Pkg/Tickets.json',
    materialArgv: ['Pkg/Tickets.json', '--graph', '/tmp/RFC-GRAPH.json'],
  });
});

test('C002 no-argument run in a workspace with a sidecar exits 0', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'px356-coverage-'));
  const packageDirectory = path.join(root, 'crates', 'pkg-a');
  fs.mkdirSync(packageDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(root, 'WORKSPACIFY-TREE-MANIFEST.json'),
    JSON.stringify({ workspace: { packages: [{ id: 'pkg-a', path: 'crates/pkg-a' }] } }),
  );
  fs.writeFileSync(
    path.join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'),
    JSON.stringify({ contract_registry: [] }),
  );
  fs.writeFileSync(
    path.join(packageDirectory, 'Tickets.json'),
    JSON.stringify({ phases: [{ id: 0, nodeIds: ['N1'], tickets: [{ id: 1, phaseId: 0, nodeIds: ['N1'] }] }] }),
  );
  fs.writeFileSync(
    path.join(packageDirectory, 'SEQUENCES.json'),
    JSON.stringify({ packageId: 'pkg-a', ownedOperationUnits: [] }),
  );
  fs.writeFileSync(
    path.join(root, 'RFC-sequences.json'),
    JSON.stringify({ operations: [], sequences: [], steps: [] }),
  );
  fs.writeFileSync(
    path.join(packageDirectory, 'RFC-GRAPH.json'),
    JSON.stringify({ nodes: [{ id: 'N1', unitIds: [] }], edges: [] }),
  );

  try {
    const result = spawnSync(process.execPath, [COVERAGE_SCRIPT], {
      cwd: packageDirectory,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.doesNotMatch(result.stdout + result.stderr, /MISSING_SIDECAR/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C002 a genuinely missing sidecar still fails', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'px356-coverage-missing-'));
  const packageDirectory = path.join(root, 'crates', 'pkg-a');
  fs.mkdirSync(packageDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(root, 'WORKSPACIFY-TREE-MANIFEST.json'),
    JSON.stringify({ workspace: { packages: [{ id: 'pkg-a', path: 'crates/pkg-a' }] } }),
  );
  fs.writeFileSync(
    path.join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'),
    JSON.stringify({ contract_registry: [] }),
  );
  fs.writeFileSync(path.join(packageDirectory, 'Tickets.json'), JSON.stringify({ phases: [] }));

  try {
    const result = spawnSync(process.execPath, [COVERAGE_SCRIPT], {
      cwd: packageDirectory,
      encoding: 'utf8',
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /MISSING_SIDECAR/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
