// P22-16 @verifies C003
/**
 * S3 through S6 — the reconstruction ticket, and the guard that keeps it honest.
 *
 * A reconstruction ticket exists to turn an unproven green into a reconstructible one.
 * Its value is not the work it schedules but the uncertainty it preserves: the
 * `counterexample_plan_id` names what the ticket will confirm or refute, and without it
 * the reconstruction decays into ordinary test-writing (ABOUT-REVERSE §6.14.6, §3.5).
 *
 * That is why the plan identifier is enforced in one place — `assertPlanIdPresent` — and
 * why a ticket is assembled through `generateReconstructionTicket` rather than by
 * literal. A caller cannot forget the guard because there is no path around it.
 *
 * S3 exists for a second reason: the implementation loop runs one ticket per session and
 * no context carries across sessions, so a ticket whose `default_files` is empty is not
 * an inconvenience but a ticket no session can execute.
 *
 * Run: node --test "tests/tickets/**\/*.test.cjs"
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const {
  GATE_IDS,
  GATE_STATUS,
  ORIGIN_KINDS,
  RECONSTRUCTION_STATUS,
  ReconstructionTicketRefused,
  assertPlanIdPresent,
  buildMappingCandidate,
  drivingReferencesFor,
  generateReconstructionTicket,
  measuredFilesFor,
  detectAbsentRed,
  summarizeMappingGates,
} = require('../../../.claude/scripts/tickets/lib/test-mapping.js');

const { judgeMeasuredFilesGate } = require('../../../.claude/scripts/tickets/lib/reverse-split.js');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const SUBJECT_ROOT = path.join(PROJECT_ROOT, 'siprs-for-reverse');
const ORACLE_BUNDLE_PATH = path.join(PROJECT_ROOT, 'tests/workspacify-reverse/oracle/ORACLE-BUNDLE.json');
const RUN_MJS = path.join(PROJECT_ROOT, '.claude/scripts/workspacify-reverse/run.mjs');
const CLI_PATH = path.join(PROJECT_ROOT, '.claude/scripts/tickets/lib/reverse-split.js');

const ORACLE = JSON.parse(readFileSync(ORACLE_BUNDLE_PATH, 'utf8'));

/** A contract of the shape P22-6's absent-Red population carries. */
const CONTRACT = Object.freeze({
  contract_id: 'gap-tests/verify_spec_0963da9b.rs-absent_red-12',
  file: 'tests/verify_spec_0963da9b.rs',
  line: 12,
  symbol: 'SipClient',
  visibility: 'pub',
});

/** The implementation file measured for that contract, and the plan that names its Red. */
const MEASURED = Object.freeze({
  files: ['src/client.rs'],
  implemented: true,
  reason: 'the implementation file is present in the measured tree',
});
const PLAN_ID = 'cxp-client-negative_test-42';

describe('S3 — the measured implementation', () => {
  it('UT-11/C003 precondition: a ticket with an existing implementation carries measured files', () => {
    const measured = measuredFilesFor({ contract: CONTRACT, root: SUBJECT_ROOT, exists: () => true });

    assert.deepEqual(measured.files, [CONTRACT.file]);
    assert.equal(measured.implemented, true);

    const ticket = generateReconstructionTicket({
      contract: CONTRACT,
      counterexamplePlanId: PLAN_ID,
      measuredFiles: measured,
    });
    assert.deepEqual(ticket.default_files, [CONTRACT.file]);
    assert.equal(ticket.measured_implementation, true);
  });

  it('UT-11/S3: a ticket whose implementation exists but carries no file fails the gate', () => {
    const gate = judgeMeasuredFilesGate([
      { contract_id: 'gap-a', measured_implementation: true, default_files: [] },
    ]);

    assert.equal(gate.status, GATE_STATUS.FAIL, '§6.14.6 S3 fails exactly here');
    assert.match(gate.reasons.join(' '), /gap-a/);
  });

  it('UT-10/S3: a ticket with no implementation is not failed for carrying no file', () => {
    const gate = judgeMeasuredFilesGate([
      { contract_id: 'gap-b', measured_implementation: false, default_files: [] },
    ]);

    assert.equal(gate.status, GATE_STATUS.PASS);
    assert.equal(gate.counts.implemented, 0);
  });

  it('UT-10: a ticket with no implementation is marked as having no measured files, not omitted', () => {
    const measured = measuredFilesFor({ contract: CONTRACT, root: SUBJECT_ROOT, exists: () => false });

    assert.deepEqual(measured.files, []);
    assert.equal(measured.implemented, false);
    assert.match(measured.reason, /no implementation file was measured/);

    const ticket = generateReconstructionTicket({
      contract: CONTRACT,
      counterexamplePlanId: PLAN_ID,
      measuredFiles: measured,
    });
    assert.deepEqual(ticket.default_files, []);
    assert.equal(ticket.measured_implementation, false);
    assert.ok(ticket.measured_implementation_reason.length > 0);
  });
});

