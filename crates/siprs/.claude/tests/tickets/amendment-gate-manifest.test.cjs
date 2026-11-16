// @verifies C009
'use strict';

/**
 * The amendment-integrity gate reads append-only ledgers as a hash chain.
 *
 * Each ledger records the digest immediately after its own append. A later
 * amendment moves the file, so comparing every ledger with the current bytes
 * rejects the second amendment by construction. Each afterDigest must equal the
 * next beforeDigest, and only the last afterDigest must reproduce the file. The
 * amendment being applied is not a ledger yet, so it is passed as the pending
 * tail and closes the chain for the post-append gate run.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');

const CLAUDE_DIR = path.resolve(__dirname, '../..');
const MANIFEST_MODULE = path.join(CLAUDE_DIR, 'scripts/tickets/amendment-gate-manifest.js');

// [::TICKET::] PX-431 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-431 --for-spec --no-implementation-order`.
function digest(text) {
  return createHash('sha256').update(text).digest('hex');
}

// [::TICKET::] PX-431 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-431 --for-spec --no-implementation-order`.
function createPackage() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'amendment-gate-'));
  fs.mkdirSync(path.join(directory, 'amendments'));
  return directory;
}

// [::TICKET::] PX-431 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-431 --for-spec --no-implementation-order`.
function writeLedger(directory, name, ledger) {
  fs.writeFileSync(path.join(directory, 'amendments', name), JSON.stringify(ledger, null, 2));
}

// [::TICKET::] PX-431 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-431 --for-spec --no-implementation-order`.
function runIntegrity(directory, pendingAmendment = null) {
  const { DEFAULT_RUNNERS } = require(MANIFEST_MODULE);
  return DEFAULT_RUNNERS['amendment-integrity']({ cwd: directory, pendingAmendment });
}

describe('amendment integrity', () => {
  test('one ledger whose afterDigest is the current file is intact', () => {
    const directory = createPackage();
    const target = path.join(directory, 'RFC.md');
    const current = 'body\n';
    fs.writeFileSync(target, current);
    try {
      writeLedger(directory, 'P0-1-1.json', { artifactPath: target, beforeDigest: digest('body'), afterDigest: digest(current) });
      assert.deepStrictEqual(runIntegrity(directory).findings, []);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('one stale ledger is a mismatch', () => {
    const directory = createPackage();
    const target = path.join(directory, 'RFC.md');
    fs.writeFileSync(target, 'body changed\n');
    try {
      writeLedger(directory, 'P0-1-1.json', { artifactPath: target, beforeDigest: digest('body'), afterDigest: digest('body\n') });
      const findings = runIntegrity(directory).findings;
      assert.strictEqual(findings.some((finding) => finding.code === 'AMENDMENT_LEDGER_MISMATCH'), true);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('two amendments form a valid chain', () => {
    const directory = createPackage();
    const target = path.join(directory, 'RFC.md');
    const first = 'body\n';
    const second = 'body\n\nsecond\n';
    fs.writeFileSync(target, second);
    try {
      writeLedger(directory, 'P0-1-1.json', { artifactPath: target, beforeDigest: digest('body'), afterDigest: digest(first), createdAt: '2026-01-01T00:00:00.000Z' });
      writeLedger(directory, 'P0-6-2.json', { artifactPath: target, beforeDigest: digest(first), afterDigest: digest(second), createdAt: '2026-01-02T00:00:00.000Z' });
      assert.deepStrictEqual(runIntegrity(directory).findings, []);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('a broken chain is named even when the last ledger matches the file', () => {
    const directory = createPackage();
    const target = path.join(directory, 'RFC.md');
    const second = 'body\n\nsecond\n';
    fs.writeFileSync(target, second);
    try {
      writeLedger(directory, 'P0-1-1.json', { artifactPath: target, beforeDigest: digest('body'), afterDigest: digest('body\nextra\n'), createdAt: '2026-01-01T00:00:00.000Z' });
      writeLedger(directory, 'P0-6-2.json', { artifactPath: target, beforeDigest: digest('body\n'), afterDigest: digest(second), createdAt: '2026-01-02T00:00:00.000Z' });
      const findings = runIntegrity(directory).findings;
      assert.strictEqual(findings.some((finding) => finding.code === 'AMENDMENT_CHAIN_MISMATCH'), true);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('the last ledger must still match the current file', () => {
    const directory = createPackage();
    const target = path.join(directory, 'RFC.md');
    const first = 'body\n';
    fs.writeFileSync(target, 'body\n\ntampered\n');
    try {
      writeLedger(directory, 'P0-1-1.json', { artifactPath: target, beforeDigest: digest('body'), afterDigest: digest(first), createdAt: '2026-01-01T00:00:00.000Z' });
      writeLedger(directory, 'P0-6-2.json', { artifactPath: target, beforeDigest: digest(first), afterDigest: digest('body\n\nsecond\n'), createdAt: '2026-01-02T00:00:00.000Z' });
      const findings = runIntegrity(directory).findings;
      assert.strictEqual(findings.some((finding) => finding.code === 'AMENDMENT_LEDGER_MISMATCH'), true);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('a pending tail completes the chain', () => {
    const directory = createPackage();
    const target = path.join(directory, 'RFC.md');
    const first = 'body\n';
    const second = 'body\n\nsecond\n';
    fs.writeFileSync(target, second);
    try {
      writeLedger(directory, 'P0-1-1.json', { artifactPath: target, beforeDigest: digest('body'), afterDigest: digest(first), createdAt: '2026-01-01T00:00:00.000Z' });
      const result = runIntegrity(directory, {
        artifactPath: target,
        beforeDigest: digest(first),
        afterDigest: digest(second),
      });
      assert.deepStrictEqual(result.findings, []);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('a pending tail that does not follow the last ledger is a broken chain', () => {
    const directory = createPackage();
    const target = path.join(directory, 'RFC.md');
    const first = 'body\n';
    const second = 'body\n\nsecond\n';
    fs.writeFileSync(target, second);
    try {
      writeLedger(directory, 'P0-1-1.json', { artifactPath: target, beforeDigest: digest('body'), afterDigest: digest(first), createdAt: '2026-01-01T00:00:00.000Z' });
      const findings = runIntegrity(directory, {
        artifactPath: target,
        beforeDigest: digest('body\nextra\n'),
        afterDigest: digest(second),
      }).findings;
      assert.strictEqual(findings.some((finding) => finding.code === 'AMENDMENT_CHAIN_MISMATCH'), true);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
