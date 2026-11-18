'use strict';

// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-443 --for-spec --no-implementation-order`.
/**
 * PX-443 C005 — an extra verifier refuses a mutation and the pre-image is restored.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { runMutationGate } = require('../../.claude/scripts/tickets/ticket-mutation-gate.js');

/** A package with one empty ticket set. */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-443 --for-spec --no-implementation-order`.
function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'px443-gate-'));
  const ticketsPath = path.join(directory, 'Tickets.json');
  const before = { version: 1, phases: [] };
  fs.writeFileSync(ticketsPath, JSON.stringify(before, null, 2) + '\n');
  return { directory, ticketsPath, before };
}

// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-443 --for-spec --no-implementation-order`.
function runWith({ fixture: box, extraVerify, retainBefore = false, afterDocument }) {
  return runMutationGate({
    ticketsPath: box.ticketsPath,
    manifest: { command: 'find-omissions', added: [], origin: 'omission' },
    afterDocument: afterDocument ?? { version: 1, phases: [] },
    verify: () => [],
    extraVerify,
    retainBefore,
    packageDirectory: box.directory,
    filesChanged: false,
  });
}

test('C005: an extra verifier refusal restores Tickets.json byte-for-byte', () => {
  const box = fixture();
  const beforeBytes = fs.readFileSync(box.ticketsPath);
  const result = runWith({
    fixture: box,
    extraVerify: () => [{ code: 'OMISSION_SET_NOT_MINIMAL', subject: 'P1-1', message: 'not a fixed point' }],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(fs.readFileSync(box.ticketsPath), beforeBytes);
});

test('C005: a refused mutation does not stamp the candidate distribution', () => {
  const box = fixture();
  const afterDocument = { version: 1, phases: [] };
  const result = runWith({
    fixture: box,
    afterDocument,
    extraVerify: () => [{ code: 'OMISSION_SET_NOT_MINIMAL', subject: 'P1-1', message: 'not a fixed point' }],
  });

  assert.equal(result.ok, false);
  assert.equal(afterDocument.distribution, undefined);
});

test('C005: retainBefore exposes rollback and commit for a multi-file transaction', () => {
  const box = fixture();
  const beforeBytes = fs.readFileSync(box.ticketsPath);
  const result = runWith({ fixture: box, extraVerify: () => [], retainBefore: true });

  assert.equal(result.ok, true);
  assert.equal(typeof result.rollback, 'function');
  assert.equal(typeof result.commit, 'function');
  assert.equal(fs.existsSync(result.beforePath), true);

  result.rollback();
  assert.deepEqual(fs.readFileSync(box.ticketsPath), beforeBytes);
});

test('C005: commit removes the retained pre-image without touching Tickets.json', () => {
  const box = fixture();
  const result = runWith({ fixture: box, extraVerify: () => [], retainBefore: true });
  const promotedBytes = fs.readFileSync(box.ticketsPath);

  assert.equal(result.ok, true);
  result.commit();
  assert.equal(fs.existsSync(result.beforePath), false);
  assert.deepEqual(fs.readFileSync(box.ticketsPath), promotedBytes);
});
