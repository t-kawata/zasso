// P22-17 @verifies C001 @verifies C002
/**
 * The return path — an omission and a RESIDUE each name the uncertainty they came from.
 *
 * A shortfall is recorded as a shortfall of the original hypothesis, norm or scope, not
 * as "not enough tests" (ABOUT-REVERSE 1.3). A count cannot carry that: to follow a
 * recurrence or a circularity the shortfall has to point back at the claim and the
 * residual it descends from. 6.12.3 layer B gives the omission `affected_claim_ids` and
 * `origin_residual_ids`, and the RESIDUE `scenario_ref` and `next_route`; 6.10.1 gives the
 * edges the two commands are the return half of.
 *
 * Resolution is separated from emission. A reference is checked against the ledger it
 * claims to come from *before* it is written, so a dangling identifier never reaches the
 * output — the return chain is a pointer a human can follow, and a pointer to nothing is
 * worse than no pointer, because it reads as a chain that exists.
 *
 * The forward obligation is the sharper one. `/crystalize-readme` produces the RESIDUE
 * whose count of zero is the stated success condition of the whole reverse rotation, so a
 * change that altered the forward RESIDUE shape would corrupt the very measurement this
 * phase is judged by. In forward mode the artefact is therefore returned *itself*, not a
 * copy: an unchanged reference cannot serialise differently today or tomorrow, while a
 * copy that happens to match now is only a hopeful claim.
 *
 * Run: node --test "tests/tickets/**\/*.test.cjs"
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const {
  RETURN_REFERENCE_FIELDS,
  NEXT_ROUTES,
  CLAIM_ID_PATTERN,
  ReturnReferenceRefused,
  resolveReturnRef,
  attachReturnRefs,
  withoutReturnRefs,
  renderReturnRefFindings,
  assertForwardShapeUnchanged,
} = require('../../../.claude/scripts/tickets/lib/return-refs.js');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const FORWARD_EXTENSIONS = path.join(
  PROJECT_ROOT,
  '.claude/scripts/workspacify-allocate/lib/forward-extensions.mjs',
);

/** Identifiers the ledger and the registry are taken to hold for these tests. */
const KNOWN = {
  claims: new Set(['clm-lib-rs-invariant-42']),
  residuals: new Set(['res-0007']),
  scenarios: new Set(['H1-1']),
};

const OMISSION = {
  type: 'missing_implementation',
  contract_id: 'C001',
  statement: 'the guard is absent',
};

const RESIDUE = { candidate_id: 'N0042', topic: 'unexplained boundary' };

describe('C001 — an omission names the claims and the residuals it descends from', () => {
  it('UT-1: adds affected_claim_ids and origin_residual_ids in reverse mode', () => {
    const { artefact, attached, findings } = attachReturnRefs(OMISSION, {
      kind: 'omission',
      mode: 'reverse',
      references: {
        affected_claim_ids: ['clm-lib-rs-invariant-42'],
        origin_residual_ids: ['res-0007'],
      },
      known: KNOWN,
    });

    assert.deepEqual(findings, []);
    assert.deepEqual(attached, ['affected_claim_ids', 'origin_residual_ids']);
    assert.deepEqual(artefact.affected_claim_ids, ['clm-lib-rs-invariant-42']);
    assert.deepEqual(artefact.origin_residual_ids, ['res-0007']);
    assert.equal(artefact.contract_id, 'C001');
  });

  it('UT-8: a single omission is valid — one claim and no residual is enough', () => {
    const { artefact, findings } = attachReturnRefs(OMISSION, {
      kind: 'omission',
      mode: 'reverse',
      references: { affected_claim_ids: ['clm-lib-rs-invariant-42'] },
      known: KNOWN,
    });

    assert.deepEqual(artefact.affected_claim_ids, ['clm-lib-rs-invariant-42']);
    assert.deepEqual(findings, []);
  });

  it('UT-3: returns the forward omission itself, with no key added', () => {
    const result = attachReturnRefs(OMISSION, { kind: 'omission', mode: 'forward' });

    assert.strictEqual(result.artefact, OMISSION);
    assert.deepEqual(Object.keys(result.artefact), ['type', 'contract_id', 'statement']);
    assert.deepEqual(result.attached, []);
    assert.deepEqual(result.findings, []);
  });

  it('UT-3: refuses a return reference sitting on a forward omission', () => {
    const contaminated = { ...OMISSION, affected_claim_ids: ['clm-lib-rs-invariant-42'] };

    assert.throws(
      () => attachReturnRefs(contaminated, { kind: 'omission', mode: 'forward' }),
      (error) => error instanceof ReturnReferenceRefused
        && /must not carry return reference/.test(error.message),
    );
  });
});

