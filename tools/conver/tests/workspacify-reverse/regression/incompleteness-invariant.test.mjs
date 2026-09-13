// @verifies C001
// @verifies C002
// @verifies C003
/**
 * incompleteness-invariant — design 1.2 stops being a sentence and becomes a measurement.
 *
 * Design 1.2 states the load-bearing sentence of the whole design: **none of the four
 * patterns may be blocked or aborted on the grounds that the project is an incomplete
 * conver project**. Incompleteness is the input, not a refusal condition. 5.7 records
 * six formulations that violate it — each of which was written down before being
 * removed, which is the evidence that the invariant is one well-intentioned edit away
 * from being broken, silently, against exactly the project that needs the rotation.
 *
 * Nothing read the gate table against the code. This registers two independent reads of
 * the same declarations — what a module *declares* and what its gate surface *uses* — so
 * a gate added without being reachable from the audit, or a declaration that outlived its
 * gate, is a finding rather than a smaller set nobody looks at.
 *
 * The audit observes. It adds no gate, refuses nothing, and its own failure mode is a
 * failing test. The last test in this file asserts that about the module's very shape.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FORBIDDEN_REFUSALS,
  GATE_FAMILIES,
  GATE_OUTCOMES,
  auditAgainstInvariant,
  classifyGateOutcome,
  collectRefusalReasons,
  enumerateReverseGates,
  renderInvariantAudit,
} from '../../../.claude/scripts/workspacify-reverse/lib/invariant-audit.mjs';
import { listArtefacts } from '../../../.claude/scripts/workspacify-reverse/lib/analysis-tech.mjs';
import {
  runReverseGates,
} from '../../../.claude/scripts/workspacify-tree/lib/reverse-mode.mjs';
import {
  runReverseAllocateGates,
} from '../../../.claude/scripts/workspacify-allocate/lib/reverse-mode.mjs';
import { hashTree, createSyntheticTree } from '../helpers/scratch.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const PATTERNS_FIXTURES = join(PROJECT_ROOT, 'tests/workspacify-reverse/fixtures/patterns');
const INVARIANT_AUDIT_MODULE = join(
  PROJECT_ROOT,
  '.claude/scripts/workspacify-reverse/lib/invariant-audit.mjs',
);

/** The four representatives P23-11 established, in the declared order. */
const REPRESENTATIVES = Object.freeze([
  Object.freeze({ patternId: 'pattern-1', root: join(PROJECT_ROOT, 'siprs-for-reverse') }),
  Object.freeze({ patternId: 'pattern-2', root: join(PROJECT_ROOT, 'siprs-with-4layers') }),
  Object.freeze({ patternId: 'pattern-3', root: join(PATTERNS_FIXTURES, 'partial-conver-project') }),
  Object.freeze({ patternId: 'pattern-4', root: join(PATTERNS_FIXTURES, 'spec-only-project') }),
]);

/** What each family declares, so the expectation and the fixtures are one statement. */
const DECLARED_BY_FAMILY = Object.freeze({
  'reverse-tree': ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'],
  'reverse-allocate': ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'],
  normative: ['G4', 'G5'],
  grounding: ['GF1'],
  'contract-diff': ['GF2'],
  boundify: ['B1', 'B2', 'B3'],
  split: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'],
  'claim-ledger': ['R-1'],
});

/** Every identifier the eight families declare, read from the modules that declare them. */
const EXPECTED_GATE_IDS = Object.freeze(Object.values(DECLARED_BY_FAMILY).flat().sort());

/** The two families whose runners this suite can drive from a measured tree. */
const DRIVEABLE_FAMILIES = Object.freeze(['reverse-tree', 'reverse-allocate']);

/**
 * Every directory a representative's files live under, derived from their paths.
 *
 * `listArtefacts` records files rather than the directories holding them, and T1/A1
 * compare a manifest's package paths against measured *directories* — so the set is
 * derived here instead of restated, and the root is excluded because the walk's empty
 * prefix is not a directory any package names.
 */
// [::TICKET::] P23-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-12 --for-spec --no-implementation-order`.
function directoriesOf(filePaths) {
  const directories = new Set();
  for (const filePath of filePaths) {
    const separator = filePath.lastIndexOf('/');
    if (separator > 0) directories.add(filePath.slice(0, separator));
  }
  return [...directories].sort();
}

