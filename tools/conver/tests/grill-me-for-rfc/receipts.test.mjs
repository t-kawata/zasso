// PX-377 @verifies C003
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-377 --for-spec --no-implementation-order`.
/**
 * The receipt each stage records, and the delta that keeps legacy findings out of the way.
 *
 * A receipt is the RFC digest a stage read, the inputs it consumed, the output it wrote
 * and the step verdicts that admitted the write. These tests assert that shape directly
 * and that a missing receipt is never mistaken for a fresh one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import stageReceipt from '../../.claude/scripts/rfc-graph/lib/stage-receipt.js';
import findingDelta from '../../.claude/scripts/lib/finding-delta.js';

const {
  RECEIPT_STATE,
  STAGE_STATUS_FILES,
  compareStageReceipts,
  digestFile,
  recordStageReceipt,
} = stageReceipt;
const { diffFindings } = findingDelta;

const RFC_TEXT = '# RFC\n\n## Design\n';

/** A package directory with the RFC and the graph a receipt names. */
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-377) --for-spec --no-implementation-order`.
function makePackage() {
  const directory = mkdtempSync(join(tmpdir(), 'px377-receipt-'));
  writeFileSync(join(directory, 'RFC.md'), RFC_TEXT, 'utf8');
  writeFileSync(join(directory, 'RFC-GRAPH.json'), '{}\n', 'utf8');
  return directory;
}

/** The status a stage would write, optionally carrying a receipt. */
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-377) --for-spec --no-implementation-order`.
function statusFor(directory, receipt = null) {
  return {
    sourceFile: 'RFC.md',
    graphFile: 'RFC-GRAPH.json',
    currentStep: 5,
    steps: { 5: 'done' },
    generation: 1,
    runs: 1,
    runId: 'run-1',
    lastOutputDigest: digestFile(join(directory, 'RFC-GRAPH.json')),
    coverage: null,
    ...(receipt === null ? {} : { receipt }),
  };
}

/** Write one stage status beside the fixture. */
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-377) --for-spec --no-implementation-order`.
function writeStageStatus(directory, status) {
  writeFileSync(join(directory, STAGE_STATUS_FILES.graphify), JSON.stringify(status), 'utf8');
}

test('C003 postcondition: digestFile is the sha256 of the bytes read', () => {
  const directory = makePackage();

  assert.equal(digestFile(join(directory, 'RFC.md')), createHash('sha256').update(RFC_TEXT).digest('hex'));
});

test('C003 postcondition: recordStageReceipt carries the RFC digest, inputs, output and verdicts', () => {
  const directory = makePackage();
  const receipted = recordStageReceipt(statusFor(directory), {
    stage: 'graphify',
    rfcPath: join(directory, 'RFC.md'),
    inputs: { graph: join(directory, 'RFC-GRAPH.json') },
    outputPath: join(directory, 'RFC-GRAPH.json'),
    gateVerdicts: [{ step: '5', verdict: 'done' }],
  });

  assert.equal(receipted.receipt.stage, 'graphify');
  assert.equal(receipted.receipt.sourceDigest, digestFile(join(directory, 'RFC.md')));
  assert.equal(receipted.receipt.inputDigests.graph, digestFile(join(directory, 'RFC-GRAPH.json')));
  assert.equal(receipted.receipt.outputDigest, digestFile(join(directory, 'RFC-GRAPH.json')));
  assert.deepEqual(receipted.receipt.gateVerdicts, [{ step: '5', verdict: 'done' }]);
  assert.ok(receipted.receipt.recordedAt.length > 0);
});

test('C003 normal: a matching receipt is fresh', () => {
  const directory = makePackage();
  const receipted = recordStageReceipt(statusFor(directory), {
    stage: 'graphify',
    rfcPath: join(directory, 'RFC.md'),
    outputPath: join(directory, 'RFC-GRAPH.json'),
  });
  writeStageStatus(directory, receipted);

  assert.deepEqual(compareStageReceipts(directory, ['graphify'], digestFile(join(directory, 'RFC.md'))), []);
});

test('C003 error: a changed RFC digest is stale', () => {
  const directory = makePackage();
  const receipted = recordStageReceipt(statusFor(directory), {
    stage: 'graphify',
    rfcPath: join(directory, 'RFC.md'),
    outputPath: join(directory, 'RFC-GRAPH.json'),
  });
  receipted.receipt.sourceDigest = 'b'.repeat(64);
  writeStageStatus(directory, receipted);

  const findings = compareStageReceipts(directory, ['graphify'], digestFile(join(directory, 'RFC.md')));
  assert.equal(findings[0].code, 'RECEIPT_STALE');
  assert.equal(findings[0].stage, 'graphify');
});

test('C003 error: an absent receipt is missing, never fresh', () => {
  const directory = makePackage();
  writeStageStatus(directory, statusFor(directory));

  const findings = compareStageReceipts(directory, ['graphify'], digestFile(join(directory, 'RFC.md')));
  assert.equal(findings[0].code, 'RECEIPT_MISSING');
});

test('C003 error: a receipt whose output digest does not match the status is refused', () => {
  const directory = makePackage();
  const receipted = recordStageReceipt(statusFor(directory), {
    stage: 'graphify',
    rfcPath: join(directory, 'RFC.md'),
    outputPath: join(directory, 'RFC-GRAPH.json'),
  });
  receipted.lastOutputDigest = 'a'.repeat(64);
  writeStageStatus(directory, receipted);

  const findings = compareStageReceipts(directory, ['graphify'], digestFile(join(directory, 'RFC.md')));
  assert.equal(findings[0].code, 'RECEIPT_OUTPUT_MISMATCH');
});

test('C003 invariant: a receipt read state names every stage', () => {
  const directory = makePackage();
  const receipted = recordStageReceipt(statusFor(directory), {
    stage: 'graphify',
    rfcPath: join(directory, 'RFC.md'),
    outputPath: join(directory, 'RFC-GRAPH.json'),
  });
  writeStageStatus(directory, receipted);

  const stageReceipts = stageReceipt.readStageReceipts(directory, digestFile(join(directory, 'RFC.md')));
  assert.equal(stageReceipts.graphify.state, RECEIPT_STATE.FRESH);
  assert.equal(stageReceipts.boundify.state, RECEIPT_STATE.MISSING);
  assert.equal(stageReceipts.split.state, RECEIPT_STATE.MISSING);
});

test('C004 normal: diffFindings keeps inherited findings out of the blocking set', () => {
  const before = [{ code: 'UNIT_SET_MISMATCH', subject: 'u1' }];
  const after = [
    { code: 'UNIT_SET_MISMATCH', subject: 'u1' },
    { code: 'FORMULA_NO_TICKET', formulaId: 'fx-1' },
  ];

  assert.deepEqual(diffFindings(before, after), [after[1]]);
});
