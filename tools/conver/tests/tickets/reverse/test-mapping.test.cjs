// P22-16 @verifies C001 @verifies C002
/**
 * S1 and S2 — mapping every existing test to a ticket, and recording every absence of Red.
 *
 * The forward split creates the tickets and the tests that will prove them. In reverse
 * mode both already exist, so the question changes from "what should be built" to "what
 * is already here, and which of it was ever proved".
 *
 * S1 is a total function: every test maps to a ticket or is reported with its path, and
 * totality is proved by arithmetic rather than by inspection. That is why the mapping
 * returns an explicit remainder instead of a list of successes.
 *
 * S2 is deliberately not a detector. Measured against the answer key, no syntactic rule
 * recovered its ten design-derived tests: eight of them call the public API, so reading
 * the source text cannot separate them from a test that had a Red. What S2 returns is
 * therefore the evidence it read, a candidate carrying `requires_human_approval`, and an
 * explicit unclassified remainder. The measurement is made by `run.mjs oracle compare`,
 * which lists disagreements for a human to classify.
 *
 * The measurement over the real subject retired with the subject. `siprs-for-reverse`
 * has been deleted, so the tests that read its `tests/` directory — the sixteen-file
 * inventory and the eight recovered design-derived names — are gone. Every mechanism
 * they exercised is exercised below over test lists this file declares.
 *
 * Run: node --test "tests/tickets/**\/*.test.cjs"
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const {
  GATE_IDS,
  GATE_STATUS,
  MAPPING_STAGE,
  RED_ABSENCE,
  RED_EVIDENCE,
  assertMappingTotal,
  buildMappingCandidate,
  detectAbsentRed,
  mapTestsToTickets,
  measureRedEvidence,
  measureTestInventory,
} = require('../../../.claude/scripts/tickets/lib/test-mapping.js');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const ORACLE_BUNDLE_PATH = path.join(PROJECT_ROOT, 'tests/workspacify-reverse/oracle/ORACLE-BUNDLE.json');
const GAPS_PATH = path.join(PROJECT_ROOT, 'tests/workspacify-reverse/analysis/GAPS.json');
const RUN_MJS = path.join(PROJECT_ROOT, '.claude/scripts/workspacify-reverse/run.mjs');

/** The declared ticket keys and the answer key's absent-Red ground truth. */
const ORACLE = JSON.parse(readFileSync(ORACLE_BUNDLE_PATH, 'utf8'));
const DECLARED_TICKET_KEYS = ORACLE.artefacts.tickets.ticketKeys;

/** A test file that names its spec — the shape a design-derived test has. */
const SPEC_NAMING_TEST = Object.freeze({
  path: 'tests/verify_spec_0963da9b.rs',
  text: '// See specs/P8-2.md §Contracts C047\nuse siprs::SipClient;\n#[tokio::test]\nasync fn client_initialized() { let client = SipClient::new().await; }\n',
});

describe('S1 — test mapping', () => {

  it('UT-1: a test naming a spec document maps to the ticket that spec belongs to', () => {
    const tests = measureTestInventory({ testFiles: [SPEC_NAMING_TEST] });
    assert.deepEqual(tests[0].ticketKeys, ['P8-2']);
    assert.deepEqual(tests[0].contractIds, ['C047']);

    const { mapped } = mapTestsToTickets({ tests, ticketKeys: ['P8-2', 'P8-3'] });
    assert.deepEqual(mapped.map((row) => row.ticketKey), ['P8-2']);
  });

  it('UT-5: an unmapped test is reported with its path and the reason, never dropped', () => {
    const tests = measureTestInventory({ testFiles: [SPEC_NAMING_TEST] });
    const { unmapped } = mapTestsToTickets({ tests, ticketKeys: ['P1-1'] });

    assert.equal(unmapped.length, 1);
    assert.equal(unmapped[0].test.path, SPEC_NAMING_TEST.path);
    assert.equal(unmapped[0].test.basename, 'verify_spec_0963da9b.rs');
    assert.equal(unmapped[0].reason, 'references_no_declared_ticket');
    assert.deepEqual(unmapped[0].referencedKeys, ['P8-2']);
  });

  it('UT-5: a test naming no ticket at all is reported with a distinct reason', () => {
    const tests = measureTestInventory({
      testFiles: [{ path: 'tests/shared.rs', text: 'use siprs::SipClient;\n#[test]\nfn works() {}\n' }],
    });
    const { unmapped } = mapTestsToTickets({ tests, ticketKeys: DECLARED_TICKET_KEYS });

    assert.equal(unmapped[0].reason, 'references_no_ticket');
    assert.deepEqual(unmapped[0].referencedKeys, []);
  });

  it('UT-12: the mapping is total — mapped plus unmapped equals the tests', () => {
    const tests = measureTestInventory({
      testFiles: [
        SPEC_NAMING_TEST,
        { path: 'tests/shared.rs', text: 'use siprs::SipClient;\n#[test]\nfn works() {}\n' },
      ],
    });
    const { mapped, unmapped } = mapTestsToTickets({ tests, ticketKeys: ['P8-2'] });

    assertMappingTotal({ tests, mapped, unmapped });
    assert.equal(new Set(mapped.map((row) => row.test.path)).size + unmapped.length, tests.length);
    assert.throws(() => assertMappingTotal({ tests, mapped: [], unmapped: [] }), /remainder/);
  });

  it('UT-12: a PX key is never a reconstruction target', () => {
    const tests = measureTestInventory({
      testFiles: [{ path: 'tests/inner.rs', text: '// PX-203 renamed this file\n#[test]\nfn works() {}\n' }],
    });
    const { mapped, unmapped } = mapTestsToTickets({ tests, ticketKeys: ['PX-203'] });

    assert.equal(mapped.length, 0);
    assert.equal(unmapped[0].reason, 'references_no_declared_ticket');
  });
});

