import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateEscape,
  validatePositionDisposition,
} from '../../.claude/scripts/shared-obligations/judgment.mjs';
import { resolveActPatterns } from '../../.claude/scripts/smooth-sequences/lib/act-vocabulary.mjs';
import { sha256File } from '../../.claude/scripts/shared-obligations/evidence.mjs';

// [::TICKET::] PX-298 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-298 --for-spec --no-implementation-order`.
const GAIA_ROOT = process.env.GAIA_ROOT || null;
// [::TICKET::] PX-298 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-298 --for-spec --no-implementation-order`.
const SKIP = GAIA_ROOT === null ? 'GAIA_ROOT is not set' : false;
// [::TICKET::] PX-298 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-298 --for-spec --no-implementation-order`.
const SPEC_NAME = 'GaiaSekkeiShiyousho_v32.md';
// [::TICKET::] PX-298 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-298 --for-spec --no-implementation-order`.
const ARTIFACT_NAME = 'GaiaSekkeiShiyousho_v32-sequences.json';
// [::TICKET::] PX-298 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-298 --for-spec --no-implementation-order`.
const SUBJECTS = JSON.parse(readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'px298-subjects.json'),
  'utf8',
));

// [::TICKET::] PX-298 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-298 --for-spec --no-implementation-order`.
function readJson(root, relative) {
  return JSON.parse(readFileSync(join(root, relative), 'utf8'));
}

// [::TICKET::] PX-298 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-298 --for-spec --no-implementation-order`.
function readJsonl(root, relative) {
  const path = join(root, relative);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
}

// [::TICKET::] PX-298 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-298 --for-spec --no-implementation-order`.
function artifactOf(root) {
  return readJson(root, ARTIFACT_NAME);
}

// [::TICKET::] PX-298 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-298 --for-spec --no-implementation-order`.
function specLinesOf(root) {
  return { [SPEC_NAME]: readFileSync(join(root, SPEC_NAME), 'utf8').split('\n') };
}

// [::TICKET::] PX-298 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-298 --for-spec --no-implementation-order`.
function operationOf(artifact, id) {
  return (artifact.operations ?? []).find((operation) => operation.id === id);
}

// [::TICKET::] PX-298 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-298 --for-spec --no-implementation-order`.
function groundingQuote(operation) {
  if (typeof operation?.grounding?.quote === 'string') return operation.grounding.quote;
  for (const property of Object.values(operation?.grounding?.properties ?? {})) {
    if (typeof property?.quote === 'string' && property.quote.trim() !== '') return property.quote;
  }
  return '';
}

// @verifies C001
// [::TICKET::] PX-298 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-298 --for-spec --no-implementation-order`.
test('C001 every operation has a consistent position, disposition and ground', { skip: SKIP }, () => {
  const artifact = artifactOf(GAIA_ROOT);
  for (const operation of artifact.operations ?? []) {
    const result = validatePositionDisposition(operation);
    assert.equal(result.ok, true, `${operation.id}: ${result.code}`);
  }
  for (const id of SUBJECTS.positionDisposition) {
    const operation = operationOf(artifact, id);
    assert.notEqual(operation, undefined, `${id} is absent from the artifact`);
    assert.equal(
      operation.disposition === 'active'
        && operation.grounding?.classification === 'no_act_stated_by_the_specification',
      false,
      `${id} is still active with a no-act ground`,
    );
  }
});

// @verifies C002
// [::TICKET::] PX-298 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-298 --for-spec --no-implementation-order`.
test('C002 every corrected escape cites a line that states no act', { skip: SKIP }, () => {
  const artifact = artifactOf(GAIA_ROOT);
  const linesByPath = specLinesOf(GAIA_ROOT);
  const actPatterns = resolveActPatterns(artifact);
  for (const id of [...SUBJECTS.positionDisposition, ...SUBJECTS.escapeAct]) {
    const operation = operationOf(artifact, id);
    assert.notEqual(operation, undefined, `${id} is absent from the artifact`);
    const result = validateEscape({
      escape: {
        subject: id,
        outcome: 'escaped',
        escapeKind: 'no_act',
        path: SPEC_NAME,
        line: operation.grounding?.line,
        quote: groundingQuote(operation),
      },
      linesByPath,
      actPatterns,
    });
    assert.equal(result.ok, true, `${id}: ${result.code}`);
  }
});

// @verifies C003
// [::TICKET::] PX-298 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-298 --for-spec --no-implementation-order`.
test('C003 no waiver covers the two S6 conflict families', { skip: SKIP }, () => {
  const path = join(GAIA_ROOT, 'SMOOTH-SEQUENCES-WAIVERS.json');
  const waivers = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')).waivers ?? [] : [];
  const conflicts = waivers.filter((waiver) => String(waiver?.findingKey ?? '').startsWith('S6.position-disposition-conflict')
    || String(waiver?.findingKey ?? '').startsWith('S6.escape-act-conflict'));
  assert.deepEqual(conflicts, []);
});

// @verifies C004
// [::TICKET::] PX-298 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-298 --for-spec --no-implementation-order`.
test('C004 the artifact digest is stable and matches the worklist', { skip: SKIP }, () => {
  const artifactPath = join(GAIA_ROOT, ARTIFACT_NAME);
  const digest = sha256File(artifactPath);
  assert.equal(sha256File(artifactPath), digest);
  const worklist = readJson(GAIA_ROOT, join('smooth-sequences', 'JUDGMENT-WORKLIST.json'));
  const digests = new Set((worklist.items ?? []).map((item) => item.artifactDigest));
  assert.equal(digests.size <= 1, true);
  for (const itemDigest of digests) assert.equal(itemDigest, digest);
});

// @verifies C005
// [::TICKET::] PX-298 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-298 --for-spec --no-implementation-order`.
test('C005 the corrected operations are carried by the span reading', { skip: SKIP }, () => {
  const readings = readJsonl(GAIA_ROOT, join('educe-sequences', 'readings-span.jsonl'));
  const operations = new Map();
  for (const reading of readings) {
    for (const step of reading.steps ?? []) {
      assert.equal(Number.isInteger(step.line), true, `${reading.subject}: a step carries no line`);
      assert.equal(typeof step.quote, 'string', `${reading.subject}: a step carries no quote`);
    }
    for (const operation of reading.operations ?? []) {
      if (typeof operation?.id === 'string') operations.set(operation.id, operation);
    }
  }
  for (const id of [...SUBJECTS.positionDisposition, ...SUBJECTS.escapeAct]) {
    assert.equal(operations.has(id), true, `${id} is not carried by a span reading`);
  }
});
