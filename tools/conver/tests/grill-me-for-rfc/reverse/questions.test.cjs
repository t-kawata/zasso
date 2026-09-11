// [::TICKET::] P22-13 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-13 --for-spec --no-implementation-order`.
// P22-13 @verifies C001
/**
 * G1 to G3 — the reverse grill's question generation.
 *
 * The failure this suite exists to prevent is the ratification RFC (ABOUT-REVERSE
 * 3.4): a document that restates the existing implementation in the language of a
 * specification. Every check here is therefore about the machine's contribution
 * being forced rather than requested — the intent-or-accident question is counted
 * against the unresolved claim set, never against a literal, and the questions the
 * machine emits are put through the same format gate the command has always used.
 *
 * The seed input is built by the P22-12 renderer rather than written by hand. No
 * RFC-SEED.md exists on disk, so a hand-written seed would prove nothing about the
 * parser that has to read the real one.
 *
 * Run: node --test 'tests/grill-me-for-rfc/**\/*.test.cjs'
 */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

const {
  INTENT_OR_ACCIDENT_DEFAULT,
  OPTION_IDS,
  QUESTION_KINDS,
  FREE_FORM_PATTERNS,
  carryResidualsVerbatim,
  generateReverseQuestions,
  renderGrillQuestions,
  renderUnaskedReport,
  reverseIndexOf,
} = require('../../../.claude/scripts/grill-me-for-rfc/reverse-questions.js');

