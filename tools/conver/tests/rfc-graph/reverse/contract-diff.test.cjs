// P22-14 @verifies C002
/**
 * GF2 — the contract candidates reconciled against the RFC-derived contracts (§6.6, §6.14.4).
 *
 * The failure this gate exists to prevent is the ratification RFC (F1): an RFC
 * written from an existing implementation that restates the code in the language
 * of a specification. It passes every later check while proving nothing. The
 * defence is not a similarity score — it is that every difference between what
 * the code does and what the RFC says is *recorded*, so the difference survives
 * as evidence instead of being smoothed away.
 *
 * A difference is therefore never a verdict. Zero differences is not a pass
 * either: it is the signature of F1, and the record must say that the comparison
 * happened rather than merely that nothing was found.
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  DIFFERENCE_DIRECTIONS,
  GF2_GATE_ID,
  GATE_STATUS,
  RECORD_TARGETS,
  UNCLASSIFIED_DIFFERENCE,
  ZERO_DIFFERENCES_INTERPRETATION,
  assertEveryDifferenceRecorded,
  extractRfcContracts,
  reconcileContracts,
  recordDifference,
  renderContractDiffReport,
} = require('../../../.claude/scripts/rfc-graph/contract-diff.js');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');

/** One R3 contract candidate, in the shape `generateCandidates` produces. */
function candidateAt(candidateId, line, proposition = 'the body of `handle` returns early when `token.is_empty()` holds') {
  return {
    candidate_id: candidateId,
    kind: 'conditional',
    claim_type: 'unresolved',
    scope: 'src',
    source_span: { file: 'src/lib.rs', line },
    evidence_mode: 'source_static',
    proposition,
    undecided: 'what the fact obliges a caller to do',
    falsification: `mutate the condition at src/lib.rs:${line} and observe whether any test fails`,
    classification: 'candidate',
    requires_human_approval: true,
  };
}

/** One RFC-derived contract, as `edge.schema.json` requires it on an edge. */
function contract(id, precondition = 'a token is supplied') {
  return {
    id,
    precondition,
    postcondition: 'an empty token is rejected',
    invariant: 'no session is created for an empty token',
  };
}

/** A graph carrying exactly the given edge contracts. */
function graphWithContracts(entries) {
  return {
    sourceFile: '~/RFC-ROOT.md',
    mainLanguage: 'rust',
    nodes: [],
    edges: entries.map((entry, index) => ({
      from: `N000${(index % 9) + 1}`,
      to: `N001${(index % 9) + 1}`,
      type: 'constrains',
      attributes: { strength: 'hard', bidirectional: false },
      contracts: entry,
    })),
  };
}