/**
 * The directories and files a representative actually carries.
 *
 * Read from the walk the analysis path already performs rather than from a second
 * enumeration, so the gate inputs and the audit cannot disagree about what is on disk.
 */
// [::TICKET::] P23-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-12 --for-spec --no-implementation-order`.
function measureRepresentative(root) {
  const readable = listArtefacts(root).filter((artefact) => artefact.readStatus === 'readable');
  const sourceFiles = readable.map((artefact) => artefact.path);
  return { directories: directoriesOf(sourceFiles), sourceFiles };
}

/**
 * Drive the reverse-chain runners over one representative and return their records.
 *
 * The inputs are the representative's own measurements. Nothing is fabricated: a gate
 * that refuses here refuses because of what the representative genuinely lacks, which is
 * the only way the audit can tell an incompleteness refusal from a substantive one.
 */
// [::TICKET::] P23-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-12 --for-spec --no-implementation-order`.
function driveReverseChain(representative) {
  const measured = measureRepresentative(representative.root);
  return [
    ...runReverseGates({ measured, mode: 'reverse' }),
    ...runReverseAllocateGates({ existingPaths: measured.directories, mode: 'reverse' }),
  ];
}

/** The gate-shaped rows the audit classifies, one per gate the enumeration found. */
// [::TICKET::] P23-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-12 --for-spec --no-implementation-order`.
function gatesFor(enumeration, recordsByGateAndRepresentative) {
  return enumeration.gates.map((gate) => ({
    ...gate,
    records: recordsByGateAndRepresentative.get(gate.gateId) ?? [],
  }));
}

/** Collect every record the four representatives produce, keyed by gate and representative. */
// [::TICKET::] P23-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-12 --for-spec --no-implementation-order`.
function collectRepresentativeRecords() {
  const byGate = new Map();
  for (const representative of REPRESENTATIVES) {
    for (const record of driveReverseChain(representative)) {
      const rows = byGate.get(record.gateId) ?? [];
      rows.push({ representative: representative.patternId, record });
      byGate.set(record.gateId, rows);
    }
  }
  return byGate;
}

/** The refusal reasons carried by a gate's records, flattened with their provenance. */
// [::TICKET::] P23-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-12 --for-spec --no-implementation-order`.
function reasonsOf(gates) {
  return gates.flatMap((gate) =>
    collectRefusalReasons(gate).map((message) => ({
      gateId: gate.gateId,
      family: gate.family,
      sourceFile: gate.sourceFile,
      representative: gate.records[0]?.representative ?? null,
      message,
    })),
  );
}

/** One module source: the constants it declares, and the gate records it builds. */
// [::TICKET::] P23-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-12 --for-spec --no-implementation-order`.
function gateModuleSource({ declarations = {}, uses = [] }) {
  const declared = Object.entries(declarations)
    .map(([name, gateIds]) => `export const ${name} = Object.freeze({ ${gateIds.map((id) => `${id}: '${id}'`).join(', ')} });`)
    .join('\n');
  const records = uses
    .map((gateId) => `const record = { gateId: '${gateId}', status: 'PASS', counts: {}, reasons: [] };`)
    .join('\n');
  return `${declared}\n${records}\n`;
}

/**
 * A synthetic copy of the eight families' modules, with one family's declaration widened.
 *
 * Every family is materialised rather than only the mutated one, so the fixture differs
 * from the real project in exactly the one place the test is about.
 */
// [::TICKET::] P23-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-12 --for-spec --no-implementation-order`.
function familyModuleFixture({ widenedFamily = null, extraGateId = null, withheld = [] } = {}) {
  const files = {};
  for (const family of GATE_FAMILIES) {
    for (const site of family.declarationSites) {
      const declared = family.declarationSites
        .filter((candidate) => candidate.module === site.module)
        .map((candidate) => candidate.declaration);
      const gateIds = family.gateSites.includes(site.module) ? DECLARED_BY_FAMILY[family.family] : [];
      const widened = family.family === widenedFamily && extraGateId !== null ? [...gateIds, extraGateId] : gateIds;
      files[site.module] = gateModuleSource({
        declarations: Object.fromEntries(declared.map((name) => [name, widened])),
        uses: gateIds.filter((gateId) => !withheld.some((entry) => entry.family === family.family && entry.gateId === gateId)),
      });
    }
  }
  return files;
}

