// @verifies C001
// [::TICKET::] PX-203 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-203 --for-spec --no-implementation-order`.
// Layer detection over a contaminated tree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  resolveTargetRoot,
  detectForwardTraces,
  detectTicketKeyedFilenames,
} from '../../../.claude/scripts/workspacify-reverse/lib/detect-forward-traces.mjs';
import {
  createScratchProject,
  hashTree,
} from '../helpers/scratch.mjs';

// UT-1
test('resolveTargetRoot enumerates tracked extensions and declares its exclusions', () => {
  const scratch = createScratchProject();
  try {
    const root = resolveTargetRoot(scratch.root);
    assert.equal(root.exists, true);
    assert.deepEqual(root.excludedDirs, ['.git', 'node_modules', 'vendor']);
    const extensions = new Set(root.files.map((file) => file.ext));
    for (const ext of ['.rs', '.toml']) assert.ok(extensions.has(ext), ext);
  } finally {
    scratch.dispose();
  }
});

// UT-1 (error case)
test('resolveTargetRoot reports a missing root instead of throwing silently', () => {
  const root = resolveTargetRoot(path.join('/nonexistent', 'wsp-reverse-missing'));
  assert.equal(root.exists, false);
});

// UT-2
test('L1 detection reports per-file line numbers for provenance comments', () => {
  const scratch = createScratchProject();
  try {
    const report = detectForwardTraces(scratch.root);
    assert.ok(report.layers.L1.count > 0);
    const libFindings = report.layers.L1.findings.filter((f) => f.file.endsWith('lib.rs'));
    assert.ok(libFindings.length > 0);
    assert.ok(libFindings.every((f) => Number.isInteger(f.line) && f.line >= 1));
    assert.ok(libFindings.some((f) => f.text.includes('[::TICKET::]')));
    assert.ok(libFindings.some((f) => f.text.includes('Initial Design Artifact')));
  } finally {
    scratch.dispose();
  }
});

// UT-3
test('L2 detection finds contract ids and contract prose', () => {
  const scratch = createScratchProject();
  try {
    const report = detectForwardTraces(scratch.root);
    assert.ok(report.layers.L2.count > 0);
    const errorFindings = report.layers.L2.findings.filter((f) => f.file.endsWith('error.rs'));
    assert.ok(errorFindings.some((f) => f.text.includes('@verifies')));
    assert.ok(errorFindings.some((f) => /C0\d+ (invariant|postcondition|precondition)/.test(f.text)));
    assert.ok(errorFindings.some((f) => f.text.includes('O-001')));
  } finally {
    scratch.dispose();
  }
});

// UT-4
test('L3 detection finds source code that depends on the design document', () => {
  const scratch = createScratchProject();
  try {
    const report = detectForwardTraces(scratch.root);
    assert.ok(report.layers.L3.count > 0);
    assert.ok(report.layers.L3.findings.every((f) => f.file.endsWith('spec_dependent.rs')));
  } finally {
    scratch.dispose();
  }
});

// UT-5
test('L4 is the only non-removable layer and carries no findings', () => {
  const scratch = createScratchProject();
  try {
    const report = detectForwardTraces(scratch.root);
    assert.equal(report.layers.L4.removable, false);
    assert.equal(report.layers.L4.findings.length, 0);
    for (const layer of ['L1', 'L2', 'L3']) {
      assert.equal(report.layers[layer].removable, true, layer);
    }
  } finally {
    scratch.dispose();
  }
});

// UT-18
test('ticket-keyed test filenames are discovered by name', () => {
  const scratch = createScratchProject();
  try {
    const found = detectTicketKeyedFilenames(scratch.root);
    assert.ok(found.some((f) => f.endsWith(path.join('tests', 'verify_spec_p9_1.rs'))));
  } finally {
    scratch.dispose();
  }
});

// C001 invariant — detection is read-only
test('detection never mutates the target tree', () => {
  const scratch = createScratchProject();
  try {
    const before = hashTree(scratch.root);
    detectForwardTraces(scratch.root);
    detectTicketKeyedFilenames(scratch.root);
    assert.deepEqual(hashTree(scratch.root), before);
  } finally {
    scratch.dispose();
  }
});

// Report shape
test('detection renders a Markdown report for the AI to read', () => {
  const scratch = createScratchProject();
  try {
    const report = detectForwardTraces(scratch.root);
    assert.match(report.markdown, /^## /m);
    assert.match(report.markdown, /L1/);
    assert.match(report.markdown, /L4/);
  } finally {
    scratch.dispose();
  }
});