describe('GF2 — extractRfcContracts', () => {
  it('reads each contract with the edge it was annotated on', () => {
    const graph = graphWithContracts([[contract('C001')]]);

    const contracts = extractRfcContracts(graph);

    assert.equal(contracts.length, 1);
    assert.equal(contracts[0].contractId, 'C001');
    assert.deepEqual(contracts[0].edge, { from: 'N0001', to: 'N0011', type: 'constrains' });
    assert.equal(contracts[0].precondition, 'a token is supplied');
    assert.equal(contracts[0].postcondition, 'an empty token is rejected');
    assert.equal(contracts[0].invariant, 'no session is created for an empty token');
  });

  it('UT-11 preserves the edge semantics the graph already carries', () => {
    const graph = graphWithContracts([[contract('C001'), contract('C002')]]);

    const contracts = extractRfcContracts(graph);

    assert.deepEqual(contracts.map((entry) => entry.contractId), ['C001', 'C002']);
    assert.deepEqual(
      contracts.map((entry) => entry.edge),
      [
        { from: 'N0001', to: 'N0011', type: 'constrains' },
        { from: 'N0001', to: 'N0011', type: 'constrains' },
      ],
    );
  });

  it('refuses a graph whose edges are not a list', () => {
    assert.throws(() => extractRfcContracts({ nodes: [] }), /edges/);
    assert.throws(() => extractRfcContracts({ edges: null }), /edges/);
  });

  it('refuses a contract entry that states nothing, rather than dropping it', () => {
    assert.throws(
      () => extractRfcContracts(graphWithContracts([[{ ...contract('C001'), invariant: '' }]])),
      /C001/,
    );
    assert.throws(() => extractRfcContracts(graphWithContracts([[{ precondition: 'a', postcondition: 'b', invariant: 'c' }]])), /id/);
  });

  it('reads an edge carrying no contracts as contributing none', () => {
    const graph = graphWithContracts([[contract('C001')]]);
    graph.edges.push({ from: 'N0002', to: 'N0012', type: 'depends_on', attributes: { strength: 'hard', bidirectional: false } });

    assert.equal(extractRfcContracts(graph).length, 1);
  });

  it('leaves the graph it read unchanged', () => {
    const graph = graphWithContracts([[contract('C001')]]);
    const frozen = JSON.parse(JSON.stringify(graph));

    extractRfcContracts(graph);

    assert.deepEqual(graph, frozen, 'GF2 reports a difference, it does not repair one');
  });
});

describe('GF2 — reconcileContracts', () => {
  it('UT-2 records a candidate the RFC does not state as unexplained', () => {
    const { differences } = reconcileContracts({
      candidates: [candidateAt('cand-1', 42)],
      rfcContracts: [],
      correspondences: [],
    });

    assert.equal(differences.length, 1);
    assert.equal(differences[0].direction, DIFFERENCE_DIRECTIONS.UNEXPLAINED);
    assert.equal(differences[0].candidateId, 'cand-1');
    assert.deepEqual(differences[0].sourceSpan, { file: 'src/lib.rs', line: 42 });
  });

  it('records an RFC contract the implementation shows nothing for as unimplemented', () => {
    const { differences } = reconcileContracts({
      candidates: [],
      rfcContracts: extractRfcContracts(graphWithContracts([[contract('C001')]])),
      correspondences: [],
    });

    assert.equal(differences.length, 1);
    assert.equal(differences[0].direction, DIFFERENCE_DIRECTIONS.UNIMPLEMENTED);
    assert.equal(differences[0].contractId, 'C001');
  });

  it('pairs a candidate with an RFC contract without calling either one a difference', () => {
    const { matched, differences } = reconcileContracts({
      candidates: [candidateAt('cand-1', 42)],
      rfcContracts: extractRfcContracts(graphWithContracts([[contract('C001')]])),
      correspondences: [{ candidateId: 'cand-1', contractId: 'C001' }],
    });

    assert.deepEqual(matched, [{ candidateId: 'cand-1', contractId: 'C001' }]);
    assert.deepEqual(differences, []);
  });

  it('counts two candidates and one contract with no pairing as three differences', () => {
    const { differences, counts } = reconcileContracts({
      candidates: [candidateAt('cand-1', 42), candidateAt('cand-2', 88, 'the body of `decode` asserts `len <= MAX`')],
      rfcContracts: extractRfcContracts(graphWithContracts([[contract('C001')]])),
      correspondences: [],
    });

    assert.equal(differences.length, 3);
    assert.deepEqual(counts, {
      candidates: 2,
      rfcContracts: 1,
      matched: 0,
      differences: 3,
      unexplained: 2,
      unimplemented: 1,
    });
  });

  it('refuses a pairing that names a candidate the analysis did not produce', () => {
    assert.throws(
      () => reconcileContracts({ candidates: [candidateAt('cand-1', 42)], rfcContracts: [], correspondences: [{ candidateId: 'cand-9', contractId: 'C001' }] }),
      /cand-9/,
    );
  });

  it('refuses a pairing that names a contract the RFC does not carry', () => {
    // The candidate is real, so the contract is what the guard has to reject.
    assert.throws(
      () => reconcileContracts({
        candidates: [candidateAt('cand-1', 42)],
        rfcContracts: extractRfcContracts(graphWithContracts([[contract('C001')]])),
        correspondences: [{ candidateId: 'cand-1', contractId: 'C009' }],
      }),
      /C009/,
    );
  });

  it('refuses two pairings of the same candidate, because a candidate is reconciled once', () => {
    assert.throws(
      () => reconcileContracts({
        candidates: [candidateAt('cand-1', 42)],
        rfcContracts: extractRfcContracts(graphWithContracts([[contract('C001'), contract('C002')]])),
        correspondences: [
          { candidateId: 'cand-1', contractId: 'C001' },
          { candidateId: 'cand-1', contractId: 'C002' },
        ],
      }),
      /cand-1/,
    );
  });

  it('UT-10 loses nothing: every item is matched or a difference, and the count proves it', () => {
    const candidates = [candidateAt('cand-1', 42), candidateAt('cand-2', 88, 'the body of `decode` asserts `len <= MAX`')];
    const rfcContracts = extractRfcContracts(graphWithContracts([[contract('C001'), contract('C002')]]));
    const before = candidates.length + rfcContracts.length;

    const { matched, differences } = reconcileContracts({
      candidates,
      rfcContracts,
      correspondences: [{ candidateId: 'cand-1', contractId: 'C001' }],
    });

    assert.equal(before, differences.length + matched.length * 2);
  });

  it('orders its output so two runs over one input cannot disagree', () => {
    const candidates = [candidateAt('cand-b', 2), candidateAt('cand-a', 1)];
    const rfcContracts = extractRfcContracts(graphWithContracts([[contract('C002'), contract('C001')]]));

    const first = reconcileContracts({ candidates, rfcContracts, correspondences: [] });
    const second = reconcileContracts({ candidates: [...candidates].reverse(), rfcContracts: [...rfcContracts].reverse(), correspondences: [] });

    assert.deepEqual(first, second);
  });
});