// ---------------------------------------------------------------------------
// C001 — the enumeration is total over the declared families
// ---------------------------------------------------------------------------

test('C001: the declarations are readable from the project root and no family is unreadable', () => {
  const enumeration = enumerateReverseGates({ projectRoot: PROJECT_ROOT });
  assert.deepEqual(enumeration.unreadable, []);
  assert.equal(enumeration.families.length, GATE_FAMILIES.length);
});

test('C001: the declared set is exactly the identifiers the modules declare', () => {
  const enumeration = enumerateReverseGates({ projectRoot: PROJECT_ROOT });
  assert.deepEqual([...enumeration.declaredGateIds].sort(), [...EXPECTED_GATE_IDS].sort());
  assert.equal(enumeration.declaredGateIds.length, EXPECTED_GATE_IDS.length);
});

test('C001: every gate carries its family and its source file', () => {
  const enumeration = enumerateReverseGates({ projectRoot: PROJECT_ROOT });
  const gateOf = (gateId) => enumeration.gates.find((gate) => gate.gateId === gateId);

  assert.equal(gateOf('T5').family, 'reverse-tree');
  assert.equal(gateOf('T5').sourceFile, '.claude/scripts/workspacify-tree/lib/architecture-delta.mjs');
  assert.equal(gateOf('A4').sourceFile, '.claude/scripts/workspacify-allocate/lib/reverse-mode.mjs');
  assert.equal(gateOf('S2').family, 'split');
  assert.equal(gateOf('GF1').family, 'grounding');
});

test('C001: the difference between the declared and the enumerated set is reported, not absorbed', () => {
  const enumeration = enumerateReverseGates({ projectRoot: PROJECT_ROOT });

  // The audit's first run over this repository named one defect written twice: A6 is
  // declared by REVERSE_GATE_IDS and no gate emits it, and `assertSeedPlacement` emits
  // the contract identifier C002 where a gate identifier belongs. The two are the same
  // mistyping seen from either side, and the audit exists to say so rather than to
  // shrink its subject until the sets agree. Repairing it changes a gate's identity,
  // which design 1.2 forbids this audit from doing — it observes.
  assert.deepEqual(enumeration.declaredOnly, ['A6']);
  assert.deepEqual(enumeration.enumeratedOnly, ['C002']);

  const audit = auditAgainstInvariant({ gates: enumeration.gates, reasons: [] });
  assert.equal(audit.passed, false);
  assert.deepEqual(
    audit.findings.map((finding) => finding.kind).sort(),
    ['declared-not-enumerated', 'enumerated-not-declared'],
  );
  assert.equal(
    enumeration.gates.filter((gate) => gate.declared && gate.enumerated)
      .every((gate) => typeof gate.sourceFile === 'string' && gate.sourceFile.length > 0),
    true,
  );
});

test('C001: the two reverse-mode modules contribute their twelve identifiers', () => {
  const enumeration = enumerateReverseGates({ projectRoot: PROJECT_ROOT });
  const declaredIn = (family) => enumeration.gates
    .filter((gate) => gate.family === family && gate.declared)
    .map((gate) => gate.gateId);
  const tree = declaredIn('reverse-tree');
  const allocate = declaredIn('reverse-allocate');

  assert.deepEqual(tree.sort(), ['T1', 'T2', 'T3', 'T4', 'T5', 'T6']);
  assert.deepEqual(allocate.sort(), ['A1', 'A2', 'A3', 'A4', 'A5', 'A6']);
});

test('C001 error: a module declaring a gate the enumeration lacks names the missing gate', () => {
  const fixture = createSyntheticTree(
    familyModuleFixture({ widenedFamily: 'reverse-tree', extraGateId: 'T7' }),
  );

  const enumeration = enumerateReverseGates({ projectRoot: fixture.root });
  assert.deepEqual(enumeration.declaredOnly, ['T7']);

  const audit = auditAgainstInvariant({ gates: enumeration.gates, reasons: [] });
  assert.equal(audit.passed, false);
  assert.equal(
    audit.findings.some((finding) => finding.kind === 'declared-not-enumerated' && finding.gateId === 'T7'),
    true,
  );
  fixture.dispose();
});

