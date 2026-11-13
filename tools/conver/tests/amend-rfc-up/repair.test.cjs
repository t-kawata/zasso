'use strict';

/**
 * /amend-rfc-up repair loop: deterministic worklist and progress measurement.
 *
 * A design finding is loop input, never a terminal state. The classifier names
 * the artifact writer that owns the repair; progress decides whether the loop
 * advanced, stalled, or introduced a new defect.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const {
  REPAIR_SCHEMA,
  buildWorklist,
  classifyFinding,
  compareWorklists,
  findingKey,
} = require('../../.claude/scripts/amend-rfc-up/repair.js');

function drillReport(findings) {
  return {
    ok: findings.length === 0,
    findings: [],
    report: {
      package: '/pkg',
      p1: { findings },
      p2: { findings: [] },
      summary: { blocking: findings.filter((entry) => entry.severity === 'blocking').length },
    },
  };
}

test('a Dirs-Tree mapping gap is owned by boundify, then escalates to graphify', () => {
  const route = classifyFinding({
    severity: 'blocking',
    code: 'DRILL_FINDING',
    layer: 'drill',
    artifact: '/pkg/RFC.md',
    cause: 'graph node N0001 "RFC: pkg" is not mapped to any Dirs-Tree file',
    route: 'in-drill',
  });
  assert.equal(route.repairClass, 'dirs-tree');
  assert.equal(route.owner, 'boundify');
  assert.deepEqual(route.escalation, ['boundify', 'graphify', 'design-amendment']);
});

test('an uncovered RFC heading is owned by graphify', () => {
  const route = classifyFinding({
    severity: 'blocking',
    code: 'DRILL_FINDING',
    artifact: '/pkg/RFC.md',
    cause: 'RFC heading "2. Design" is not covered by any graph node',
  });
  assert.equal(route.repairClass, 'graph');
  assert.equal(route.owner, 'graphify');
});

test('an undeclared source file is owned by boundify', () => {
  const route = classifyFinding({
    severity: 'blocking',
    code: 'DRILL_FINDING',
    artifact: '/pkg/src/lib.rs',
    cause: 'src file src/lib.rs is not declared in the Dirs-Tree',
  });
  assert.equal(route.repairClass, 'dirs-tree');
  assert.equal(route.owner, 'boundify');
});

test('a ticket finding is owned by split', () => {
  const route = classifyFinding({
    severity: 'blocking',
    code: 'TICKET_CONTRACT_MISSING',
    artifact: '/pkg/Tickets.json',
    cause: 'ticket P0-1 has no contract',
  });
  assert.equal(route.repairClass, 'tickets');
  assert.equal(route.owner, 'split');
});

test('a law finding is owned by the law skill', () => {
  const route = classifyFinding({
    severity: 'blocking',
    code: 'LAW_GATE_FAILED',
    layer: 'law',
    artifact: '/pkg/src/lib.rs',
    cause: 'rule REST-01 is not attested',
  });
  assert.equal(route.repairClass, 'law');
  assert.equal(route.owner, 'law');
});

test('an RFC claim finding is owned by the design amendment writer', () => {
  const route = classifyFinding({
    severity: 'blocking',
    code: 'CLAIM_INVALID',
    artifact: '/pkg/RFC.md',
    cause: 'claim target is absent',
  });
  assert.equal(route.repairClass, 'rfc');
  assert.equal(route.owner, 'design-amendment');
});

test('an unclassified finding falls back to the only RFC writer', () => {
  const route = classifyFinding({ severity: 'blocking', code: 'UNKNOWN', artifact: '/pkg/X', cause: 'unknown cause' });
  assert.equal(route.repairClass, 'rfc');
  assert.equal(route.owner, 'design-amendment');
});

test('the worklist is deterministic, keyed, sorted, and carries counts', () => {
  const report = drillReport([
    { severity: 'blocking', code: 'DRILL_FINDING', artifact: '/pkg/RFC.md', cause: 'graph node N0002 "B" is not mapped to any Dirs-Tree file' },
    { severity: 'blocking', code: 'DRILL_FINDING', artifact: '/pkg/RFC.md', cause: 'graph node N0001 "A" is not mapped to any Dirs-Tree file' },
    { severity: 'advisory', code: 'UNPARSED_SURFACE', artifact: '/pkg/RFC.md', cause: 'parser could not read one surface' },
  ]);
  const first = buildWorklist({ packageDir: '/pkg', report, source: 'cross-1.json' });
  const second = buildWorklist({ packageDir: '/pkg', report, source: 'cross-1.json' });

  assert.equal(first.schema, REPAIR_SCHEMA);
  assert.deepEqual(first, second);
  assert.deepEqual(first.findings.map((entry) => entry.key), [...first.findings.map((entry) => entry.key)].sort());
  assert.equal(first.counts.total, 3);
  assert.equal(first.counts.blocking, 2);
  assert.equal(first.counts.advisory, 1);
  assert.equal(first.digest, createHash('sha256').update(first.findings.map((entry) => entry.key).sort().join('\n')).digest('hex'));
  assert.equal(first.findings.every((entry) => entry.owner.length > 0 && entry.action.length > 0), true);
});

test('keys ignore the transient report wrapper but keep the finding identity', () => {
  const finding = { severity: 'blocking', code: 'DRILL_FINDING', artifact: '/pkg/RFC.md', cause: 'same cause' };
  assert.equal(findingKey(finding), findingKey({ ...finding, action: 'different action text' }));
});

test('progress reports clean, progressing, stalled and regressed', () => {
  const worklist = (causes) => buildWorklist({
    packageDir: '/pkg',
    report: drillReport(causes.map((cause) => ({ severity: 'blocking', code: 'DRILL_FINDING', artifact: '/pkg/RFC.md', cause }))),
  });
  const a = worklist(['a']);
  const ab = worklist(['a', 'b']);
  const b = worklist(['b']);
  const ac = worklist(['a', 'c']);

  assert.equal(compareWorklists({ previous: a, current: worklist([]) }).status, 'clean');
  assert.equal(compareWorklists({ previous: ab, current: b }).status, 'progressing');
  assert.equal(compareWorklists({ previous: ab, current: ab }).status, 'stalled');
  assert.equal(compareWorklists({ previous: a, current: ac }).status, 'regressed');
  assert.deepEqual(compareWorklists({ previous: a, current: ac }).introduced, [
    findingKey({ code: 'DRILL_FINDING', artifact: '/pkg/RFC.md', cause: 'c' }),
  ]);
});

test('a verification failure without a report is a blocking finding', () => {
  const worklist = buildWorklist({
    packageDir: '/pkg',
    report: { code: 'VERIFY_AMENDMENT_FAILED', message: 'verify-amendment exited 1' },
  });
  assert.equal(worklist.counts.blocking, 1);
  assert.equal(worklist.findings[0].code, 'VERIFY_AMENDMENT_FAILED');
  assert.equal(worklist.findings[0].owner, 'design-amendment');
});

test('the plan and progress CLI write the worklist files', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'amend-repair-'));
  try {
    const reportPath = path.join(directory, 'cross.json');
    const firstPath = path.join(directory, 'repair-1.json');
    const secondPath = path.join(directory, 'repair-2.json');
    const progressPath = path.join(directory, 'progress.json');
    fs.writeFileSync(reportPath, JSON.stringify(drillReport([
      { severity: 'blocking', code: 'DRILL_FINDING', artifact: '/pkg/RFC.md', cause: 'graph node N0002 "B" is not mapped to any Dirs-Tree file' },
    ])) + '\n');
    fs.writeFileSync(secondPath, JSON.stringify(buildWorklist({ packageDir: '/pkg', report: drillReport([]) })) + '\n');

    const plan = spawnSync(process.execPath, [
      path.resolve(__dirname, '../../.claude/scripts/amend-rfc-up/repair.js'),
      'plan',
      '--package=/pkg',
      `--report=@${reportPath}`,
      `--out=${firstPath}`,
    ], { encoding: 'utf8' });
    assert.equal(plan.status, 0, plan.stderr);
    assert.equal(JSON.parse(fs.readFileSync(firstPath, 'utf8')).counts.blocking, 1);

    const progress = spawnSync(process.execPath, [
      path.resolve(__dirname, '../../.claude/scripts/amend-rfc-up/repair.js'),
      'progress',
      `--previous=@${firstPath}`,
      `--current=@${secondPath}`,
      `--out=${progressPath}`,
    ], { encoding: 'utf8' });
    assert.equal(progress.status, 0, progress.stderr);
    assert.equal(JSON.parse(fs.readFileSync(progressPath, 'utf8')).status, 'clean');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
