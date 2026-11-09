'use strict';

/**
 * PX-400 — report envelope and fixed gate manifest.
 *
 * Report mode always exits zero. An absent artifact is a skip, never a
 * finding, and a gate whose inputs are absent is unverifiable, never failed.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  verifyAmendment,
  runGateManifest,
  GATE_ENTRIES,
} = require('../../.claude/scripts/tickets/verify-amendment.js');

const VERIFY = path.resolve(__dirname, '../../.claude/scripts/tickets/verify-amendment.js');

const CLEAN_TICKET_RUNNERS = {
  'ticket-closure': () => ({ findings: [], unverifiable: [] }),
  'ticket-prerequisites': () => ({ findings: [], unverifiable: [] }),
  reverify: () => ({ findings: [], unverifiable: [] }),
};

// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
function tempPackage(files = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'px400-verify-'));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(directory, name), content);
  }
  return directory;
}

test('C008: an empty project reports five skips and zero findings', () => {
  const directory = tempPackage();

  const report = verifyAmendment({ cwd: directory, ticketKey: 'PX-400', report: true });

  assert.equal(report.gate, 'verify-amendment');
  assert.equal(report.ticketKey, 'PX-400');
  assert.deepEqual(report.findings, []);
  assert.equal(report.skipped.length, 5);
  assert.equal(report.skipped.every((entry) => entry.artifact && entry.reason), true);
  assert.ok(report.unverifiable.length > 0);
  assert.equal(report.unverifiable.every((entry) => entry.reason.startsWith('missing:')), true);
});

test('C008: the report envelope has the fixed key order and exits zero from the CLI', () => {
  const directory = tempPackage();

  const stdout = execFileSync(process.execPath, [
    VERIFY,
    '--report',
    '--ticket-key=PX-400',
    '--cwd=' + directory,
  ], { encoding: 'utf8' });

  const report = JSON.parse(stdout);
  assert.deepEqual(Object.keys(report).slice(0, 5), ['gate', 'ticketKey', 'findings', 'skipped', 'unverifiable']);
  assert.equal(report.findings.length, 0);
});

test('C008: the gate manifest is enumerated and versioned', () => {
  const names = GATE_ENTRIES.map((entry) => entry.name);

  assert.deepEqual(names, [
    'chain', 'graph-integrity', 'dirs-tree-schema', 'ticket-closure',
    'ticket-prerequisites', 'formula-file-coverage', 'reverify', 'amendment-integrity',
  ]);
  assert.equal(new Set(names).size, names.length);
});

test('C008: a gate with absent inputs is unverifiable, never a finding', () => {
  const directory = tempPackage();

  const result = runGateManifest({
    cwd: directory,
    ticketKey: 'PX-400',
    presentKinds: [],
    runners: {},
  });

  assert.deepEqual(result.findings, []);
  assert.ok(result.unverifiable.length > 0);
  assert.equal(result.unverifiable.every((entry) => entry.reason.startsWith('missing:')), true);
});

test('C008: an injected runner finding appears in the envelope', () => {
  const directory = tempPackage({ 'Tickets.json': '{"phases":[]}' });
  const finding = { code: 'GATE_FAILED', asset: 'fixture', problem: 'forced', fixes: [], rerun: 'rerun' };

  const report = verifyAmendment({
    cwd: directory,
    ticketKey: 'PX-400',
    report: true,
    runners: { ...CLEAN_TICKET_RUNNERS, 'ticket-closure': () => ({ findings: [finding], unverifiable: [] }) },
  });

  assert.equal(report.findings.length, 1);
  assert.equal(report.findings[0].code, 'GATE_FAILED');
});

test('C008: skips are not findings', () => {
  const directory = tempPackage({ 'Tickets.json': '{"phases":[]}' });

  const report = verifyAmendment({ cwd: directory, ticketKey: 'PX-400', report: true, runners: CLEAN_TICKET_RUNNERS });

  assert.equal(report.findings.length, 0);
  assert.ok(report.skipped.length >= 1);
  assert.equal(report.skipped.some((entry) => entry.reason === 'absent'), true);
});