test('C001 error: a gate emitted without a declaration is named too, so the check is not one-directional', () => {
  const files = familyModuleFixture();
  const widened = files['.claude/scripts/workspacify-tree/lib/reverse-mode.mjs']
    + "const record = { gateId: 'T9', status: 'PASS', counts: {}, reasons: [] };\n";
  const fixture = createSyntheticTree({ ...files, '.claude/scripts/workspacify-tree/lib/reverse-mode.mjs': widened });

  const enumeration = enumerateReverseGates({ projectRoot: fixture.root });
  assert.deepEqual(enumeration.enumeratedOnly, ['T9']);
  assert.equal(
    auditAgainstInvariant({ gates: enumeration.gates, reasons: [] })
      .findings.some((finding) => finding.kind === 'enumerated-not-declared' && finding.gateId === 'T9'),
    true,
  );
  fixture.dispose();
});

test('C001 boundary: a root declaring nothing names every family searched rather than enumerating nothing', () => {
  const empty = createSyntheticTree({ 'README.md': '# nothing is declared here\n' });
  const enumeration = enumerateReverseGates({ projectRoot: empty.root });

  assert.equal(enumeration.gates.filter((gate) => gate.gateId !== null).length, 0);
  assert.deepEqual(
    [...new Set(enumeration.unreadable.map((row) => row.family))].sort(),
    [...GATE_FAMILIES.map((family) => family.family)].sort(),
  );
  assert.equal(
    enumeration.unreadable.every((row) => typeof row.module === 'string' && typeof row.reason === 'string'),
    true,
  );

  // An empty enumeration must not read as a chain with no gates: the modules that could
  // not be read travel in `gates` and fail the audit by name.
  const audit = auditAgainstInvariant({ gates: enumeration.gates, reasons: [] });
  assert.equal(audit.passed, false);
  assert.equal(
    audit.findings.every((finding) => finding.kind === 'unreadable-module'),
    true,
  );
  empty.dispose();
});

// ---------------------------------------------------------------------------
// C002 — no gate refuses with a forbidden formulation
// ---------------------------------------------------------------------------

test('C002: the six formulations are named predicates over a message string', () => {
  assert.equal(FORBIDDEN_REFUSALS.length, 6);
  for (const row of FORBIDDEN_REFUSALS) {
    assert.equal(typeof row.matches, 'function', row.id);
    assert.equal(row.matches(row.sample), true, `${row.id} must match its own recorded formulation`);
  }
  assert.equal(
    FORBIDDEN_REFUSALS.filter((row) => row.matches('T2 reported 3 unowned source files')).length,
    0,
  );
});

test('C002: over the real gate set no refusal reason matches any formulation', () => {
  const enumeration = enumerateReverseGates({ projectRoot: PROJECT_ROOT });
  const gates = gatesFor(enumeration, collectRepresentativeRecords());
  const audit = auditAgainstInvariant({ gates, reasons: reasonsOf(gates) });

  // The invariant is about refusals, so it is asserted about refusals. `passed` also
  // carries the enumeration's own findings — A6 and C002 — which are a different
  // statement and are asserted where they belong, in C001.
  assert.deepEqual(audit.perFormulation, Object.fromEntries(FORBIDDEN_REFUSALS.map((row) => [row.id, 0])));
  assert.deepEqual(audit.findings.filter((finding) => finding.kind === 'forbidden-refusal'), []);
});

test('C002 error: all six formulations fail the audit, one fixture each', () => {
  for (const row of FORBIDDEN_REFUSALS) {
    const gate = {
      gateId: 'T5',
      family: 'reverse-tree',
      sourceFile: 'architecture-delta.mjs',
      record: { gateId: 'T5', status: 'FAIL', counts: {}, reasons: [row.sample] },
    };
    const audit = auditAgainstInvariant({
      gates: [gate],
      reasons: collectRefusalReasons(gate).map((message) => ({ ...gate, message })),
    });

    assert.equal(audit.passed, false, `${row.id} must be seen to fail`);
    assert.equal(audit.perFormulation[row.id], 1, row.id);
    assert.equal(audit.findings[0].formulationId, row.id);
    assert.equal(audit.findings[0].gateId, 'T5');
  }
});

test('C002 error: one reason matching two formulations produces two findings', () => {
  const message = `${FORBIDDEN_REFUSALS[0].sample} ${FORBIDDEN_REFUSALS[5].sample}`;
  const gate = {
    gateId: 'A1',
    family: 'reverse-allocate',
    sourceFile: 'reverse-mode.mjs',
    record: { gateId: 'A1', status: 'FAIL', counts: {}, reasons: [message] },
  };
  const audit = auditAgainstInvariant({
    gates: [gate],
    reasons: [{ ...gate, message }],
  });

  assert.equal(audit.findings.filter((finding) => finding.kind === 'forbidden-refusal').length, 2);
});