describe('S4 and S5 — one ticket per absence, each carrying its plan', () => {
  it('UT-3/C003 postcondition: exactly one reconstruction ticket per absent-Red contract', () => {
    const contracts = [
      { gap_id: 'gap-a', file: 'src/a.rs', line: 4, symbol: 'UNNAMED_A' },
      { gap_id: 'gap-b', file: 'src/b.rs', line: 9, symbol: 'UNNAMED_B' },
    ];
    const { absentRedContracts } = detectAbsentRed({ contracts, inventory: [] });

    const tickets = absentRedContracts.map((contract) => generateReconstructionTicket({
      contract,
      counterexamplePlanId: PLAN_ID,
      measuredFiles: { files: [contract.file], implemented: true, reason: 'measured' },
      phaseId: 22,
      id: 1,
    }));

    assert.equal(tickets.length, absentRedContracts.length);
    assert.deepEqual(tickets.map((ticket) => ticket.contract_id), ['gap-a', 'gap-b']);
  });

  it('UT-4: every reconstruction ticket carries a non-empty counterexample_plan_id', () => {
    const ticket = generateReconstructionTicket({
      contract: CONTRACT,
      counterexamplePlanId: PLAN_ID,
      measuredFiles: MEASURED,
    });

    assert.equal(ticket.counterexample_plan_id, PLAN_ID);
    assert.doesNotThrow(() => assertPlanIdPresent(ticket));
  });

  it('UT-6/C003 invariant: a ticket without a plan identifier is refused, never emitted', () => {
    for (const missing of ['', '   ', null, undefined]) {
      assert.throws(
        () => generateReconstructionTicket({
          contract: CONTRACT,
          counterexamplePlanId: missing,
          measuredFiles: MEASURED,
        }),
        (error) => error.name === 'ReconstructionTicketRefused'
          && error.message.includes(CONTRACT.contract_id),
      );
    }
  });

  it('UT-6: the refusal is one guard in one place, reachable without the generator', () => {
    assert.throws(
      () => assertPlanIdPresent({ contract_id: 'gap-a' }),
      (error) => error instanceof ReconstructionTicketRefused,
    );
    assert.equal(
      assertPlanIdPresent({ contract_id: 'gap-a', counterexample_plan_id: PLAN_ID }).counterexample_plan_id,
      PLAN_ID,
    );
  });

  it('UT-4: the plan identifier records how it was associated, so the join is auditable', () => {
    const ticket = generateReconstructionTicket({
      contract: CONTRACT,
      counterexamplePlanId: PLAN_ID,
      counterexamplePlanBasis: 'nearest_carrier_line_in_same_file',
      measuredFiles: MEASURED,
    });

    assert.equal(ticket.counterexample_plan_basis, 'nearest_carrier_line_in_same_file');
    assert.equal(typeof ticket.counterexample_plan_candidate, 'boolean');
  });
});

