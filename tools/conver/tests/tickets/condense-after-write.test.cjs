'use strict';

/**
 * PX-443 follow-up — the shared write-then-condense transaction.
 *
 * Every ticket-writing path must be able to promote a document, condense it with
 * the shared CLI, gate the result, and restore the pre-write document when
 * either step refuses. Keeping this in one helper is what makes the drill and
 * legacy omission paths share one implementation.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  condenseAfterWrite,
} = require('../../.claude/scripts/tickets/lib/condense-after-write.js');

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'condense-after-write-'));
  const ticketsPath = path.join(directory, 'Tickets.json');
  const backupPath = path.join(directory, 'Tickets.pre-approve.json');
  fs.writeFileSync(ticketsPath, '{"title":"after"}\n', 'utf8');
  fs.writeFileSync(backupPath, '{"title":"before"}\n', 'utf8');
  return { directory, ticketsPath, backupPath };
}

test('C003: apply then gate runs the shared CLI and keeps the condensed document', () => {
  const { directory, ticketsPath, backupPath } = fixture();
  try {
    const calls = [];
    const result = condenseAfterWrite({
      ticketsPath,
      backupPath,
      run: (args, cwd) => {
        calls.push({ args, cwd });
        return { status: 0, stderr: '' };
      },
    });

    assert.equal(result.ok, true);
    assert.equal(fs.readFileSync(ticketsPath, 'utf8'), '{"title":"after"}\n');
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0].args.slice(1), ['--apply', '--tickets=' + ticketsPath, '--merge-status=todo']);
    assert.deepEqual(calls[1].args.slice(1), ['--gate', '--tickets=' + ticketsPath]);
    assert.equal(calls[0].cwd, directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('C003: a refused apply restores the pre-write document', () => {
  const { directory, ticketsPath, backupPath } = fixture();
  try {
    const result = condenseAfterWrite({
      ticketsPath,
      backupPath,
      run: () => ({ status: 1, stderr: 'condense refused' }),
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'CONDENSE_AFTER_WRITE_FAILED');
    assert.match(result.stderr, /condense refused/);
    assert.equal(fs.readFileSync(ticketsPath, 'utf8'), '{"title":"before"}\n');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('C003: a refused gate restores the pre-write document', () => {
  const { directory, ticketsPath, backupPath } = fixture();
  try {
    const result = condenseAfterWrite({
      ticketsPath,
      backupPath,
      run: (args) => (args.includes('--gate')
        ? { status: 1, stderr: 'gate refused' }
        : { status: 0, stderr: '' }),
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'CONDENSE_GATE_FAILED');
    assert.match(result.stderr, /gate refused/);
    assert.equal(fs.readFileSync(ticketsPath, 'utf8'), '{"title":"before"}\n');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('C003: a caller can keep its historical apply-failure code', () => {
  const { directory, ticketsPath, backupPath } = fixture();
  try {
    const result = condenseAfterWrite({
      ticketsPath,
      backupPath,
      failureCode: 'CONDENSE_AFTER_MERGE_FAILED',
      run: () => ({ status: 1, stderr: 'legacy refused' }),
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'CONDENSE_AFTER_MERGE_FAILED');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