describe('C002 — a RESIDUE names its scenario and the route it travels next', () => {
  it('UT-2: adds scenario_ref and next_route in reverse mode', () => {
    const { artefact, attached, findings } = attachReturnRefs(RESIDUE, {
      kind: 'residue',
      mode: 'reverse',
      references: { scenario_ref: 'H1-1', next_route: 'grill' },
      known: KNOWN,
    });

    assert.deepEqual(findings, []);
    assert.deepEqual(attached, ['scenario_ref', 'next_route']);
    assert.equal(artefact.scenario_ref, 'H1-1');
    assert.equal(artefact.next_route, 'grill');
  });

  it('UT-11: gains fields without losing any existing one', () => {
    const { artefact } = attachReturnRefs(RESIDUE, {
      kind: 'residue',
      mode: 'reverse',
      references: { scenario_ref: 'H1-1', next_route: 'grill' },
      known: KNOWN,
    });

    assert.equal(artefact.candidate_id, 'N0042');
    assert.equal(artefact.topic, 'unexplained boundary');
  });

  it('UT-3: returns the forward RESIDUE itself, with neither new field present', () => {
    const { artefact } = attachReturnRefs(RESIDUE, { kind: 'residue', mode: 'forward' });

    assert.strictEqual(artefact, RESIDUE);
    assert.equal(Object.hasOwn(artefact, 'scenario_ref'), false);
    assert.equal(Object.hasOwn(artefact, 'next_route'), false);
  });
});

describe('UT-4 and UT-5 — an unusable reference is reported, never emitted', () => {
  it('UT-4: reports a well-formed but unknown claim identifier', () => {
    const { identifier, finding } = resolveReturnRef('clm-lib-rs-invariant-999', {
      kind: 'claim',
      known: KNOWN.claims,
    });

    assert.equal(identifier, null);
    assert.equal(finding.reference, 'affected_claim_ids');
    assert.match(finding.reason, /not found in the claim ledger/);
  });

  it('UT-5: reports a malformed claim identifier', () => {
    const { identifier, finding } = resolveReturnRef('C001', {
      kind: 'claim',
      known: KNOWN.claims,
    });

    assert.equal(identifier, null);
    assert.match(finding.reason, /is not a claim identifier/);
  });

  it('UT-5: accepts the identifier shape the claim ledger builds', () => {
    assert.ok(CLAIM_ID_PATTERN.test('clm-lib-rs-invariant-42'));
    assert.ok(CLAIM_ID_PATTERN.test('clm-runtime-handle-boundary_crossing-7'));
    assert.ok(CLAIM_ID_PATTERN.test('clm-state-m20-failure_contract-3'));
    assert.ok(!CLAIM_ID_PATTERN.test('clm-lib-rs-bogus-42'));
    assert.ok(!CLAIM_ID_PATTERN.test('lib-rs-invariant-42'));
    assert.ok(!CLAIM_ID_PATTERN.test('clm-lib-rs-invariant-'));
  });

  it('UT-5: reports a route the design does not declare', () => {
    const { identifier, finding } = resolveReturnRef('R99', { kind: 'route' });

    assert.equal(identifier, null);
    assert.equal(finding.reference, 'next_route');
    assert.match(finding.reason, /is not a declared next route/);
    assert.deepEqual(NEXT_ROUTES, ['R3.5', 'R5', 'R6', 'grill']);
  });

  it('UT-4: never emits a dangling identifier and names the omission it was attached to', () => {
    const result = attachReturnRefs(OMISSION, {
      kind: 'omission',
      mode: 'reverse',
      references: {
        affected_claim_ids: ['clm-lib-rs-invariant-999'],
        origin_residual_ids: [],
      },
      known: KNOWN,
    });

    assert.equal(Object.hasOwn(result.artefact, 'affected_claim_ids'), false);
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].artefact.contract_id, 'C001');
    assert.match(renderReturnRefFindings(result.findings), /clm-lib-rs-invariant-999/);
  });

  it('UT-5: reports a malformed residual identifier against the omission it was attached to', () => {
    const result = attachReturnRefs(OMISSION, {
      kind: 'omission',
      mode: 'reverse',
      references: { origin_residual_ids: ['', null, 42] },
      known: KNOWN,
    });

    assert.equal(Object.hasOwn(result.artefact, 'origin_residual_ids'), false);
    assert.equal(result.findings.length, 3);
    for (const finding of result.findings) {
      assert.equal(finding.reference, 'origin_residual_ids');
      assert.equal(finding.artefact.contract_id, 'C001');
    }
  });

  it('UT-4: refuses a list where the design declares one scenario', () => {
    const result = attachReturnRefs(RESIDUE, {
      kind: 'residue',
      mode: 'reverse',
      references: { scenario_ref: ['H1-1'] },
      known: KNOWN,
    });

    assert.equal(Object.hasOwn(result.artefact, 'scenario_ref'), false);
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].reference, 'scenario_ref');
    assert.match(result.findings[0].reason, /one identifier/);
  });

  it('UT-4: refuses one identifier where the design declares a list', () => {
    const result = attachReturnRefs(OMISSION, {
      kind: 'omission',
      mode: 'reverse',
      references: { affected_claim_ids: 'clm-lib-rs-invariant-42' },
      known: KNOWN,
    });

    assert.equal(Object.hasOwn(result.artefact, 'affected_claim_ids'), false);
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].reference, 'affected_claim_ids');
    assert.match(result.findings[0].reason, /a list of identifiers/);
  });
});