describe('GF2 — recordDifference', () => {
  it('UT-2 records an unexplained difference as a RESIDUE candidate in the declared vocabulary', () => {
    const { differences } = reconcileContracts({ candidates: [candidateAt('cand-1', 42)], rfcContracts: [], correspondences: [] });

    const entry = recordDifference(differences[0], {
      affectedClaimIds: ['clm-authz-delete-tenant-001'],
      originResidualIds: ['res-0007'],
      scopeRef: 'src',
    });

    assert.equal(entry.kind, RECORD_TARGETS.RESIDUE);
    assert.equal(entry.direction, DIFFERENCE_DIRECTIONS.UNEXPLAINED);
    assert.deepEqual(entry.affected_claim_ids, ['clm-authz-delete-tenant-001']);
    assert.deepEqual(entry.origin_residual_ids, ['res-0007']);
    assert.equal(entry.scope_ref, 'src');
    assert.equal(entry.next_route, 'grill', 'the next step for unexplained behaviour is the question of intent');
  });

  it('records an unimplemented difference as an omission candidate', () => {
    const { differences } = reconcileContracts({
      candidates: [],
      rfcContracts: extractRfcContracts(graphWithContracts([[contract('C001')]])),
      correspondences: [],
    });

    const entry = recordDifference(differences[0], { oracleGapRef: 'gap-0042' });

    assert.equal(entry.kind, RECORD_TARGETS.OMISSION);
    assert.equal(entry.direction, DIFFERENCE_DIRECTIONS.UNIMPLEMENTED);
    assert.equal(entry.type, 'missing_implementation');
    assert.equal(entry.oracle_gap_ref, 'gap-0042');
  });

  it('UT-5 records a difference no rule can classify as unclassified rather than dropping it', () => {
    const { differences } = reconcileContracts({ candidates: [candidateAt('cand-2', 88)], rfcContracts: [], correspondences: [] });

    for (const classification of [undefined, null, '', 42, { name: 'gap' }]) {
      const entry = recordDifference(differences[0], { classification });
      assert.equal(entry.classification, UNCLASSIFIED_DIFFERENCE, `classification ${JSON.stringify(classification)} is not a word, so the entry stays unclassified`);
      assert.equal(entry.kind, RECORD_TARGETS.RESIDUE, 'and it is still recorded');
    }
  });

  it('keeps a classification a human supplied', () => {
    const { differences } = reconcileContracts({ candidates: [candidateAt('cand-2', 88)], rfcContracts: [], correspondences: [] });

    assert.equal(recordDifference(differences[0], { classification: 'specification_gap' }).classification, 'specification_gap');
  });

  it('records the candidate identifier so the entry can be traced back', () => {
    const { differences } = reconcileContracts({ candidates: [candidateAt('cand-2', 88)], rfcContracts: [], correspondences: [] });

    const entry = recordDifference(differences[0], {});

    assert.equal(entry.candidate_id, 'cand-2');
    assert.deepEqual(entry.source_span, { file: 'src/lib.rs', line: 88 });
  });

  it('refuses a difference that names neither a candidate nor a contract', () => {
    assert.throws(() => recordDifference({ direction: DIFFERENCE_DIRECTIONS.UNEXPLAINED }, {}), /candidate/);
    assert.throws(() => recordDifference({ direction: DIFFERENCE_DIRECTIONS.UNIMPLEMENTED }, {}), /contract/);
  });
});

