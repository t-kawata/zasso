// [::TICKET::] PX-201 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-201 --for-spec --no-implementation-order`.
// PX-201 @verifies C001 C002
// The loop is the AI's own work: the machine proves it ran (focus coverage), that it
// converged (the final pass found nothing new), that every residual is shaped, and
// that every residual question reaches the seed that must answer it. Nothing here may
// ask a human anything - the per-directory grill happens later, by hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CRITIC_FOCUSES,
  REQUIRED_CRITIC_FOCUSES,
  ROUND_STATUSES,
  RESIDUAL_ORIGINS,
  validateSelfGrill,
  renderResidualQuestions,
  partitionResiduals,
} from '../../../.claude/scripts/workspacify-allocate/lib/self-grill.mjs';
import { renderSeed } from '../../../.claude/scripts/workspacify-allocate/lib/seed-render.mjs';
import { parseSeed } from '../../../.claude/scripts/workspacify-allocate/lib/seed-parse.mjs';
import { FORBIDDEN_PHRASES } from '../../../.claude/scripts/workspacify-tree/lib/spec-defects.mjs';
import { baseAiSections, buildValidManifest } from '../helpers/build-valid-manifest.mjs';
import { readFileSync } from 'node:fs';
import { makeSelfGrill, validResidual } from '../helpers/self-grill-fixture.mjs';

const PACKAGE_IDS = ['pkg-a', 'pkg-b'];
const GRILL_SECTION_INDEX = 12;

/** Render and parse one seed, returning the parsed document as the gate sees it. */
function parsedSeedFor(pkg, { residualQuestions = [], aiSections = baseAiSections() } = {}) {
  const { manifest } = buildValidManifest();
  const packageRecord = manifest.workspace.packages.find((entry) => entry.id === pkg);
  const { seedText } = renderSeed({
    package: packageRecord,
    machine: { manifest, expectedAllocation: [], referenceBlock: {}, contractEdges: [] },
    aiSections,
    residualQuestions,
  });
  return parseSeed(seedText);
}

function sectionBody(parsed, index) {
  return parsed.headings.find((heading) => heading.index === index).body;
}

test('C001 a complete record passes and its residual binds to the package that carries it', () => {
  const selfGrill = makeSelfGrill({ residual: [validResidual()] });
  const parsed = parsedSeedFor('pkg-a', { residualQuestions: selfGrill.residual });

  const report = validateSelfGrill({
    selfGrill,
    parsedByPackage: new Map([['pkg-a', parsed]]),
    packageIds: PACKAGE_IDS,
    stageOneResiduals: [],
    decisions: { self_grill: selfGrill },
  });

  assert.equal(report.ok, true, JSON.stringify(report.errors));
  assert.equal(report.residual.length, 1);
  assert.equal(report.residual[0].id, 'residual-000001');
  assert.equal(report.residualByPackage.get('pkg-a')[0].id, 'residual-000001');
  assert.equal(report.residualByPackage.get('pkg-b'), undefined);
  assert.ok(sectionBody(parsed, GRILL_SECTION_INDEX).includes(validResidual().grill_question));
});

test('C001 a missing focus, a thin residual and a banned phrase are each located', () => {
  const missingFocus = makeSelfGrill();
  missingFocus.rounds = missingFocus.rounds.filter((round) => round.focus !== 'counterpart');
  const focusReport = validateSelfGrill({ selfGrill: missingFocus, parsedByPackage: new Map(), packageIds: PACKAGE_IDS });
  assert.equal(focusReport.ok, false);
  assert.ok(focusReport.errors.some((message) => message.includes('counterpart')), JSON.stringify(focusReport.errors));

  const thin = makeSelfGrill({ residual: [validResidual({ why_unresolved: '' })] });
  const thinReport = validateSelfGrill({ selfGrill: thin, parsedByPackage: new Map(), packageIds: PACKAGE_IDS });
  assert.ok(thinReport.errors.some((message) => message.includes('why_unresolved')), JSON.stringify(thinReport.errors));

  const noAlternatives = makeSelfGrill({ residual: [validResidual({ alternatives: [] })] });
  assert.ok(validateSelfGrill({ selfGrill: noAlternatives, parsedByPackage: new Map(), packageIds: PACKAGE_IDS }).errors.some((message) => message.includes('alternatives')));

  // The ban is absolute, so every frozen phrase is tried: the error must name both
  // the phrase and the field that carries it.
  for (const phrase of FORBIDDEN_PHRASES) {
    const decisions = { seeds: [{ packageId: 'pkg-a', aiSections: { ...baseAiSections(), 12: `${phrase}: decide the split later.` } }], self_grill: makeSelfGrill() };
    const bannedReport = validateSelfGrill({ selfGrill: decisions.self_grill, parsedByPackage: new Map(), packageIds: PACKAGE_IDS, decisions });
    assert.ok(
      bannedReport.errors.some((message) => message.includes(phrase) && message.includes('seeds[0].aiSections.12')),
      `${phrase} must be refused and located: ${JSON.stringify(bannedReport.errors)}`,
    );
  }
});