test('C002 boundary: a passing record whose text mentions incompleteness is not a finding', () => {
  const gate = {
    gateId: 'T5',
    family: 'reverse-tree',
    sourceFile: 'architecture-delta.mjs',
    record: {
      gateId: 'T5',
      status: 'PASS',
      counts: { differences: 3, unrecorded: 0 },
      reasons: ['the project is an incomplete conver project and all 3 mismatch(es) are recorded'],
    },
  };

  assert.deepEqual(collectRefusalReasons(gate), []);
  assert.equal(auditAgainstInvariant({ gates: [gate], reasons: [] }).passed, true);
});

// ---------------------------------------------------------------------------
// C003 — a recorded disagreement is not a refusal
// ---------------------------------------------------------------------------

test('C003: a recorded disagreement is not a refusal, in both directions', () => {
  const recorded = {
    gateId: 'T5',
    status: 'PASS',
    counts: { differences: 3, unrecorded: 0 },
    reasons: ['all 3 mismatch(es) are recorded'],
  };
  const unrecorded = {
    gateId: 'T5',
    status: 'PASS',
    counts: { differences: 3, unrecorded: 3 },
    reasons: ['3 mismatch(es) are not recorded'],
  };

  assert.equal(classifyGateOutcome(recorded), GATE_OUTCOMES.RECORDED_DISAGREEMENT);
  assert.equal(classifyGateOutcome(unrecorded), GATE_OUTCOMES.REFUSED);
  assert.notEqual(classifyGateOutcome(recorded), classifyGateOutcome(unrecorded));
});

test('C003 boundary: a gate with no refusal reason at all is never-refusing, not a finding', () => {
  const record = { gateId: 'T5', status: 'PASS', counts: {}, reasons: [] };
  assert.equal(classifyGateOutcome(record), GATE_OUTCOMES.NEVER_REFUSING);
  assert.equal(
    auditAgainstInvariant({
      gates: [{ gateId: 'T5', family: 'reverse-tree', sourceFile: 'architecture-delta.mjs', record }],
      reasons: [],
    }).passed,
    true,
  );
});

test('C003: over the four representatives every gate is classified with gate and representative named', () => {
  const enumeration = enumerateReverseGates({ projectRoot: PROJECT_ROOT });
  const gates = gatesFor(enumeration, collectRepresentativeRecords());
  const audit = auditAgainstInvariant({ gates, reasons: reasonsOf(gates) });
  const driveable = gates.filter(
    (gate) => DRIVEABLE_FAMILIES.includes(gate.family) && gate.records.length > 0,
  );

  assert.equal(audit.classification.length, driveable.length * REPRESENTATIVES.length);
  for (const representative of REPRESENTATIVES) {
    for (const gate of driveable) {
      const rows = audit.classification.filter(
        (row) => row.representative === representative.patternId && row.gateId === gate.gateId,
      );
      assert.equal(rows.length, 1, `${representative.patternId}/${gate.gateId}`);
      assert.equal(Object.values(GATE_OUTCOMES).includes(rows[0].outcome), true);
    }
  }
});

test('C003 invariant: no gate is both refused and recorded-disagreement', () => {
  const enumeration = enumerateReverseGates({ projectRoot: PROJECT_ROOT });
  const gates = gatesFor(enumeration, collectRepresentativeRecords());
  const audit = auditAgainstInvariant({ gates, reasons: reasonsOf(gates) });

  const seen = new Set();
  for (const row of audit.classification) {
    const key = `${row.representative}/${row.gateId}`;
    assert.equal(seen.has(key), false, `${key} was classified twice`);
    seen.add(key);
  }
  assert.equal(seen.size, audit.classification.length);
});

test('C003 invariant: the audit leaves every representative byte-identical', () => {
  for (const representative of REPRESENTATIVES) {
    const before = hashTree(representative.root);
    const gates = gatesFor(
      enumerateReverseGates({ projectRoot: PROJECT_ROOT }),
      collectRepresentativeRecords(),
    );
    auditAgainstInvariant({ gates, reasons: reasonsOf(gates) });
    assert.deepEqual(hashTree(representative.root), before, representative.patternId);
  }
});

