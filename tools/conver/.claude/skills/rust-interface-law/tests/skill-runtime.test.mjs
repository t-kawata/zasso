import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProfile, loadWorkspaceMap, matchUnits } from '../scripts/lib/units.mjs';
import { loadOkf, buildManifest } from '../scripts/lib/closure.mjs';
import { deliverContext } from '../scripts/lib/context.mjs';
import { runGate, gateStatus } from '../scripts/lib/gate.mjs';
import { buildAttestation, checkAttestation } from '../scripts/lib/attest.mjs';
import { checkExceptions } from '../scripts/lib/exception.mjs';
import { runScan } from '../scripts/lib/scan.mjs';
import { shouldRun, detectUnledgered } from '../scripts/lib/should-run.mjs';
import { checkTrust } from '../scripts/lib/trust.mjs';
import { buildDist, install } from '../scripts/lib/dist.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const fixtures = join(here, 'fixtures');
const profile = loadProfile(join(fixtures, 'project/RULES-PROFILE.toml'));
const map = loadWorkspaceMap(join(fixtures, 'project/contract/workspace-map.toml'));
const nodes = loadOkf(join(fixtures, 'okf'));

// @verifies C001
test('C001 unit set selects the union closure', () => {
  const matched = matchUnits(['crates/app-rest/src/handler.rs'], map);
  assert.deepEqual(matched.units.map((unit) => unit.id), ['app-rest']);
  assert.equal(matched.unmapped.length, 0);

  const manifest = buildManifest({ profile, units: matched.units, nodes });
  assert.deepEqual(manifest.phases, ['contract', 'operation', 'adapter', 'conformance']);

  const must = manifest.nodes.filter((node) => node.delivery === 'must').map((node) => node.id);
  assert.ok(must.includes('adapter/rest'));
  assert.ok(!must.includes('adapter/mcp'));
  assert.ok(manifest.omitted.some((item) => item.id === 'adapter/mcp'));
  assert.ok(manifest.nodes.every((node) => node.reason.length > 0));
  assert.match(manifest.closure_sha256, /^[0-9a-f]{64}$/);
});

// @verifies C001
test('C001 unmapped path fails closed', () => {
  const matched = matchUnits(['unknown/path.rs'], map);
  assert.equal(matched.units.length, 0);
  assert.deepEqual(matched.unmapped, ['unknown/path.rs']);
});