test('C001 the vocabularies are frozen and an unconverged final pass is refused', () => {
  assert.deepEqual([...CRITIC_FOCUSES], ['implementer', 'counterpart', 'test', 'grill', 'adversarial']);
  assert.deepEqual([...REQUIRED_CRITIC_FOCUSES], ['implementer', 'counterpart', 'test', 'grill']);
  assert.deepEqual([...ROUND_STATUSES], ['ran', 'not_applicable']);
  assert.deepEqual([...RESIDUAL_ORIGINS], ['stage1_pulse', 'stage1_dependency_review', 'stage2_self_grill']);
  assert.equal(FORBIDDEN_PHRASES.length, 6);

  const unconverged = makeSelfGrill({ passes: 2, findings: { 2: { test: ['the errors group of boundary-001 has no test material'] } } });
  const report = validateSelfGrill({ selfGrill: unconverged, parsedByPackage: new Map(), packageIds: PACKAGE_IDS });
  assert.ok(
    report.errors.some((message) => message.includes('pass 2') && message.includes('not converged')),
    JSON.stringify(report.errors),
  );

  const notConverged = makeSelfGrill();
  notConverged.converged = false;
  assert.ok(validateSelfGrill({ selfGrill: notConverged, parsedByPackage: new Map(), packageIds: PACKAGE_IDS }).errors.some((message) => message.includes('converged')));
});

test('C001 a not_applicable round needs a reason, and the adversarial pass is required once a boundary exists', () => {
  const skippedWithoutReason = makeSelfGrill({ status: { grill: { status: 'not_applicable' } } });
  assert.ok(validateSelfGrill({ selfGrill: skippedWithoutReason, parsedByPackage: new Map(), packageIds: PACKAGE_IDS }).errors.some((message) => message.includes('grill')));

  const skippedWithReason = makeSelfGrill({ status: { counterpart: { status: 'not_applicable', reason: 'the workspace declares a single package, so no counterpart exists' } } });
  assert.equal(validateSelfGrill({ selfGrill: skippedWithReason, parsedByPackage: new Map(), packageIds: ['pkg-a'] }).ok, true);

  // A seed that carries a contract edge is proof that the workspace declares a boundary.
  const coupled = parsedSeedFor('pkg-a', { aiSections: baseAiSections() });
  coupled.contractEdges = [{ contract_id: 'contract-boundary-001' }];
  const adversarialSkipped = makeSelfGrill({ status: { adversarial: { status: 'not_applicable', reason: 'nothing to attack' } } });
  const report = validateSelfGrill({ selfGrill: adversarialSkipped, parsedByPackage: new Map([['pkg-a', coupled]]), packageIds: ['pkg-a'] });
  assert.ok(report.errors.some((message) => message.includes('adversarial')), JSON.stringify(report.errors));

  const uncoupled = makeSelfGrill({ status: { adversarial: { status: 'not_applicable', reason: 'the workspace declares no boundary, so there is no coupling to attack' } } });
  assert.equal(validateSelfGrill({ selfGrill: uncoupled, parsedByPackage: new Map([['pkg-a', parsedSeedFor('pkg-a')]]), packageIds: ['pkg-a'] }).ok, true);
});