describe('UT-6 and UT-7 — the boundaries of a chain that may not exist', () => {
  it('UT-6: adds nothing when no originating uncertainty is known', () => {
    const { artefact, attached, findings } = attachReturnRefs(OMISSION, {
      kind: 'omission',
      mode: 'reverse',
    });

    assert.strictEqual(artefact, OMISSION);
    assert.deepEqual(attached, []);
    assert.deepEqual(findings, []);
  });

  it('UT-6: adds nothing when a reference is supplied empty', () => {
    const { artefact, attached, findings } = attachReturnRefs(OMISSION, {
      kind: 'omission',
      mode: 'reverse',
      references: { affected_claim_ids: [], origin_residual_ids: [] },
      known: KNOWN,
    });

    assert.strictEqual(artefact, OMISSION);
    assert.deepEqual(attached, []);
    assert.deepEqual(findings, []);
  });

  it('UT-7: states that a run producing no omissions produced none', () => {
    assert.match(
      renderReturnRefFindings([], { subject: 'omissions', considered: 0 }),
      /No omissions were detected/,
    );
  });

  it('UT-7: states plainly when every reference resolved', () => {
    assert.match(
      renderReturnRefFindings([], { subject: 'omissions', considered: 3 }),
      /Every return reference resolved/,
    );
  });
});