describe('GF2 — assertEveryDifferenceRecorded', () => {
  it('UT-7 passes with zero differences, and says the comparison was made', () => {
    const record = assertEveryDifferenceRecorded({ differences: [], recorded: [], comparisonExists: true });

    assert.equal(record.gateId, GF2_GATE_ID);
    assert.equal(record.status, GATE_STATUS.PASS);
    assert.equal(record.counts.differences, 0);
    assert.match(record.reasons[0], /the comparison was made and no difference was found/);
    assert.match(record.reasons.join(' '), /scrutin/i, 'zero differences is a finding to examine, not a clean result');
  });

  it('UT-7 fails when zero differences were found but no comparison was recorded', () => {
    const record = assertEveryDifferenceRecorded({ differences: [], recorded: [], comparisonExists: false });

    assert.equal(record.status, GATE_STATUS.FAIL);
    assert.match(record.reasons[0], /no comparison was recorded/);
  });

  it('fails and names a difference the record does not carry', () => {
    const { differences } = reconcileContracts({ candidates: [candidateAt('cand-1', 42)], rfcContracts: [], correspondences: [] });

    const record = assertEveryDifferenceRecorded({ differences, recorded: [], comparisonExists: true });

    assert.equal(record.status, GATE_STATUS.FAIL);
    assert.match(record.reasons[0], /is a difference that .* does not record, so it would be ratified rather than recorded/);
    assert.deepEqual(record.unrecorded, [`${DIFFERENCE_DIRECTIONS.UNEXPLAINED}:cand-1`]);
  });

  it('passes when every difference is recorded, and names the count', () => {
    const { differences } = reconcileContracts({
      candidates: [candidateAt('cand-1', 42), candidateAt('cand-2', 88)],
      rfcContracts: extractRfcContracts(graphWithContracts([[contract('C001')]])),
      correspondences: [],
    });
    const recorded = differences.map((difference) => recordDifference(difference, {}));

    const record = assertEveryDifferenceRecorded({ differences, recorded, comparisonExists: true });

    assert.equal(record.status, GATE_STATUS.PASS);
    assert.equal(record.counts.differences, 3);
    assert.equal(record.counts.unrecorded, 0);
    assert.deepEqual(record.unrecorded, []);
  });

  it('tells the two directions apart by name rather than by position', () => {
    const { differences } = reconcileContracts({
      candidates: [candidateAt('cand-1', 42)],
      rfcContracts: extractRfcContracts(graphWithContracts([[contract('C001')]])),
      correspondences: [],
    });
    const recorded = [recordDifference(differences.find((entry) => entry.direction === DIFFERENCE_DIRECTIONS.UNEXPLAINED), {})];

    const record = assertEveryDifferenceRecorded({ differences, recorded, comparisonExists: true });

    assert.deepEqual(record.unrecorded, [`${DIFFERENCE_DIRECTIONS.UNIMPLEMENTED}:C001`]);
  });
});