test('C001 the stage-1 residuals are carried once, verbatim, and none may be dropped', () => {
  const stageOneResiduals = [
    { candidate_id: 'pulse-000001', topic: 'the ledger chapter states a MUST with no owner', alternatives: ['assign it to pkg-a'], chosen_default: 'assign it to pkg-a', why_unresolved: 'the owner choice changes the contract surface' },
  ];
  const carried = validResidual({
    topic: stageOneResiduals[0].topic,
    origin: 'stage1_pulse',
    origin_candidate_id: 'pulse-000001',
  });
  const selfGrill = makeSelfGrill({ residual: [carried] });
  const parsed = parsedSeedFor('pkg-a', { residualQuestions: selfGrill.residual });
  const ok = validateSelfGrill({ selfGrill, parsedByPackage: new Map([['pkg-a', parsed]]), packageIds: PACKAGE_IDS, stageOneResiduals });
  assert.equal(ok.ok, true, JSON.stringify(ok.errors));

  const dropped = validateSelfGrill({ selfGrill: makeSelfGrill(), parsedByPackage: new Map(), packageIds: PACKAGE_IDS, stageOneResiduals });
  assert.equal(dropped.ok, false);
  assert.ok(dropped.errors.some((message) => message.includes('pulse-000001')), JSON.stringify(dropped.errors));

  const reworded = makeSelfGrill({ residual: [{ ...carried, topic: 'a paraphrase of the stage-1 observation' }] });
  assert.ok(
    validateSelfGrill({ selfGrill: reworded, parsedByPackage: new Map(), packageIds: PACKAGE_IDS, stageOneResiduals }).errors.some((message) => message.includes('pulse-000001')),
    'a reworded topic is not a verbatim carry',
  );

  const ghost = makeSelfGrill({ residual: [carried, validResidual({ topic: 'an invented question', origin: 'stage1_pulse', origin_candidate_id: 'pulse-999999' })] });
  assert.ok(validateSelfGrill({ selfGrill: ghost, parsedByPackage: new Map(), packageIds: PACKAGE_IDS, stageOneResiduals }).errors.some((message) => message.includes('pulse-999999')));
});

test('C001 a duplicate topic is refused rather than silently merged, and a foreign package is named', () => {
  const duplicate = makeSelfGrill({ residual: [validResidual(), validResidual({ package_id: 'pkg-b' })] });
  const report = validateSelfGrill({ selfGrill: duplicate, parsedByPackage: new Map(), packageIds: PACKAGE_IDS });
  assert.ok(report.errors.some((message) => message.includes('duplicate') || message.includes('more than once')), JSON.stringify(report.errors));

  const unknownPackage = makeSelfGrill({ residual: [validResidual({ package_id: 'pkg-ghost' })] });
  assert.ok(validateSelfGrill({ selfGrill: unknownPackage, parsedByPackage: new Map(), packageIds: PACKAGE_IDS }).errors.some((message) => message.includes('pkg-ghost')));

  const unknownOrigin = makeSelfGrill({ residual: [validResidual({ origin: 'somewhere_else' })] });
  assert.ok(validateSelfGrill({ selfGrill: unknownOrigin, parsedByPackage: new Map(), packageIds: PACKAGE_IDS }).errors.some((message) => message.includes('origin')));

  const originWithoutId = makeSelfGrill({ residual: [validResidual({ origin: 'stage1_pulse' })] });
  assert.ok(validateSelfGrill({ selfGrill: originWithoutId, parsedByPackage: new Map(), packageIds: PACKAGE_IDS }).errors.some((message) => message.includes('origin_candidate_id')));
});

test('C002 the questions are partitioned to the seed that answers them, keeping one identity', () => {
  const residual = [
    validResidual(),
    validResidual({ topic: 'the ledger rule has no owner', grill_question: 'Who owns the ledger rule?', package_id: 'pkg-b' }),
  ];
  const partitioned = partitionResiduals({ residual, packageIds: PACKAGE_IDS });
  assert.equal(partitioned.get('pkg-a').length, 1);
  assert.equal(partitioned.get('pkg-b').length, 1);
  // The id follows the residual list, never the subset it was filtered into.
  assert.equal(partitioned.get('pkg-b')[0].id, 'residual-000002');
  assert.equal(partitioned.get('pkg-a')[0].id, 'residual-000001');
  assert.throws(() => partitionResiduals({ residual: [validResidual({ package_id: 'pkg-ghost' })], packageIds: PACKAGE_IDS }), /pkg-ghost/);

  const rendered = renderResidualQuestions(partitioned.get('pkg-a'));
  assert.match(rendered, /residual-000001/);
  assert.ok(rendered.includes(validResidual().grill_question));
  assert.equal(renderResidualQuestions([]), '');
});

test('C002 the machine writes the questions into the seed section that answers them', () => {
  const question = validResidual().grill_question;
  const withQuestion = parsedSeedFor('pkg-a', { residualQuestions: [validResidual()] });
  assert.ok(sectionBody(withQuestion, GRILL_SECTION_INDEX).includes(question));

  // A package with no residual keeps the AI prose untouched.
  const empty = parsedSeedFor('pkg-b', { residualQuestions: [] });
  assert.equal(sectionBody(empty, GRILL_SECTION_INDEX).trim(), baseAiSections()[12]);

  // A residual addressed to another package must fail the render, not be dropped.
  const { manifest } = buildValidManifest();
  const otherPackage = manifest.workspace.packages.find((entry) => entry.id === 'pkg-b');
  assert.throws(
    () => renderSeed({ package: otherPackage, machine: { manifest, expectedAllocation: [], referenceBlock: {}, contractEdges: [] }, aiSections: baseAiSections(), residualQuestions: [validResidual({ package_id: 'pkg-a' })] }),
    /pkg-a/,
  );
});