const { renderSeed } = require('../../../.claude/scripts/workspacify-allocate/lib/seed-render.mjs');
const { parseSeed } = require('../../../.claude/scripts/workspacify-allocate/lib/seed-parse.mjs');
const { SEED_REQUIRED_SECTIONS } = require('../../../.claude/scripts/workspacify-allocate/lib/seed-model.mjs');
const { sidecarReference } = require('../../../.claude/scripts/workspacify-allocate/lib/forward-extensions.mjs');
const { buildValidManifest, baseAiSections } = require('../../workspacify-allocate/helpers/build-valid-manifest.mjs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const CLI_PATH = path.join(PROJECT_ROOT, '.claude', 'scripts', 'grill-me-for-rfc', 'reverse-questions.js');

/** One representative reverse index entry: the shape ABOUT-REVERSE 6.12.3 declares. */
const REVERSE_INDEX = Object.freeze([
  {
    claim_id: 'clm-authz-delete-tenant-001',
    residual_id: 'residual-000001',
    scope_ref: 'SCOPE-BOUNDARY.json',
    risk_class: 'security-critical',
  },
]);

/**
 * A real reverse seed, rendered by the stage-two renderer.
 *
 * The residual questions ride inside section 12, which is where the machine
 * appends them — so the seed this suite reads carries the same two sources of
 * question material a published seed carries.
 */
function reverseSeed({ reverseIndex = REVERSE_INDEX, residualQuestions = [] } = {}) {
  const { manifest } = buildValidManifest();
  const pkg = manifest.workspace.packages[0];
  const referenceBlock = {
    package: { id: pkg.id, name: pkg.name, path: pkg.path },
    source_spec: { path: 'spec.md', sha256: manifest.input.source_hash },
    stage1_manifest: { path: 'WORKSPACIFY-TREE-MANIFEST.json', hash: manifest.integrity.manifest_hash },
  };
  const { seedText } = renderSeed({
    package: pkg,
    machine: {
      manifest,
      expectedAllocation: [],
      referenceBlock,
      contractEdges: [],
      mode: 'reverse',
      reverseIndex,
      sidecarReference: sidecarReference({ bundleHash: 'sha256:aa', counts: { claims: 1 } }),
    },
    aiSections: baseAiSections(),
    residualQuestions,
  });
  return seedText;
}

/** An unresolved claim, as P22-5's ledger emits one: classification plus the question it owes. */
function unresolvedClaim(overrides = {}) {
  return {
    claim_id: 'clm-authz-delete-tenant-001',
    claim_type: 'unresolved',
    statement: 'DeleteSession requires that principal.tenant_id equals session.tenant_id.',
    scope: { commit: 'abc1234', environments: ['test'] },
    evidence: [{ source_span: { file: 'src/authz.rs', line: 42 }, evidence_mode: 'source_static' }],
    grill_question: 'Which tenant-deletion policy is intended: A strict tenant match, or B an audited administrator override?',
    ...overrides,
  };
}

/** A residual as the stage-1 hand-off carries it. */
function stageOneResidual(overrides = {}) {
  return {
    candidate_id: 'residual-000001',
    topic: 'Cross-tenant session deletion authorization rule',
    alternatives: ['Require principal.tenant_id === session.tenant_id.', 'Permit deletion when an administrative role is present.'],
    chosen_default: { alternative_id: 'A' },
    why_unresolved: 'Observed code, tests and traces disagree on whether administrative override is intentional.',
    grill_question: 'Which tenant-deletion policy is intended: A strict tenant match, or B an audited administrator override?',
    package_id: 'pkg-a',
    origin: 'stage1_dependency_review',
    origin_candidate_id: 'residual-000001',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// C001 precondition — the seed carries a reverse index in section 1
// ---------------------------------------------------------------------------

test('C001 precondition: the reverse index is read from section 1 of a real rendered seed', () => {
  const seedText = reverseSeed();
  const parsed = parseSeed(seedText);

  assert.equal(parsed.headings.length, SEED_REQUIRED_SECTIONS.length);
  assert.equal(parsed.headings.length, 14, 'the reverse index rides inside section 1; a fifteenth heading would break the forward rotation');
  assert.equal(parsed.headings.some((heading) => heading.index === 15), false);
  assert.deepEqual(reverseIndexOf(parsed), REVERSE_INDEX);

  const { questions } = generateReverseQuestions({ seedText, claims: [unresolvedClaim()] });
  assert.ok(questions.length > 0, 'a seed carrying a reverse index yields questions');
});

test('C001 precondition: a seed whose section 1 carries no reverse index is refused by name', () => {
  const forwardSeed = reverseSeed({ reverseIndex: null });
  assert.equal(reverseIndexOf(parseSeed(forwardSeed)), null);
  assert.throws(
    () => generateReverseQuestions({ seedText: forwardSeed, claims: [unresolvedClaim()] }),
    /does not carry a reverse_index/,
  );
});

// ---------------------------------------------------------------------------
// C001 postcondition + G2 — the forced intent-or-accident question
// ---------------------------------------------------------------------------

test('C001 postcondition: every unresolved claim is asked whether the behaviour is intended or accidental', () => {
  const claims = [
    unresolvedClaim({ claim_id: 'clm-a' }),
    unresolvedClaim({ claim_id: 'clm-b' }),
    { claim_id: 'clm-c', claim_type: 'inferred', statement: 'the guard is read from the config', basis: ['src/x.rs:1'] },
  ];
  const unresolved = claims.filter((claim) => claim.claim_type === 'unresolved');
  const { questions } = generateReverseQuestions({ seedText: reverseSeed(), claims });

  for (const claim of unresolved) {
    const asked = questions.find(
      (question) => question.question_kind === QUESTION_KINDS.intentOrAccident && question.claim_id === claim.claim_id,
    );
    assert.ok(asked, `every unresolved claim is asked whether the behaviour is intended or accidental: ${claim.claim_id}`);
    assert.equal(asked.options.length, 3);
    assert.deepEqual(asked.options.map((option) => option.id), [...OPTION_IDS]);
    assert.ok(asked.grill_question.length > 0, 'an unresolved claim receives a grill_question');
  }

  assert.equal(
    questions.filter((question) => question.question_kind === QUESTION_KINDS.intentOrAccident).length,
    unresolved.length,
    'the count is compared against the claim set, not against a literal',
  );
  assert.equal(
    questions.some((question) => question.claim_id === 'clm-c'),
    false,
    'a claim that is already classified is not re-opened by the ratification guard',
  );
});

test('G2: the intent-or-accident question carries the claim question verbatim and states both answers', () => {
  const claim = unresolvedClaim();
  const { questions } = generateReverseQuestions({ seedText: reverseSeed(), claims: [claim] });
  const asked = questions.find((question) => question.claim_id === claim.claim_id);

  assert.equal(asked.carried_grill_question, claim.grill_question);
  assert.equal(asked.statement, claim.statement);
  const statements = asked.options.map((option) => option.statement).join(' ');
  assert.match(statements, /[Ii]ntended/, 'the answer "it is intended" is offered');
  assert.match(statements, /[Aa]ccidental/, 'the answer "it is accidental" is offered');
  assert.match(statements, /[Uu]ndecided/, 'the answer "no decision was made" is offered');
});

test('G2 invariant: the forced default is the answer that records the absence of a decision', () => {
  const { questions } = generateReverseQuestions({ seedText: reverseSeed(), claims: [unresolvedClaim()] });
  const asked = questions.find((question) => question.question_kind === QUESTION_KINDS.intentOrAccident);

  assert.equal(asked.chosen_default, INTENT_OR_ACCIDENT_DEFAULT);
  assert.equal(asked.chosen_default, 'C', 'a default answering A would manufacture intent and one answering B an accident');
  assert.equal(asked.recommendation, INTENT_OR_ACCIDENT_DEFAULT);
  assert.ok(asked.recommendation_reason.length > 0, 'a recommendation without reasoning is forbidden by the command');
});

// ---------------------------------------------------------------------------
// C001 invariant — options and defaults are always supplied, prose never demanded
// ---------------------------------------------------------------------------

test('C001 invariant: every generated question supplies options and a default, and demands no prose', () => {
  const { questions } = generateReverseQuestions({
    seedText: reverseSeed(),
    claims: [unresolvedClaim()],
    residuals: [stageOneResidual()],
  });

  assert.ok(questions.length >= 2);
  for (const question of questions) {
    assert.ok(question.options.length >= 2, 'a question with no options demands prose');
    assert.ok(
      question.options.every((option) => typeof option.statement === 'string' && option.statement.trim().length > 0),
      `${question.question_id} carries an empty option`,
    );
    assert.ok(question.options.every((option) => OPTION_IDS.includes(option.id)));
    assert.ok(OPTION_IDS.includes(question.chosen_default), `${question.question_id} supplies no default the pipeline can adopt`);
    assert.equal(
      FREE_FORM_PATTERNS.some((pattern) => pattern.test(question.grill_question)),
      false,
      `${question.question_id} asks for free-form prose`,
    );
    assert.ok(question.grill_question.trim().length > 0);
  }
});

test('C001 invariant: question ids are unique within a turn', () => {
  const { questions } = generateReverseQuestions({
    seedText: reverseSeed(),
    claims: [unresolvedClaim({ claim_id: 'clm-a' }), unresolvedClaim({ claim_id: 'clm-b' })],
    residuals: [stageOneResidual()],
  });
  const ids = questions.map((question) => question.question_id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, ['Q1', 'Q2', 'Q3']);
});

// ---------------------------------------------------------------------------
// G3 — the residual carry-over is verbatim
// ---------------------------------------------------------------------------

test('G3: a carried residual reaches the grill verbatim', () => {
  const upstream = [stageOneResidual()];
  const carried = carryResidualsVerbatim(upstream, upstream);

  assert.equal(carried.residual.length, 1);
  assert.equal(carried.residual[0].topic, upstream[0].topic);
  assert.equal(carried.residual[0].grill_question, upstream[0].grill_question);
  assert.equal(carried.residual[0].origin_candidate_id, upstream[0].origin_candidate_id);
});

test('G3: a reworded residual is refused by name rather than quietly accepted', () => {
  const upstream = [stageOneResidual()];

  assert.throws(
    () => carryResidualsVerbatim([{ ...upstream[0], topic: 'reworded topic' }], upstream),
    /must carry the topic of residual-000001 verbatim/,
  );
  assert.throws(
    () => carryResidualsVerbatim([{ ...upstream[0], grill_question: 'reworded question' }], upstream),
    /must carry the grill_question of residual-000001 verbatim/,
  );
  assert.throws(
    () => carryResidualsVerbatim([], upstream),
    /is not carried into the reverse grill: every unresolved question must reach it verbatim/,
  );
});

test('G3: the hand-off is enforced on the generation path, so a reworded residual never becomes a question', () => {
  const upstream = [stageOneResidual()];
  const reworded = [{ ...upstream[0], topic: 'reworded topic' }];

  assert.throws(
    () => generateReverseQuestions({ seedText: reverseSeed(), claims: [], residuals: reworded, stageOneResiduals: upstream }),
    /must carry the topic of residual-000001 verbatim/,
  );
  assert.throws(
    () => generateReverseQuestions({ seedText: reverseSeed(), claims: [], residuals: [], stageOneResiduals: upstream }),
    /is not carried into the reverse grill/,
  );

  const verbatim = generateReverseQuestions({
    seedText: reverseSeed(),
    claims: [],
    residuals: upstream,
    stageOneResiduals: upstream,
  });
  assert.equal(verbatim.questions.length, 1);
  assert.equal(verbatim.questions[0].carried_grill_question, upstream[0].grill_question);
});

test('G3: a hand-off that carries no candidates asks nothing of the run', () => {
  const { questions } = generateReverseQuestions({
    seedText: reverseSeed(),
    claims: [],
    residuals: [stageOneResidual()],
    stageOneResiduals: [],
  });
  assert.equal(questions.length, 1, 'an empty hand-off is not a hand-off, so the carry is not enforced against it');
});

test('G3: crossing the boundary from the seed to a residual question keeps the original question', () => {
  const residual = stageOneResidual();
  const { questions } = generateReverseQuestions({ seedText: reverseSeed(), claims: [], residuals: [residual] });
  const asked = questions.find((question) => question.question_kind === QUESTION_KINDS.residualAnswer);

  assert.ok(asked);
  assert.equal(asked.residual_id, residual.origin_candidate_id);
  assert.equal(asked.carried_grill_question, residual.grill_question);
  assert.equal(asked.topic, residual.topic);
  assert.equal(asked.chosen_default, residual.chosen_default.alternative_id);
});

// ---------------------------------------------------------------------------
// UT-6 / UT-7 — reported, not skipped; and a run with nothing to ask
// ---------------------------------------------------------------------------

test('UT-6: a claim no question can be generated for is reported with its reason', () => {
  const broken = { claim_id: 'clm-empty', claim_type: 'unresolved', statement: '' };
  const { questions, unasked, report } = generateReverseQuestions({
    seedText: reverseSeed(),
    claims: [unresolvedClaim(), broken],
  });

  assert.equal(questions.filter((question) => question.claim_id === 'clm-empty').length, 0);
  assert.equal(unasked.length, 1);
  assert.equal(unasked[0].claim_id, 'clm-empty');
  assert.ok(unasked[0].reason.length > 0);
  assert.match(report, /clm-empty/);
  assert.match(renderUnaskedReport(unasked), /clm-empty/);
});

test('UT-6 boundary: a residual with more alternatives than the closed answer vocabulary is reported', () => {
  const overflowing = stageOneResidual({
    alternatives: ['first', 'second', 'third', 'fourth'],
  });
  const { unasked } = generateReverseQuestions({ seedText: reverseSeed(), claims: [], residuals: [overflowing] });

  assert.equal(unasked.length, 1);
  assert.match(unasked[0].reason, /more alternatives than the grill's closed answer vocabulary/);
});

test('UT-7: a run with nothing to ask completes without error and states that there were none', () => {
  const { questions, unasked, report } = generateReverseQuestions({ seedText: reverseSeed(), claims: [], residuals: [] });

  assert.deepEqual(questions, []);
  assert.deepEqual(unasked, []);
  assert.match(report, /there were no unresolved claims and no residuals to ask about/);
  assert.equal(typeof report, 'string');
  assert.equal(
    /succeed|fail/i.test(report),
    false,
    'the machine says proved or not proved; succeeded and failed are not in its vocabulary',
  );
});

test('UT-7: the report of a run with questions states the counts rather than a verdict', () => {
  const { report } = generateReverseQuestions({
    seedText: reverseSeed(),
    claims: [unresolvedClaim()],
    residuals: [stageOneResidual()],
  });
  assert.match(report, /2 question/);
  assert.equal(/succeed|fail/i.test(report), false);
});

// ---------------------------------------------------------------------------
// UT-12 — rendering is separated from generation, and the rendered form passes the gate
// ---------------------------------------------------------------------------

test('UT-12: generation produces a structure without producing a document', () => {
  const { questions } = generateReverseQuestions({ seedText: reverseSeed(), claims: [unresolvedClaim()] });
  assert.equal(typeof questions[0], 'object');
  assert.equal(typeof questions[0].grill_question, 'string');
  assert.equal(questions[0].question_id, 'Q1');
});

test('UT-12: every rendered question block is accepted by the format gate the command already enforces', () => {
  const { questions } = generateReverseQuestions({
    seedText: reverseSeed(),
    claims: [unresolvedClaim()],
    residuals: [stageOneResidual()],
  });
  const markdown = renderGrillQuestions(questions);

  assert.match(markdown, /\bQ1\b/);
  assert.match(markdown, /^A\)/m, 'each choice is on its own line');
  assert.equal(
    /^#{1,6} /m.test(markdown),
    false,
    'no RFC prose is written during the grill: the renderer emits questions only',
  );

  const blocks = markdown.split(/\n\n(?=Q\d+ )/);
  assert.equal(blocks.length, questions.length);
  for (const block of blocks) {
    const checked = spawnSync(
      process.execPath,
      [path.join(PROJECT_ROOT, '.claude', 'scripts', 'grill-me-for-rfc', 'validate-question-format.js'), block],
      { encoding: 'utf8' },
    );
    assert.equal(checked.status, 0, `validate-question-format.js refused a generated question: ${checked.stdout}`);
  }
});

test('UT-12: the rendered questions name the claim they came from, so a reader can go and look', () => {
  const claim = unresolvedClaim();
  const { questions } = generateReverseQuestions({ seedText: reverseSeed(), claims: [claim] });
  const markdown = renderGrillQuestions(questions);
  assert.match(markdown, new RegExp(claim.claim_id));
});

// ---------------------------------------------------------------------------
// The CLI — the path the command actually runs, which the library API does not cover
// ---------------------------------------------------------------------------

test('CLI: a seed and a ledger on disk produce the questions, from either ledger shape', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'p22-13-questions-'));
  try {
    const seedPath = path.join(dir, 'RFC-SEED.md');
    const claimsPath = path.join(dir, 'claims.json');
    const residualsPath = path.join(dir, 'residuals.json');
    writeFileSync(seedPath, reverseSeed());
    // An object carrying the array, which is how a sidecar is shaped…
    writeFileSync(claimsPath, JSON.stringify({ claims: [unresolvedClaim()] }));
    // …and the array itself, which is how a dumped ledger is shaped.
    writeFileSync(residualsPath, JSON.stringify([stageOneResidual()]));

    const run = spawnSync(
      process.execPath,
      [CLI_PATH, seedPath, `--claims=${claimsPath}`, `--residuals=${residualsPath}`],
      { encoding: 'utf8' },
    );

    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /\bQ1\b/);
    assert.match(run.stdout, /\bQ2\b/);
    assert.match(run.stdout, /This run put 2 question/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: the stage-one hand-off is read and enforced, and a divergence stops the run', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'p22-13-stage-one-'));
  try {
    const seedPath = path.join(dir, 'RFC-SEED.md');
    const residual = stageOneResidual();
    const residualsPath = path.join(dir, 'residuals.json');
    const stageOnePath = path.join(dir, 'stage-one.json');
    const rewordedPath = path.join(dir, 'reworded.json');
    writeFileSync(seedPath, reverseSeed());
    writeFileSync(residualsPath, JSON.stringify([residual]));
    // The hand-off sidecar carries the array under the flag's key; a dumped ledger is the array itself.
    writeFileSync(stageOnePath, JSON.stringify({ stage_one: [residual] }));
    writeFileSync(rewordedPath, JSON.stringify([{ ...residual, topic: 'reworded topic' }]));

    const accepted = spawnSync(
      process.execPath,
      [CLI_PATH, seedPath, `--residuals=${residualsPath}`, `--stage-one=${stageOnePath}`],
      { encoding: 'utf8' },
    );
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.match(accepted.stdout, /\bQ1\b/);

    const refused = spawnSync(
      process.execPath,
      [CLI_PATH, seedPath, `--residuals=${rewordedPath}`, `--stage-one=${stageOnePath}`],
      { encoding: 'utf8' },
    );
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /must carry the topic of residual-000001 verbatim/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: a seed that is not a reverse seed is refused, and the reason names the missing index', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'p22-13-forward-seed-'));
  try {
    const seedPath = path.join(dir, 'RFC-SEED.md');
    writeFileSync(seedPath, reverseSeed({ reverseIndex: null }));

    const run = spawnSync(process.execPath, [CLI_PATH, seedPath], { encoding: 'utf8' });

    assert.equal(run.status, 1);
    assert.match(run.stderr, /does not carry a reverse_index/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