describe('GF2 — renderContractDiffReport', () => {
  it('renders the differences and the zero-difference reading in plain English', () => {
    const { differences } = reconcileContracts({ candidates: [candidateAt('cand-1', 42)], rfcContracts: [], correspondences: [] });
    const recorded = differences.map((difference) => recordDifference(difference, {}));
    const gate = assertEveryDifferenceRecorded({ differences, recorded, comparisonExists: true });

    const report = renderContractDiffReport(gate, { differences, recorded });

    assert.match(report, /GF2/);
    assert.match(report, /cand-1/);
    assert.match(report, /residue|RESIDUE/);
  });

  it('carries the zero-difference interpretation whenever nothing differed', () => {
    const gate = assertEveryDifferenceRecorded({ differences: [], recorded: [], comparisonExists: true });

    assert.match(renderContractDiffReport(gate, { differences: [], recorded: [] }), /ratification/i);
    assert.ok(ZERO_DIFFERENCES_INTERPRETATION.length > 0);
  });
});

describe('GF2 — the CLI', () => {
  const CLI_PATH = path.join(PROJECT_ROOT, '.claude/scripts/rfc-graph/contract-diff.js');

  /** A workspace holding the graph, the candidate document and the correspondence. */
  function buildWorkspace({ correspondences = [], recorded = null } = {}) {
    const dir = mkdtempSync(path.join(tmpdir(), 'p22-14-gf2-cli-'));
    const graphPath = path.join(dir, 'GRAPH.json');
    const candidatesPath = path.join(dir, 'candidates.json');
    const outPath = path.join(dir, 'out');

    writeFileSync(graphPath, `${JSON.stringify(graphWithContracts([[contract('C001')]]))}\n`);
    writeFileSync(candidatesPath, `${JSON.stringify({ candidates: [candidateAt('cand-1', 42), candidateAt('cand-2', 88)] })}\n`);
    writeFileSync(path.join(dir, 'correspondences.json'), `${JSON.stringify({ correspondences })}\n`);
    if (recorded !== null) {
      writeFileSync(path.join(dir, 'recorded.json'), `${JSON.stringify({ recorded })}\n`);
    }

    return { dir, graphPath, candidatesPath, correspondencesPath: path.join(dir, 'correspondences.json'), recordedPath: path.join(dir, 'recorded.json'), outPath, recordedGiven: recorded !== null };
  }

  function runCli(args) {
    const result = spawnSync(process.execPath, [CLI_PATH, ...args], { encoding: 'utf8' });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  }

  it('records every difference itself and exits 0', () => {
    const workspace = buildWorkspace();
    try {
      const result = runCli([
        `--graph=${workspace.graphPath}`,
        `--candidates=${workspace.candidatesPath}`,
        `--correspondences=${workspace.correspondencesPath}`,
        `--out=${workspace.outPath}`,
      ]);

      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /PASS/);
      const written = JSON.parse(readFileSync(path.join(workspace.outPath, 'CONTRACT-DIFF.json'), 'utf8'));
      assert.equal(written.differences.length, 3);
      assert.equal(written.recorded.length, 3);
      assert.deepEqual(written.recorded.map((entry) => entry.direction).sort(), ['not_in_implementation', 'unexplained_by_rfc', 'unexplained_by_rfc']);
    } finally {
      rmSync(workspace.dir, { recursive: true, force: true });
    }
  });

  it('IT-2 records the difference count, which is never negative, and reads zero as a comparison', () => {
    const { differences, counts } = reconcileContracts({
      candidates: [candidateAt('cand-1', 42), candidateAt('cand-2', 88)],
      rfcContracts: extractRfcContracts(graphWithContracts([[contract('C001')]])),
      correspondences: [],
    });

    assert.ok(Number.isInteger(counts.differences) && counts.differences >= 0, 'the count is a count');
    assert.equal(counts.differences, differences.length, 'the reported count is the list it counts');

    const none = assertEveryDifferenceRecorded({ differences: [], recorded: [], comparisonExists: true });
    assert.equal(none.status, GATE_STATUS.PASS);
    assert.equal(none.counts.differences, 0);
    assert.match(none.reasons[0], /the comparison was made and no difference was found/);
    assert.match(
      none.reasons.join(' '),
      /ratification/i,
      'zero is recorded as a comparison to scrutinise, never as a pass to trust',
    );
  });

  it('exits 1 when the record a previous step wrote is missing a difference', () => {
    const workspace = buildWorkspace({ recorded: [] });
    try {
      const result = runCli([
        `--graph=${workspace.graphPath}`,
        `--candidates=${workspace.candidatesPath}`,
        `--recorded=${workspace.recordedPath}`,
        `--out=${workspace.outPath}`,
      ]);

      assert.equal(result.status, 1, 'a difference the record does not carry is not a passing run');
      assert.match(result.stdout, /would be ratified rather than recorded/);
    } finally {
      rmSync(workspace.dir, { recursive: true, force: true });
    }
  });

  it('exits 2 on usage, and 1 with the 3-line template when a pairing names nothing', () => {
    assert.equal(runCli([]).status, 2);

    const workspace = buildWorkspace({ correspondences: [{ candidateId: 'cand-9', contractId: 'C001' }] });
    try {
      const result = runCli([
        `--graph=${workspace.graphPath}`,
        `--candidates=${workspace.candidatesPath}`,
        `--correspondences=${workspace.correspondencesPath}`,
        `--out=${workspace.outPath}`,
      ]);

      assert.equal(result.status, 1);
      assert.match(result.stderr, /^\[ERROR\] /);
      assert.match(result.stderr, /\nCause: /);
      assert.match(result.stderr, /\nAction: /);
      assert.match(result.stderr, /cand-9/);
    } finally {
      rmSync(workspace.dir, { recursive: true, force: true });
    }
  });

  it('records a zero-difference comparison rather than reporting success', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'p22-14-gf2-zero-'));
    try {
      const graphPath = path.join(dir, 'GRAPH.json');
      const candidatesPath = path.join(dir, 'candidates.json');
      const correspondencesPath = path.join(dir, 'correspondences.json');
      const outPath = path.join(dir, 'out');
      writeFileSync(graphPath, `${JSON.stringify(graphWithContracts([[contract('C001')]]))}\n`);
      writeFileSync(candidatesPath, `${JSON.stringify({ candidates: [candidateAt('cand-1', 42)] })}\n`);
      writeFileSync(correspondencesPath, `${JSON.stringify({ correspondences: [{ candidateId: 'cand-1', contractId: 'C001' }] })}\n`);

      const result = runCli([
        `--graph=${graphPath}`,
        `--candidates=${candidatesPath}`,
        `--correspondences=${correspondencesPath}`,
        `--out=${outPath}`,
      ]);

      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /ratification/i, 'a zero result is the outcome to scrutinise, not a clean bill of health');
      const written = JSON.parse(readFileSync(path.join(outPath, 'CONTRACT-DIFF.json'), 'utf8'));
      assert.deepEqual(written.comparison.differences, 0);
      assert.deepEqual(written.recorded, []);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