test('C003 invariant: the classification counts are published with the audit', () => {
  const enumeration = enumerateReverseGates({ projectRoot: PROJECT_ROOT });
  const gates = gatesFor(enumeration, collectRepresentativeRecords());
  const audit = auditAgainstInvariant({ gates, reasons: reasonsOf(gates) });
  const rendered = renderInvariantAudit(audit);

  assert.equal(typeof audit.counts, 'object');
  assert.equal(
    Object.values(audit.counts).reduce((total, count) => total + count, 0),
    audit.classification.length,
  );
  for (const outcome of Object.values(GATE_OUTCOMES)) {
    assert.equal(rendered.includes(outcome), true, `${outcome} is named in the rendering`);
  }
});

// ---------------------------------------------------------------------------
// The audit's own shape — it measures, it does not enforce
// ---------------------------------------------------------------------------

test('C001 invariant: three mutated fixtures each withhold one declared gate and shrink the enumeration by exactly one', () => {
  const real = enumerateReverseGates({ projectRoot: PROJECT_ROOT });
  const withheld = [
    { family: 'reverse-tree', gateId: 'T2' },
    { family: 'reverse-allocate', gateId: 'A3' },
    { family: 'split', gateId: 'S5' },
  ];

  for (const entry of withheld) {
    const fixture = createSyntheticTree(familyModuleFixture({ withheld: [entry] }));
    const mutated = enumerateReverseGates({ projectRoot: fixture.root });

    assert.equal(mutated.enumeratedGateIds.length, real.enumeratedGateIds.length - 1, entry.gateId);
    assert.deepEqual(mutated.declaredOnly, [entry.gateId]);
    assert.equal(
      auditAgainstInvariant({ gates: mutated.gates, reasons: [] })
        .findings.some((finding) => finding.gateId === entry.gateId),
      true,
      `${entry.gateId} must be named`,
    );
    fixture.dispose();
  }
});

test('C002 invariant: over twenty generated messages the finding count is the number each message matches', () => {
  const neutral = [
    'T2 reported 3 unowned source files',
    'the manifest and the measured directories disagree on 2 paths',
    'no seed was rendered, so there is no section 1 to carry the reverse index',
    'the run is in reverse mode but reverse_provenance was not added to the manifest',
  ];
  const messages = [
    ...FORBIDDEN_REFUSALS.map((row) => row.sample),
    ...FORBIDDEN_REFUSALS.map((row) => `${row.sample}.`),
    ...FORBIDDEN_REFUSALS.slice(0, 4).map((row, index) => `${neutral[index % neutral.length]}; ${row.sample}`),
    ...neutral,
  ];
  assert.equal(messages.length, 20);

  // The expectation is computed here, from the messages and the declared predicates,
  // rather than read back out of the audit's own tally.
  const expected = Object.fromEntries(FORBIDDEN_REFUSALS.map((row) => [row.id, 0]));
  for (const message of messages) {
    for (const row of FORBIDDEN_REFUSALS) {
      if (row.matches(message)) expected[row.id] += 1;
    }
  }

  const reasons = messages.map((message, index) => ({ gateId: `T${index}`, family: 'reverse-tree', message }));
  const audit = auditAgainstInvariant({ gates: [], reasons });

  assert.deepEqual(audit.perFormulation, expected);
  assert.equal(audit.findings.length, Object.values(expected).reduce((total, count) => total + count, 0));
});

test('the audit declares no gate of its own', () => {
  const source = readFileSync(INVARIANT_AUDIT_MODULE, 'utf8');
  const exported = [...source.matchAll(/export (?:async )?function (\w+)/g)].map((match) => match[1]);

  // Two names carry the word "gate" because they read gates and say which outcome one
  // landed in. Both are exempt by name: a check that merely grepped for the word would
  // forbid the module from naming its own subject.
  const READS_RATHER_THAN_JUDGES = Object.freeze(['enumerateReverseGates', 'classifyGateOutcome']);

  assert.deepEqual(exported.filter((name) => /assert/i.test(name)), []);
  assert.deepEqual(
    exported.filter((name) => !READS_RATHER_THAN_JUDGES.includes(name) && /gate/i.test(name)),
    [],
  );
  assert.equal(exported.includes('enumerateReverseGates'), true);
});