describe('S6 — driving references', () => {
  it('UT-3/S6: resolved references are attached and unresolved ones are recorded, not dropped', () => {
    const resolved = drivingReferencesFor({
      contract: CONTRACT,
      claimIds: ['clm-client-1'],
      residualIds: ['res-1'],
    });

    assert.deepEqual(resolved.driving_claim_ids, ['clm-client-1']);
    assert.deepEqual(resolved.driving_residual_ids, ['res-1']);
    assert.equal(resolved.origin_kind, 'reverse');
    assert.deepEqual(resolved.unresolved, []);

    const partial = drivingReferencesFor({ contract: CONTRACT, claimIds: null, residualIds: undefined });
    assert.deepEqual(partial.driving_claim_ids, []);
    assert.deepEqual(partial.driving_residual_ids, []);
    assert.equal(partial.unresolved.length, 2, 'an unresolved reference is recorded rather than assumed empty');
  });

  it('UT-3: the origin kind is drawn from the declared vocabulary', () => {
    const ticket = generateReconstructionTicket({
      contract: CONTRACT,
      counterexamplePlanId: PLAN_ID,
      measuredFiles: MEASURED,
      driving: drivingReferencesFor({ contract: CONTRACT, claimIds: ['clm-client-1'], residualIds: [] }),
    });

    assert.ok(ORIGIN_KINDS.includes(ticket.origin_kind));
    assert.equal(ticket.origin_kind, 'reverse');
    assert.equal(ticket.status, RECONSTRUCTION_STATUS);
  });
});