describe('UT-9 and UT-10 — the forward shape does not move', () => {
  it('UT-9: proves the forward shape of the omission and of the RESIDUE unchanged', () => {
    const omissionAfter = attachReturnRefs(OMISSION, { kind: 'omission', mode: 'forward' }).artefact;
    const residueAfter = attachReturnRefs(RESIDUE, { kind: 'residue', mode: 'forward' }).artefact;

    assert.equal(
      assertForwardShapeUnchanged(OMISSION, omissionAfter, {
        label: '.claude/commands/find-omissions.md omission',
      }),
      true,
    );
    assert.equal(JSON.stringify(OMISSION), JSON.stringify(omissionAfter));

    assert.equal(
      assertForwardShapeUnchanged(RESIDUE, residueAfter, {
        label: '.claude/commands/crystalize-readme.md RESIDUE',
      }),
      true,
    );
    assert.equal(JSON.stringify(RESIDUE), JSON.stringify(residueAfter));
  });

  it('UT-9: reports a forward shape that gained a key', () => {
    assert.throws(
      () => assertForwardShapeUnchanged(OMISSION, { ...OMISSION, scenario_ref: 'H1-1' }),
      (error) => error instanceof ReturnReferenceRefused && /gained/.test(error.message),
    );
  });

  it('UT-9: reports a forward shape that lost a key, naming the artefact', () => {
    const { statement, ...withoutStatement } = OMISSION;

    assert.throws(
      () => assertForwardShapeUnchanged(OMISSION, withoutStatement, { label: 'the omission' }),
      (error) => error instanceof ReturnReferenceRefused && /the omission lost/.test(error.message),
    );
  });

  it('UT-10: leaves a field the caller did not supply absent, not null', () => {
    const { artefact } = attachReturnRefs(OMISSION, {
      kind: 'omission',
      mode: 'reverse',
      references: { affected_claim_ids: ['clm-lib-rs-invariant-42'] },
      known: KNOWN,
    });

    assert.deepEqual(artefact.affected_claim_ids, ['clm-lib-rs-invariant-42']);
    assert.equal(Object.hasOwn(artefact, 'origin_residual_ids'), false);
    assert.equal(artefact.origin_residual_ids, undefined);
  });

  it('UT-10: does not mutate the artefact it was given', () => {
    attachReturnRefs(OMISSION, {
      kind: 'omission',
      mode: 'reverse',
      references: { affected_claim_ids: ['clm-lib-rs-invariant-42'] },
      known: KNOWN,
    });

    assert.deepEqual(Object.keys(OMISSION), ['type', 'contract_id', 'statement']);
  });

  it('UT-4: strips a proposed reference so an unconfirmed one cannot survive', () => {
    const proposed = { ...OMISSION, affected_claim_ids: ['clm-lib-rs-invariant-999'] };
    const bare = withoutReturnRefs(proposed, 'omission');

    assert.deepEqual(Object.keys(bare), ['type', 'contract_id', 'statement']);
    assert.deepEqual(Object.keys(proposed), ['type', 'contract_id', 'statement', 'affected_claim_ids']);
  });

  it('UT-4: strips only the references the kind declares', () => {
    const residue = { ...RESIDUE, scenario_ref: 'H1-1', next_route: 'grill' };

    assert.deepEqual(Object.keys(withoutReturnRefs(residue, 'residue')), ['candidate_id', 'topic']);
    assert.deepEqual(Object.keys(residue), ['candidate_id', 'topic', 'scenario_ref', 'next_route']);
  });
});

describe('the declared kind and the declared fields are the whole vocabulary', () => {
  it('refuses a kind that carries no return reference', () => {
    assert.throws(
      () => attachReturnRefs(OMISSION, { kind: 'graph', mode: 'reverse' }),
      (error) => error instanceof ReturnReferenceRefused && /carries no return reference/.test(error.message),
    );
  });

  it('refuses a field the kind does not declare', () => {
    assert.throws(
      () => attachReturnRefs(OMISSION, {
        kind: 'omission',
        mode: 'reverse',
        references: { scenario_ref: 'H1-1' },
        known: KNOWN,
      }),
      (error) => error instanceof ReturnReferenceRefused && /declares no return reference named/.test(error.message),
    );
  });

  it('UT-12: agrees with the reverse field names P22-10 declared', async () => {
    const { REVERSE_FIELD_NAMES, FORWARD_ARTIFACT_KINDS } = await import(FORWARD_EXTENSIONS);

    const declaredOmission = REVERSE_FIELD_NAMES[FORWARD_ARTIFACT_KINDS.OMISSION];
    const declaredResidue = REVERSE_FIELD_NAMES[FORWARD_ARTIFACT_KINDS.RESIDUE];

    assert.deepEqual(
      [...RETURN_REFERENCE_FIELDS.omission].sort(),
      ['affected_claim_ids', 'origin_residual_ids'],
    );
    assert.deepEqual(
      [...RETURN_REFERENCE_FIELDS.residue].sort(),
      ['next_route', 'scenario_ref'],
    );

    for (const field of RETURN_REFERENCE_FIELDS.omission) {
      assert.ok(declaredOmission.includes(field), `${field} is not declared for an omission`);
    }
    for (const field of RETURN_REFERENCE_FIELDS.residue) {
      assert.ok(declaredResidue.includes(field), `${field} is not declared for a RESIDUE`);
    }
  });
});

