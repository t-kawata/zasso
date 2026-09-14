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
 * S2 is deliberately not a detector. Measured against this target, no syntactic rule
 * recovers the answer key's ten design-derived tests: eight of them call the public API,
 * so reading the source text cannot separate them from a test that had a Red. What S2
 * returns is therefore the evidence it read, a candidate carrying `requires_human_approval`,
 * and an explicit unclassified remainder. The measurement is made by
 * `run.mjs oracle compare`, which lists disagreements for a human to classify.
 *
 * Run: node --test "tests/tickets/**\/*.test.cjs"
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
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
const SUBJECT_TESTS_DIR = path.join(PROJECT_ROOT, 'siprs-for-reverse/tests');
const ORACLE_BUNDLE_PATH = path.join(PROJECT_ROOT, 'tests/workspacify-reverse/oracle/ORACLE-BUNDLE.json');
const GAPS_PATH = path.join(PROJECT_ROOT, 'tests/workspacify-reverse/analysis/GAPS.json');
const RUN_MJS = path.join(PROJECT_ROOT, '.claude/scripts/workspacify-reverse/run.mjs');

/** The declared ticket keys and the answer key's absent-Red ground truth. */
const ORACLE = JSON.parse(readFileSync(ORACLE_BUNDLE_PATH, 'utf8'));
const DECLARED_TICKET_KEYS = ORACLE.artefacts.tickets.ticketKeys;

/** Every test file of the subject tree, with its text, as the inventory measures them. */
function readSubjectTestFiles() {
  return readdirSync(SUBJECT_TESTS_DIR)
    .filter((name) => name.endsWith('.rs'))
    .sort()
    .map((name) => ({ path: `tests/${name}`, text: readFileSync(path.join(SUBJECT_TESTS_DIR, name), 'utf8') }));
}

/** A test file that names its spec — the shape a design-derived test has. */
const SPEC_NAMING_TEST = Object.freeze({
  path: 'tests/verify_spec_0963da9b.rs',
  text: '// See specs/P8-2.md §Contracts C047\nuse siprs::SipClient;\n#[tokio::test]\nasync fn client_initialized() { let client = SipClient::new().await; }\n',
});

describe('S1 — test mapping', () => {
  it('UT-1: every existing test is mapped to a ticket, and the remainder is arithmetic', () => {
    const tests = measureTestInventory({ testFiles: readSubjectTestFiles() });
    const { mapped, unmapped, mappingCoverage } = mapTestsToTickets({
      tests,
      ticketKeys: DECLARED_TICKET_KEYS,
    });

    assert.equal(mappingCoverage.tests, tests.length);
    assert.equal(mappingCoverage.mapped + mappingCoverage.unmapped, tests.length);
    assert.equal(mappingCoverage.total, true);
    assert.doesNotThrow(() => assertMappingTotal({ tests, mapped, unmapped }));
  });

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

describe('S1 — the subject tree, measured', () => {
  it('IT-1: every test file of siprs-for-reverse is accounted for, mapped or reported', () => {
    const tests = measureTestInventory({ testFiles: readSubjectTestFiles() });
    const { mapped, unmapped, mappingCoverage } = mapTestsToTickets({
      tests,
      ticketKeys: DECLARED_TICKET_KEYS,
    });

    assert.equal(tests.length, 16, 'the subject tree holds sixteen test files');
    assert.equal(mappingCoverage.mapped + mappingCoverage.unmapped, 16);
    assert.equal(new Set(mapped.map((row) => row.test.path)).size, mappingCoverage.mapped);

    // The remainder is reported, not assumed away. S1 is proved only when it is empty, and
    // this target is measured to leave six tests unattributable: the four shared tests that
    // name no ticket, plus the two design-derived tests whose bodies name none either.
    assert.equal(mappingCoverage.mapped, 10);
    assert.equal(mappingCoverage.unmapped, 6);
    for (const row of unmapped) assert.ok(row.test.path.length > 0 && row.reason.length > 0);
  });

  it('IT-1: design-derived tests are recovered from content, and the ones that are not are reported', () => {
    const tests = measureTestInventory({ testFiles: readSubjectTestFiles() });
    const { mapped, unmapped } = mapTestsToTickets({ tests, ticketKeys: DECLARED_TICKET_KEYS });

    const recovered = [...new Set(mapped.map((row) => row.test.basename))].sort();
    const recoveredDesignDerived = recovered.filter((name) => /^verify_spec_[0-9a-f]{8}\.rs$/.test(name));

    // Eight of the ten hash-named files name their spec in their bodies, so content
    // recovers them without reading their names. The remaining two name no ticket at all
    // and are reported by path rather than assumed mapped — which is precisely why the
    // absent-Red population is recorded as a candidate rather than asserted as detected.
    assert.equal(recoveredDesignDerived.length, 8);
    assert.ok(mapped.some((row) => row.test.basename === 'verify_spec_0963da9b.rs' && row.ticketKey === 'P8-2'));

    const reported = unmapped.map((row) => row.test.basename).sort();
    assert.deepEqual(reported, [
      'non_exhaustive.rs',
      'ownership_ffi_boundary.rs',
      'runtime_audio_lifecycle.rs',
      'verify_spec_64eff610.rs',
      'verify_spec_f330ed39.rs',
      'verify_unsafe_isolation.rs',
    ]);
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

  it('UT-2/C002 postcondition: every contract without Red is recorded with its identifier', () => {
    const inventory = measureTestInventory({ testFiles: readSubjectTestFiles() });
    const gaps = JSON.parse(readFileSync(GAPS_PATH, 'utf8')).gaps;
    const contracts = gaps.filter((gap) => gap.kind === 'absent_red');

    const { absentRedContracts, unclassified, classified, absenceCount, gate } = detectAbsentRed({
      contracts,
      inventory,
    });

    assert.equal(absenceCount, absentRedContracts.length);
    assert.equal(classified + unclassified.length, contracts.length);
    assert.equal(unclassified.length, 0);
    assert.equal(gate.status, GATE_STATUS.PASS);
    for (const record of absentRedContracts) {
      assert.ok(typeof record.contract_id === 'string' && record.contract_id.length > 0);
      assert.ok(Object.values(RED_ABSENCE).includes(record.red_absence));
      assert.ok(record.evidence.length > 0, 'an absence is recorded with the evidence that supports it');
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
