import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { runCommand } from '../../.claude/scripts/smooth-sequences/run.mjs';
import {
  defaultViews,
  distributionMapBlock,
  materializeSmoothWorkspace,
  minimalV3Artifact,
  operationRow,
  rfcBody,
} from './helpers/workspace-fixture.mjs';

// [::TICKET::] PX-275 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-275 --for-spec --no-implementation-order`.

const DETECTOR_DIRECTORY = '.claude/scripts/smooth-sequences';
// The four distinctive status names are rejected anywhere. "failed" is ordinary detector
// vocabulary (checks.failed), so it is rejected only where it would be a quoted status
// literal, which is the form a hardcoded terminal name takes.
const FORBIDDEN_IN_DETECTOR = /gaia|soul_id|Core Operation|Procedure Registry|CONTRIBUTED_ROWS|CONTRIBUTED_OPERATION_KINDS|\/Users\/|\b(finalized|rejected|cancelled|expired)\b|["']failed["']/i;

/** Every source file the detector ships, excluding tests. */
// [::TICKET::] PX-275 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-275 --for-spec --no-implementation-order`.
// [::TICKET::] PX-292, PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-292|PX-293) --for-spec --no-implementation-order`.
function detectorSourceFiles() {
  return readdirSync(DETECTOR_DIRECTORY, { recursive: true })
    .filter((name) => name.endsWith('.mjs') || name.endsWith('.js'))
    .map((name) => join(DETECTOR_DIRECTORY, name));
}

// @verifies C007
test('the detector sources carry no project vocabulary and no absolute path', () => {
  for (const file of detectorSourceFiles()) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), FORBIDDEN_IN_DETECTOR, file);
  }
});

// @verifies C007
// [::TICKET::] PX-276 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-276 --for-spec --no-implementation-order`.
test('a workspace that declares grpc and closed is judged green', () => {
  const artifact = minimalV3Artifact();
  artifact.vocabulary = { terminalStatuses: ['closed'], requiredInterfaces: ['grpc'] };
  artifact.operations = artifact.operations.map((operation) => operationRow(operation.id, {
    registry_contribution: operation.registry_contribution,
    rest: undefined,
    cli: undefined,
    grpc: 'rpc Orders',
    allowed_status_transitions: { open: ['closed'], closed: [] },
  }));
  const workspace = materializeSmoothWorkspace({ artifact });
  try {
    const result = runCommand([workspace.root, '--legacy']);
    assert.equal(result.exitCode, 0);
    assert.deepEqual(result.report.findings, []);
    assert.deepEqual(result.report.withheld, []);
  } finally {
    workspace.remove();
  }
});

// @verifies C007
test('prose that names contribution shapes changes no verdict', () => {
  const providerView = defaultViews()['pkg-0001'];
  const prose = [
    '# RFC pkg-0001',
    '',
    'This package is the only unit of this package that is a Core Operation.',
    'The Procedure Registry owes a CONTRIBUTED_ROWS row here.',
    '```rust',
    'pub const CONTRIBUTED_OPERATION_KINDS: &[&str] = &["ProduceFact"];',
    'const KIND: &str = "ProduceFact"; // operation_kind: "ProduceFact"',
    '```',
    '### 1.1 Design',
    '',
    'boundary-001',
    '',
    '<!-- unit: op-ProduceFact -->',
    '<!-- unit: seq-A-1 -->',
    '<!-- unit: xdir-A-1 -->',
    '<!-- unit: ctr-boundary-001 -->',
    '',
    '## Distribution ledger',
    '',
    'This document is canonical for the units below.',
    '',
    '| Unit | Kind | Owner | RFC location | Ground |',
    '| --- | --- | --- | --- | --- |',
    '| op-ProduceFact | operation | pkg-0001 | 1.1 | recorded |',
    '| seq-A-1 | sequence | pkg-0001 | 1.1 | recorded |',
    '| xdir-A-1 | cross-boundary-sequence | pkg-0001 | 1.1 | recorded |',
    '| ctr-boundary-001 | contract | pkg-0001 | 1.1 | recorded |',
    '',
    '## Appendix A. Cross-directory defect ledger',
    '',
    'Composition check: the designs were read; no contradiction was found.',
    '',
  ].join('\n') + `\n${distributionMapBlock(providerView)}`;
  const workspace = materializeSmoothWorkspace({
    rfcBodies: {
      'pkg-0001': prose,
      'pkg-0002': `${rfcBody({ packageId: 'pkg-0002', operationId: 'ConsumeFact', crossSequenceIds: ['A-1'] })}\n${distributionMapBlock(defaultViews()['pkg-0002'])}`,
    },
  });
  try {
    const result = runCommand([workspace.root, '--legacy']);
    assert.equal(result.exitCode, 0);
    assert.deepEqual(result.report.findings, []);
  } finally {
    workspace.remove();
  }
});

// @verifies C008
test('the real workspace is green when supplied', { skip: !process.env.SMOOTH_SEQUENCES_WORKSPACE }, () => {
  const result = runCommand([process.env.SMOOTH_SEQUENCES_WORKSPACE, '--legacy']);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.report.findings, []);
  assert.deepEqual(result.report.withheld, []);
});