describe('S1 through S6 — the CLI and the oracle', () => {
  it('IT-3: the CLI writes a ticket set in which every ticket carries a plan identifier', () => {
    const outDir = mkdtempSync(path.join(tmpdir(), 'p22-16-cli-'));
    try {
      const result = spawnSync(process.execPath, [
        CLI_PATH,
        `--root=${SUBJECT_ROOT}`,
        `--tickets=${ORACLE_BUNDLE_PATH}`,
        `--out=${outDir}`,
      ], { encoding: 'utf8' });

      assert.equal(result.stderr, '', 'the run completes rather than crashing');
      assert.equal(result.status, 1, 'this target leaves a remainder, so the run reports not proved');

      const written = JSON.parse(readFileSync(path.join(outDir, 'reverse-split-tickets.json'), 'utf8'));
      assert.ok(Array.isArray(written.tickets) && written.tickets.length > 0);
      for (const ticket of written.tickets) {
        assert.doesNotThrow(() => assertPlanIdPresent(ticket));
      }
      assert.equal(written.refused.length, 0, 'no ticket may be refused when every contract has a plan');

      // The non-zero exit is a gate verdict, not a failure to run: S1 cannot be proved on a
      // target whose shared tests name no ticket. The count and the cause are recorded, which
      // is what makes the remainder a finding rather than a silent omission.
      const s1 = written.gates.find((gate) => gate.gateId === 'S1');
      assert.equal(s1.status, 'FAIL');
      assert.equal(s1.counts.unmapped, 6);
      assert.equal(s1.counts.mapped, 10);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('IT-3: the CLI refuses to run without a declared ticket set rather than guessing one', () => {
    const result = spawnSync(process.execPath, [CLI_PATH, `--root=${SUBJECT_ROOT}`], { encoding: 'utf8' });

    assert.equal(result.status, 2, 'a missing declared key set is a usage error, not a silent default');
    assert.match(result.stderr, /--tickets/);
  });

  it('IT-3: a custom test directory is reported relative to the subject tree, not as "tests/"', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'p22-16-testdir-'));
    const outDir = mkdtempSync(path.join(tmpdir(), 'p22-16-testdir-out-'));
    try {
      mkdirSync(path.join(root, 'spec/tests'), { recursive: true });
      writeFileSync(
        path.join(root, 'spec/tests/one.rs'),
        '// P8-2\nuse siprs::SipClient;\n#[test]\nfn works() {}\n',
        'utf8',
      );

      const result = spawnSync(process.execPath, [
        CLI_PATH,
        `--root=${root}`,
        `--test-dir=${path.join(root, 'spec/tests')}`,
        `--tickets=${ORACLE_BUNDLE_PATH}`,
        `--out=${outDir}`,
      ], { encoding: 'utf8' });

      assert.equal(result.stderr, '', 'the run completes');
      assert.match(result.stdout, /`spec\/tests\/one\.rs`/, 'the path is measured, not assumed');
      assert.doesNotMatch(result.stdout, /`tests\/one\.rs`/, 'a hardcoded prefix would lie about where it read');
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('IT-3/S6: every ticket names the claim its plan came from', () => {
    const outDir = mkdtempSync(path.join(tmpdir(), 'p22-16-driving-'));
    try {
      const result = spawnSync(process.execPath, [
        CLI_PATH,
        `--root=${SUBJECT_ROOT}`,
        `--tickets=${ORACLE_BUNDLE_PATH}`,
        `--out=${outDir}`,
      ], { encoding: 'utf8' });

      const written = JSON.parse(readFileSync(path.join(outDir, 'reverse-split-tickets.json'), 'utf8'));
      const withoutClaim = written.tickets.filter((ticket) => ticket.driving_claim_ids.length === 0);

      assert.equal(withoutClaim.length, 0, `S6 resolves a claim for every ticket; ${result.stderr}`);
      assert.ok(written.tickets[0].driving_claim_ids[0].startsWith('clm-'));
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('IT-4: the gates are reported by identifier, and a zero absence is not a pass', () => {
    const summary = summarizeMappingGates({
      gates: [
        { gateId: GATE_IDS.S1, status: GATE_STATUS.PASS, reasons: [], counts: {} },
        { gateId: GATE_IDS.S2, status: GATE_STATUS.FAIL, reasons: ['zero absences recorded'], counts: {} },
      ],
    });

    assert.equal(summary.status, GATE_STATUS.FAIL);
    assert.match(summary.reasons.join(' '), /S2/);
  });

  it('IT-6: the generated ticket set is compared against the answer key, both directions named', () => {
    const outDir = mkdtempSync(path.join(tmpdir(), 'p22-16-oracle-'));
    const candidatePath = path.join(outDir, 'candidate.json');
    try {
      const run = spawnSync(process.execPath, [
        CLI_PATH,
        `--root=${SUBJECT_ROOT}`,
        `--tickets=${ORACLE_BUNDLE_PATH}`,
        `--out=${outDir}`,
        `--candidate=${candidatePath}`,
      ], { encoding: 'utf8' });
      assert.equal(run.stderr, '', 'the run completes rather than crashing');
      assert.ok(run.status === 0 || run.status === 1, 'the exit code is a gate verdict');

      const candidate = JSON.parse(readFileSync(candidatePath, 'utf8'));
      assert.equal(candidate.stage, 'mapping');
      assert.ok(candidate.entries.length > 0);

      const compared = spawnSync(process.execPath, [
        RUN_MJS, 'oracle', 'compare', '--stage', 'mapping', `--candidate=${candidatePath}`,
      ], { encoding: 'utf8' });

      assert.equal(compared.status, 0, compared.stderr || compared.stdout);
      assert.match(compared.stdout, /missing_from_analysis/, 'the answer key names what the analysis did not produce');
      assert.match(compared.stdout, /extra_in_analysis/, 'and what the analysis produced that the key does not hold');
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('IT-6: the answer key holds the 146 tickets and the ten design-derived tests', () => {
    assert.equal(ORACLE.artefacts.tickets.total, 146);
    assert.equal(ORACLE.artefacts.tickets.phases, 21);
    assert.equal(ORACLE.artefacts.tickets.verifySpecTests.length, 10);
    assert.equal(buildMappingCandidate({ tickets: [], language: 'rust' }).entries.length, 0);
  });
});