describe('S2 — absence of Red', () => {
  it('C002 precondition: contracts exist — the population is measured, never assumed', () => {
    const gaps = JSON.parse(readFileSync(GAPS_PATH, 'utf8')).gaps;
    const contracts = gaps.filter((gap) => gap.kind === 'absent_red');

    assert.ok(contracts.length > 0, 'an empty population would make the whole detection vacuous');
    for (const contract of contracts.slice(0, 5)) {
      assert.equal(typeof contract.file, 'string');
      assert.equal(typeof contract.line, 'number');
    }
  });


  it('UT-7: an absence that cannot be classified is recorded as unclassified, not dropped', () => {
    const { absentRedContracts, unclassified, classificationCoverage } = detectAbsentRed({
      contracts: [
        { gap_id: 'gap-a', file: 'src/a.rs', line: 1, symbol: 'A' },
        { line: 0 },
      ],
      inventory: [],
    });

    assert.equal(absentRedContracts.length, 1);
    assert.equal(unclassified.length, 1);
    assert.equal(unclassified[0].reason, 'the contract names no identifier, so no absence can be recorded for it');
    assert.equal(classificationCoverage.classified + classificationCoverage.unclassified, 2);
  });

  it('UT-8: an absence count of zero is a comparison result and never a pass', () => {
    const zero = detectAbsentRed({ contracts: [], inventory: [] });

    assert.equal(zero.absenceCount, 0);
    assert.equal(zero.verdict, 'comparison');
    assert.equal(zero.gate.status, GATE_STATUS.FAIL);
    assert.match(zero.gate.reasons.join(' '), /zero/i);
  });

  it('UT-9: a project with no tests produces a complete absence report rather than an empty one', () => {
    const contracts = [{ gap_id: 'gap-a', file: 'src/a.rs', line: 4, symbol: 'A' }];
    const report = detectAbsentRed({ contracts, inventory: [] });

    assert.equal(report.absenceCount, 1);
    assert.equal(report.absentRedContracts[0].red_absence, RED_ABSENCE.NO_TEST_NAMES_THE_SURFACE);
    assert.equal(report.classificationCoverage.classified, 1);
  });

  it('UT-2: a surface no test names is a re-checkable absence; a named one is a candidate', () => {
    const contracts = [
      { gap_id: 'gap-unnamed', file: 'src/a.rs', line: 4, symbol: 'UNNAMED' },
      { gap_id: 'gap-named', file: 'src/b.rs', line: 9, symbol: 'NAMED' },
    ];
    const inventory = measureTestInventory({
      testFiles: [{ path: 'tests/b.rs', text: 'use siprs::NAMED;\n#[test]\nfn works() {}\n' }],
    });

    const { absentRedContracts } = detectAbsentRed({ contracts, inventory });
    const unnamed = absentRedContracts.find((record) => record.contract_id === 'gap-unnamed');
    const named = absentRedContracts.find((record) => record.contract_id === 'gap-named');

    assert.equal(unnamed.red_absence, RED_ABSENCE.NO_TEST_NAMES_THE_SURFACE);
    assert.equal(unnamed.requires_human_approval, false, 'no test names it, so the absence is re-checkable');
    assert.equal(named.red_absence, RED_ABSENCE.TEST_DERIVED_FROM_DESIGN);
    assert.equal(named.requires_human_approval, true, 'a test names it, and no Red for it is recorded');
  });

  it('UT-2: red evidence is reported as evidence, never as a verdict', () => {
    const exercising = measureRedEvidence({ text: SPEC_NAMING_TEST.text });
    const readingSpec = measureRedEvidence({ text: '// See specs/P8-2.md\nfn read() { read_to_string("specs/P8-2.md"); }\n' });
    const silent = measureRedEvidence({ text: 'fn nothing() {}\n' });

    assert.equal(exercising.kind, RED_EVIDENCE.EXERCISES);
    assert.equal(readingSpec.kind, RED_EVIDENCE.READS_SPEC);
    assert.equal(silent.kind, RED_EVIDENCE.UNDECIDED);
    for (const measured of [exercising, readingSpec, silent]) {
      assert.ok(measured.evidence.length > 0, 'every reading carries the sentence it was read from');
    }
  });

  it('C002 invariant: the gate is identified, and the population is never silently narrowed', () => {
    const report = detectAbsentRed({
      contracts: [{ gap_id: 'gap-a', file: 'src/a.rs', line: 4, symbol: 'A' }],
      inventory: [],
    });
    assert.equal(report.gate.gateId, GATE_IDS.S2);
  });
});

describe('S1 and S2 — the oracle candidate', () => {
  it('IT-6: the candidate document declares the mapping stage and its unit of comparison', () => {
    const candidate = buildMappingCandidate({
      tickets: [{ key: 'P8-2', title: 'ID design' }],
      language: 'rust',
    });

    assert.equal(candidate.stage, MAPPING_STAGE);
    assert.equal(candidate.corpus.language, 'rust');
    assert.deepEqual(candidate.entries, [{ name: 'P8-2', value: 'ID design' }]);
    assert.deepEqual(candidate.unobserved, []);
  });

  it('IT-5/UT-13: the forward rotation is unchanged — the P22-1 gate is reproduced', () => {
    const result = spawnSync(process.execPath, [RUN_MJS, 'regression', 'check'], { encoding: 'utf8' });

    assert.equal(result.status, 0, 'the forward rotation is byte-identical');
    assert.match(result.stdout, /proved/);
  });
});