describe('IT-1 — the entry point both commands run', () => {
  const CLI = path.join(PROJECT_ROOT, '.claude/scripts/tickets/lib/return-refs.js');

  /** A throwaway project holding the two sidecars the command reads. */
  function withLedgers(files, run) {
    const root = mkdtempSync(path.join(tmpdir(), 'return-refs-'));
    try {
      for (const [name, document] of Object.entries(files)) {
        writeFileSync(path.join(root, name), JSON.stringify(document), 'utf8');
      }
      return run(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  function invoke(args, artefact) {
    return spawnSync(process.execPath, [CLI, ...args], {
      input: JSON.stringify(artefact),
      encoding: 'utf8',
    });
  }

  /** The command prints the artefact, a blank line, then the report — which may itself be blank-lined. */
  function splitOutput(stdout) {
    const separator = stdout.indexOf('\n\n');
    assert.notEqual(separator, -1, 'the command must print an artefact and then a report');
    return {
      artefact: JSON.parse(stdout.slice(0, separator)),
      report: stdout.slice(separator + 2),
    };
  }

  const LEDGERS = {
    'CLAIM-LEDGER.json': { claims: [{ claim_id: 'clm-lib-rs-invariant-42' }] },
    'RESIDUAL-REGISTRY.json': { residuals: [{ residual_id: 'res-0007' }] },
  };

  it('names the claims and the residuals an omission descends from', () => {
    const result = withLedgers(LEDGERS, (root) => invoke([
      '--kind=omission',
      `--claim-ledger=${path.join(root, 'CLAIM-LEDGER.json')}`,
      `--residual-registry=${path.join(root, 'RESIDUAL-REGISTRY.json')}`,
    ], { ...OMISSION, affected_claim_ids: ['clm-lib-rs-invariant-42'], origin_residual_ids: ['res-0007'] }));

    assert.equal(result.status, 0);
    const { artefact, report } = splitOutput(result.stdout);

    assert.deepEqual(artefact.affected_claim_ids, ['clm-lib-rs-invariant-42']);
    assert.deepEqual(artefact.origin_residual_ids, ['res-0007']);
    assert.match(report, /Every return reference resolved/);
  });

  it('withholds an identifier the ledger does not hold, and names it in the report', () => {
    const result = withLedgers(LEDGERS, (root) => invoke([
      '--kind=omission',
      `--claim-ledger=${path.join(root, 'CLAIM-LEDGER.json')}`,
    ], { ...OMISSION, affected_claim_ids: ['clm-lib-rs-invariant-999'] }));

    assert.equal(result.status, 0);
    const { artefact, report } = splitOutput(result.stdout);

    assert.equal(Object.hasOwn(artefact, 'affected_claim_ids'), false);
    assert.match(report, /clm-lib-rs-invariant-999/);
    assert.match(report, /not found in the claim ledger/);
  });

  it('names the scenario and the route a RESIDUE travels from', () => {
    const result = withLedgers({
      'CRYSTALIZE-Status.json': { grill: { sections: [{ id: 'H1-1' }] } },
    }, (root) => invoke([
      '--kind=residue',
      `--scenario-status=${path.join(root, 'CRYSTALIZE-Status.json')}`,
    ], { ...RESIDUE, scenario_ref: 'H1-1', next_route: 'grill' }));

    assert.equal(result.status, 0);
    const { artefact } = splitOutput(result.stdout);

    assert.equal(artefact.scenario_ref, 'H1-1');
    assert.equal(artefact.next_route, 'grill');
    assert.equal(artefact.candidate_id, 'N0042');
  });

  it('leaves a forward artefact exactly as it arrived', () => {
    const result = invoke(['--kind=omission', '--mode=forward'], OMISSION);

    assert.equal(result.status, 0);
    assert.deepEqual(splitOutput(result.stdout).artefact, OMISSION);
  });

  it('refuses an invocation that does not say what kind of artefact it was given', () => {
    const result = invoke([], OMISSION);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /--kind= is required/);
  });

  it('refuses an option it does not know', () => {
    const result = invoke(['--kind=omission', '--ledger=/tmp/x.json'], OMISSION);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /is not an option of this command/);
  });
});