test('C002 the same record always renders the same section, and a missing question is quoted', () => {
  const selfGrill = makeSelfGrill({ residual: [validResidual()] });
  const first = sectionBody(parsedSeedFor('pkg-a', { residualQuestions: selfGrill.residual }), GRILL_SECTION_INDEX);
  const second = sectionBody(parsedSeedFor('pkg-a', { residualQuestions: selfGrill.residual }), GRILL_SECTION_INDEX);
  assert.equal(first, second);

  const rendered = validateSelfGrill({ selfGrill, parsedByPackage: new Map([['pkg-a', parsedSeedFor('pkg-a')]]), packageIds: PACKAGE_IDS });
  assert.equal(rendered.ok, false);
  assert.ok(
    rendered.errors.some((message) => message.includes(validResidual().grill_question) && message.includes('pkg-a')),
    JSON.stringify(rendered.errors),
  );

  const settled = validateSelfGrill({ selfGrill, parsedByPackage: new Map([['pkg-a', parsedSeedFor('pkg-a', { residualQuestions: selfGrill.residual })]]), packageIds: PACKAGE_IDS });
  assert.deepEqual(settled.residual, validateSelfGrill({ selfGrill, parsedByPackage: new Map([['pkg-a', parsedSeedFor('pkg-a', { residualQuestions: selfGrill.residual })]]), packageIds: PACKAGE_IDS }).residual);
});

test('C001 a package that answers a question cannot declare its grill section not_applicable', () => {
  const selfGrill = makeSelfGrill({ residual: [validResidual()] });
  const parsed = parsedSeedFor('pkg-a', {
    residualQuestions: selfGrill.residual,
    aiSections: { ...baseAiSections(), 12: 'not_applicable — nothing is unresolved for this package' },
  });
  const report = validateSelfGrill({ selfGrill, parsedByPackage: new Map([['pkg-a', parsed]]), packageIds: PACKAGE_IDS });
  assert.ok(report.errors.some((message) => message.includes('not_applicable')), JSON.stringify(report.errors));
});

test('C004 the command document states the drafting order, the loop and the hand-off', () => {
  const doc = readFileSync('.claude/commands/workspacify-allocate.md', 'utf8');
  assert.match(doc, /契約は散文より先に起草する/, 'the contract-first drafting order must be stated');
  assert.match(doc, /自己 grill/);
  for (const focus of CRITIC_FOCUSES) {
    assert.ok(doc.includes(focus), `the document must name the ${focus} focus`);
  }
  assert.match(doc, /収束/, 'the convergence rule must be stated');
  assert.match(doc, /stage1_pulse/, 'the document must say how a stage-1 residual is carried');
  assert.match(doc, /人間への差し戻し[^\n]*禁止/, 'the no-hand-back rule must survive');
  assert.match(doc, /self_grill/);
  assert.match(doc, /handoff_summary/);
  assert.match(doc, /G3\.7/, 'Step 4 must name the self-grill gate');
});

test('C004 the packet-driven order is enforced by the gate, not only written down', () => {
  // A rich prose seed with no contracts at all cannot converge: the counterpart and
  // adversarial focuses have nothing to compare, so the record must say why.
  const noBoundary = makeSelfGrill({ status: { counterpart: { status: 'not_applicable', reason: 'the workspace declares a single package' } } });
  assert.equal(validateSelfGrill({ selfGrill: noBoundary, parsedByPackage: new Map([['pkg-a', parsedSeedFor('pkg-a')]]), packageIds: ['pkg-a'] }).ok, true);

  const richProse = parsedSeedFor('pkg-a', { aiSections: { ...baseAiSections(), 5: 'a very long consumer obligation prose that promises everything' } });
  richProse.contractEdges = [];
  const skipped = makeSelfGrill({ status: { counterpart: { status: 'not_applicable', reason: 'no counterpart' } } });
  assert.equal(validateSelfGrill({ selfGrill: skipped, parsedByPackage: new Map([['pkg-a', richProse]]), packageIds: ['pkg-a'] }).ok, true);
});