// @verifies C002
test('C002 phase union equals closure and replay is stable', () => {
  const manifest = buildManifest({ profile, units: matchUnits(['crates/app-rest/src/x.rs'], map).units, nodes });
  const temporary = mkdtempSync(join(tmpdir(), 'law-context-'));
  try {
    const ledgerPath = join(temporary, 'ledger.json');
    const delivered = [];
    for (const phase of manifest.phases) {
      const result = deliverContext({ manifest, phase, okfDir: join(fixtures, 'okf'), ledgerPath });
      delivered.push(...result.nodes.map((node) => node.id));
    }
    const closure = manifest.nodes.filter((node) => node.delivery === 'must').map((node) => node.id).sort();
    assert.deepEqual([...new Set(delivered)].sort(), closure);

    const replayA = deliverContext({ manifest, phase: 'adapter', okfDir: join(fixtures, 'okf'), ledgerPath, replay: true });
    const replayB = deliverContext({ manifest, phase: 'adapter', okfDir: join(fixtures, 'okf'), ledgerPath, replay: true });
    assert.equal(replayA.hash, replayB.hash);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

// @verifies C002
test('C002 phase before predecessor fails', () => {
  const manifest = buildManifest({ profile, units: matchUnits(['crates/app-rest/src/x.rs'], map).units, nodes });
  const temporary = mkdtempSync(join(tmpdir(), 'law-context-'));
  try {
    assert.throws(
      () => deliverContext({ manifest, phase: 'adapter', okfDir: join(fixtures, 'okf'), ledgerPath: join(temporary, 'ledger.json') }),
      /predecessor/,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

// @verifies C003
test('C003 gate statuses, zero test, and missing scan', () => {
  const manifest = {
    nodes: [
      { id: 'R-OK', delivery: 'must', verify: [{ level: 'V3', cmd: [process.execPath, join(fixtures, 'gate/ok.mjs')], expected_cases: 2 }] },
      { id: 'R-ZERO', delivery: 'must', verify: [{ level: 'V3', cmd: [process.execPath, join(fixtures, 'gate/zero.mjs')], expected_cases: 1 }] },
      { id: 'R-MISS', delivery: 'must', verify: [{ level: 'V2', scan: 'scan/missing' }] },
      { id: 'R-V4', delivery: 'must', verify: [{ level: 'V4', review: true }], review: { approval_ref: 'PR#1', reviewer: 'r', scope: 'adapter', verdict: 'pass' } },
    ],
  };
  const report = runGate({ manifest, scans: {}, cwd: root });
  assert.equal(gateStatus(report, 'R-OK'), 'machine_verified');
  assert.equal(gateStatus(report, 'R-ZERO'), 'not_run');
  assert.equal(gateStatus(report, 'R-MISS'), 'unverifiable');
  assert.equal(gateStatus(report, 'R-V4'), 'human_attested');
  assert.equal(report.machinePass, false);
  assert.equal(report.ok, false);
});

// @verifies C004
test('C004 attestation prefill and strict diff', () => {
  const manifest = {
    phases: ['adapter'],
    nodes: [
      { id: 'R-1', delivery: 'must', phase: 'adapter' },
      { id: 'R-2', delivery: 'must', phase: 'adapter' },
    ],
  };
  const template = buildAttestation(manifest, 'adapter');
  assert.equal(template.rows.length, 2);
  assert.ok(template.rows.every((row) => row.status === 'unset'));

  assert.throws(() => checkAttestation(manifest, 'adapter', template.rows.slice(1)), /missing/);
  assert.throws(
    () => checkAttestation(manifest, 'adapter', [...template.rows, { rule: 'EXTRA', status: 'applied', evidence: 'x' }]),
    /extra/,
  );
  assert.throws(() => checkAttestation(manifest, 'adapter', template.rows), /unset/);

  const applied = template.rows.map((row) => ({ ...row, status: 'applied', evidence: 'x' }));
  assert.doesNotThrow(() => checkAttestation(manifest, 'adapter', applied));

  const human = template.rows.map((row) => ({ ...row, status: 'human_attested' }));
  assert.throws(() => checkAttestation(manifest, 'adapter', human), /approval_ref/);
});

// @verifies C005
test('C005 project law scans detect stub, weakening, language, secret', () => {
  assert.equal(runScan('scan/stubs', { text: '// [::STUB::] x' }).findings.length, 1);
  assert.equal(runScan('scan/test-weakening', { before: 'assert!(x);', after: '' }).findings.length, 1);
  assert.equal(runScan('scan/english', { text: '日本語' }).findings.length, 1);
  assert.equal(runScan('scan/secrets', { text: 'password=hunter2' }).findings.length, 1);
  assert.throws(() => runScan('scan/missing', {}), /unknown scan/);
});

// @verifies C004
test('C005 exception scope, expiry, and approval', () => {
  const exceptions = [{ rule: 'SEC-01', scope: 'rest', expires: '2099-01-01', approval_ref: 'PR#1', approved_by: 'r' }];
  assert.doesNotThrow(() => checkExceptions(exceptions, { now: '2026-11-11', rules: new Set(['SEC-01']) }));
  assert.throws(
    () => checkExceptions([{ ...exceptions[0], expires: '2000-01-01' }], { now: '2026-11-11', rules: new Set(['SEC-01']) }),
    /expired/,
  );
  assert.throws(
    () => checkExceptions([{ ...exceptions[0], approval_ref: '' }], { now: '2026-11-11', rules: new Set(['SEC-01']) }),
    /approval_ref/,
  );
});

// @verifies C006
test('C006 tampered file fails trust', () => {
  assert.equal(checkTrust({ pinned: { 'gate.mjs': 'a'.repeat(64) }, actual: { 'gate.mjs': 'b'.repeat(64) } }).ok, false);
  assert.equal(checkTrust({ pinned: { 'gate.mjs': 'a'.repeat(64) }, actual: { 'gate.mjs': 'a'.repeat(64) } }).ok, true);
  assert.equal(checkTrust({ pinned: { 'gate.mjs': 'a'.repeat(64) }, actual: { 'gate.mjs': 'b'.repeat(64) } }).code, 90);
});

// @verifies C007
test('C007 docs-only exits 0 and Bash edit is detected', () => {
  assert.equal(shouldRun({ paths: ['docs/README.md'], profile, map }).run, false);
  assert.equal(shouldRun({ paths: ['crates/app-rest/src/x.rs'], profile, map }).run, true);
  assert.equal(detectUnledgered({ ledger: [], changed: ['crates/app-rest/src/x.rs'], map }).length, 1);
});

// @verifies C008
test('C008 dist is deterministic and install copies only', async () => {
  const first = await buildDist({ root });
  const second = await buildDist({ root });
  assert.equal(first.sha256, second.sha256);
  assert.equal(install({ root, mode: 'copy' }).built, false);
  assert.throws(() => install({ root, mode: 'build' }), /build/);
});
