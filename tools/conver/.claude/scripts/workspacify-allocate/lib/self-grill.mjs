// [::TICKET::] PX-201 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-201 --for-spec --no-implementation-order`.
// PX-201 @verifies C001 C002
/**
 * The self-grill loop.
 *
 * Seed quality is decided by adversarial review, and that review is the AI's own
 * work: it drafts the coupling contracts first, cross-checks them against the
 * counterpart seed, then runs four critic passes plus an adversarial one until a
 * pass adds nothing new. The machine never grades a finding - it proves the loop
 * ran (focus coverage), that it converged (the last pass found nothing), that every
 * residual is shaped, and that every residual question reaches the seed that must
 * answer it. Nothing here may ask a human anything: the canonical grill runs later,
 * by hand, on the published seeds.
 */
import { WorkSpacifyTreeError } from '../../workspacify-tree/lib/errors.mjs';
import { FORBIDDEN_PHRASES } from '../../workspacify-tree/lib/spec-defects.mjs';

/** The closed critic vocabulary, in the order the loop runs it. */
export const CRITIC_FOCUSES = Object.freeze(['implementer', 'counterpart', 'test', 'grill', 'adversarial']);

/** The focuses every workspace must run, whatever its shape. */
export const REQUIRED_CRITIC_FOCUSES = Object.freeze(CRITIC_FOCUSES.filter((focus) => focus !== 'adversarial'));

/** The pass that attacks the coupling itself; required once a boundary exists. */
export const ADVERSARIAL_FOCUS = 'adversarial';

/** How a round can end. */
export const ROUND_STATUSES = Object.freeze(['ran', 'not_applicable']);

/** Where a residual question came from. */
export const RESIDUAL_ORIGINS = Object.freeze(['stage1_pulse', 'stage1_dependency_review', 'stage2_self_grill']);

/** Section whose body answers the residuals: "Grill Questions and Explicitly Unresolved Design Choices". */
export const GRILL_QUESTION_SECTION_INDEX = 12;

/** Heading of the machine-appended block inside that section. */
export const RESIDUAL_QUESTIONS_HEADING = '### Grill questions carried into this seed';

/** A residual authored in this session is the only origin without a stage-1 candidate. */
const AUTHORED_ORIGIN = 'stage2_self_grill';

/** Free-text fields a residual must state. */
const RESIDUAL_TEXT_FIELDS = ['topic', 'chosen_default', 'why_unresolved', 'grill_question'];

/** Canonical id of the nth residual: the record order is the identity. */
export function residualIdAt(index) {
  return `residual-${String(index + 1).padStart(6, '0')}`;
}

/**
 * Validate the self-grill record of one decisions payload.
 *
 * Called twice per run: before rendering, with the seeds not yet parsed, the shape
 * of the record is checked; after rendering, with the parsed seeds, the questions
 * are also proven to have reached the seed that answers them.
 *
 * @param {{ selfGrill?: object, parsedByPackage?: Map<string, object>, packageIds?: string[], stageOneResiduals?: Array<object>, decisions?: object }} input
 * @returns {{ ok: boolean, errors: string[], residual: Array<object>, residualByPackage: Map<string, Array<object>> }}
 */
export function validateSelfGrill({
  selfGrill,
  parsedByPackage = new Map(),
  packageIds = [],
  stageOneResiduals = [],
  decisions,
} = {}) {
  const errors = [];
  errors.push(...validateRounds({ selfGrill, parsedByPackage }));
  const residual = withResidualIds(Array.isArray(selfGrill?.residual) ? selfGrill.residual : []);
  errors.push(...validateResidualShape({ residual, packageIds, stageOneResiduals }));
  if (parsedByPackage.size > 0) {
    errors.push(...validateSectionParity({ residual, parsedByPackage }));
  }
  if (decisions !== undefined) {
    errors.push(...rejectExternalPhrasing(decisions));
  }
  return { ok: errors.length === 0, errors, residual, residualByPackage: groupByPackage(residual) };
}

/**
 * Split the residual list by the package whose seed must answer each question.
 *
 * @param {{ residual?: Array<object>, packageIds?: string[] }} input
 * @returns {Map<string, Array<object>>} residual questions per package
 * @throws {WorkSpacifyTreeError} gateId "G3.7" on a residual addressed outside the catalog
 */
export function partitionResiduals({ residual = [], packageIds = [] }) {
  const known = new Set(packageIds);
  for (const entry of withResidualIds(residual)) {
    if (!known.has(entry.package_id)) {
      throw new WorkSpacifyTreeError(
        `${entry.id} is addressed to ${entry.package_id}, which is not a package of this workspace`,
        { gateId: 'G3.7' },
      );
    }
  }
  return groupByPackage(withResidualIds(residual));
}

/**
 * Render the machine-appended grill questions of one section.
 *
 * @param {Array<object>} residualQuestions - the questions addressed to this seed
 * @returns {string} markdown block, or an empty string when the seed answers none
 */
export function renderResidualQuestions(residualQuestions = []) {
  if (residualQuestions.length === 0) {
    return '';
  }
  const lines = [
    RESIDUAL_QUESTIONS_HEADING,
    '',
    'These questions come from the self-grill loop and from the stage-1 hand-off. Each one is',
    'answered during the canonical per-directory grill, by hand, after publication; they are not',
    'addressed to the operator of this command.',
    '',
  ];
  residualQuestions.forEach((entry, index) => {
    const id = entry.id ?? residualIdAt(index);
    lines.push(`- **${id}** ${entry.grill_question}`);
    lines.push(`  - topic: ${entry.topic}`);
    lines.push(`  - alternatives: ${(entry.alternatives ?? []).join(' / ')}`);
    lines.push(`  - chosen default: ${entry.chosen_default}`);
    lines.push(`  - why unresolved: ${entry.why_unresolved}`);
  });
  return lines.join('\n');
}

/** Attach the canonical id to every residual of the record. */
function withResidualIds(residual) {
  return residual.map((entry, index) => ({ ...entry, id: entry.id ?? residualIdAt(index) }));
}

/** Group residual entries by the package that carries them. */
function groupByPackage(residual) {
  const byPackage = new Map();
  for (const entry of residual) {
    byPackage.set(entry.package_id, [...(byPackage.get(entry.package_id) ?? []), entry]);
  }
  return byPackage;
}

/**
 * Prove the loop ran: every focus has exactly one round per pass, the record claims
 * convergence and the last pass earned it.
 */
function validateRounds({ selfGrill, parsedByPackage }) {
  const errors = [];
  if (selfGrill === null || typeof selfGrill !== 'object') {
    return ['self_grill is missing: the decisions payload must record the critic loop'];
  }
  const passes = selfGrill.passes;
  if (!Number.isInteger(passes) || passes < 1) {
    errors.push('self_grill.passes must be a positive integer');
  }
  if (selfGrill.converged !== true) {
    errors.push('self_grill.converged must be true: the loop is only finished when a pass adds nothing new');
  }
  const rounds = Array.isArray(selfGrill.rounds) ? selfGrill.rounds : [];
  if (rounds.length === 0) {
    return errors.concat('self_grill.rounds is empty: the loop must record what each focus examined');
  }

  for (const focus of CRITIC_FOCUSES) {
    if (!rounds.some((round) => round?.focus === focus)) {
      errors.push(`self_grill.rounds does not cover the ${focus} focus: run it or record it as not_applicable with a reason`);
    }
  }
  for (const round of rounds) {
    errors.push(...validateRound(round));
  }

  if (Number.isInteger(passes)) {
    const finalRounds = rounds.filter((round) => round?.pass === passes);
    for (const round of finalRounds) {
      if (Array.isArray(round.findings) && round.findings.length > 0) {
        errors.push(`pass ${passes} (${round.focus}) is not converged: it still lists ${round.findings.length} new finding(s)`);
      }
    }
    errors.push(...validateAdversarialPass({ rounds, passes, parsedByPackage }));
  }
  return errors;
}

/** One round: a known focus, a known status, and a reason wherever it did not run. */
function validateRound(round) {
  const errors = [];
  const label = `self_grill.rounds ${round?.focus ?? '?'} (pass ${round?.pass ?? '?'})`;
  if (!CRITIC_FOCUSES.includes(round?.focus)) {
    return [`${label} names an unknown focus: use one of ${CRITIC_FOCUSES.join(', ')}`];
  }
  if (!ROUND_STATUSES.includes(round.status)) {
    errors.push(`${label} has the unknown status "${round.status}": use ${ROUND_STATUSES.join(' or ')}`);
  }
  if (!Array.isArray(round.findings)) {
    errors.push(`${label} must list its findings as an array, empty when the focus found nothing`);
  } else {
    for (const finding of round.findings) {
      if (typeof finding !== 'string' || finding.trim().length === 0) {
        errors.push(`${label} has a finding that is not a sentence`);
      }
    }
  }
  if (round.status === 'not_applicable') {
    if (typeof round.reason !== 'string' || round.reason.trim().length === 0) {
      errors.push(`${label} is not_applicable without a reason: say why the focus does not apply`);
    }
    if (Array.isArray(round.findings) && round.findings.length > 0) {
      errors.push(`${label} did not run but still lists findings`);
    }
  }
  return errors;
}

/**
 * The adversarial pass attacks the coupling, so a workspace that declares a boundary
 * cannot skip it; a workspace with no boundary records why it does not apply.
 */
function validateAdversarialPass({ rounds, passes, parsedByPackage }) {
  const hasBoundary = [...parsedByPackage.values()].some((parsed) => (parsed?.contractEdges ?? []).length > 0);
  if (!hasBoundary) {
    return [];
  }
  const finalRound = rounds.find((round) => round?.focus === ADVERSARIAL_FOCUS && round?.pass === passes);
  if (finalRound && finalRound.status !== 'ran') {
    return [`self_grill.rounds ${ADVERSARIAL_FOCUS} (pass ${passes}) is not_applicable while the workspace declares a boundary: attack the coupling and record what you found`];
  }
  return [];
}

/** Every residual is shaped, addressed to a real seed, and carried exactly once. */
function validateResidualShape({ residual, packageIds, stageOneResiduals }) {
  const errors = [];
  const knownPackages = new Set(packageIds);
  const topics = new Map();

  residual.forEach((entry) => {
    const label = entry.id;
    for (const field of RESIDUAL_TEXT_FIELDS) {
      if (typeof entry[field] !== 'string' || entry[field].trim().length === 0) {
        errors.push(`${label} requires the ${field} field`);
      }
    }
    if (!Array.isArray(entry.alternatives) || entry.alternatives.length === 0 || entry.alternatives.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
      errors.push(`${label} requires a non-empty alternatives list: the grill needs to see what else was considered`);
    }
    if (!knownPackages.has(entry.package_id)) {
      errors.push(`${label} is addressed to ${entry.package_id}, which is not a package of this workspace`);
    }
    if (!RESIDUAL_ORIGINS.includes(entry.origin)) {
      errors.push(`${label} states the unknown origin "${entry.origin}": use one of ${RESIDUAL_ORIGINS.join(', ')}`);
    }
    if (entry.origin !== AUTHORED_ORIGIN && (typeof entry.origin_candidate_id !== 'string' || entry.origin_candidate_id.trim().length === 0)) {
      errors.push(`${label} originates from stage 1 and requires the origin_candidate_id field`);
    }
    const topicKey = normalizeTopic(entry.topic);
    if (topics.has(topicKey)) {
      errors.push(`${label} is a duplicate: the topic "${entry.topic}" is already recorded by ${topics.get(topicKey)}`);
    }
    topics.set(topicKey, label);
  });

  errors.push(...validateStageOneCarry({ residual, stageOneResiduals }));
  return errors;
}

/**
 * A residual the AI could not settle in stage 1 must arrive here verbatim: the same
 * candidate id, the same topic. Rewording it would lose the observation.
 */
function validateStageOneCarry({ residual, stageOneResiduals }) {
  const errors = [];
  const byCandidateId = new Map((stageOneResiduals ?? []).map((entry) => [entry.candidate_id, entry]));
  const carried = new Set();
  for (const entry of residual) {
    if (entry.origin === AUTHORED_ORIGIN) {
      continue;
    }
    const candidateId = entry.origin_candidate_id;
    const source = byCandidateId.get(candidateId);
    if (!source) {
      errors.push(`${entry.id} claims the stage-1 candidate ${candidateId}, which the stage-1 hand-off does not carry`);
      continue;
    }
    carried.add(candidateId);
    if (entry.topic !== source.topic) {
      errors.push(`${entry.id} must carry the topic of ${candidateId} verbatim; the stage-1 topic is "${source.topic}"`);
    }
  }
  for (const candidateId of byCandidateId.keys()) {
    if (!carried.has(candidateId)) {
      errors.push(`the stage-1 residual ${candidateId} is not carried into self_grill.residual: every unresolved stage-1 question must reach a seed`);
    }
  }
  return errors;
}

/** Every question appears in the grill section of the seed that answers it. */
function validateSectionParity({ residual, parsedByPackage }) {
  const errors = [];
  for (const entry of residual) {
    const parsed = parsedByPackage.get(entry.package_id);
    if (!parsed) {
      errors.push(`${entry.id} is addressed to ${entry.package_id}, whose seed was not parsed`);
      continue;
    }
    const body = parsed.headings.find((heading) => heading.index === GRILL_QUESTION_SECTION_INDEX)?.body ?? '';
    if (!body.includes(entry.grill_question)) {
      errors.push(`the grill question of ${entry.id} does not appear in section ${GRILL_QUESTION_SECTION_INDEX} of ${entry.package_id}: "${entry.grill_question}"`);
    }
    if (startsWithNotApplicable(body)) {
      errors.push(`${entry.package_id} answers ${entry.id} but declares section ${GRILL_QUESTION_SECTION_INDEX} not_applicable: remove the marker and state the open question`);
    }
  }
  return errors;
}

/** Whether a body opens by declaring itself not applicable. */
function startsWithNotApplicable(body) {
  const firstLine = body.split('\n').find((line) => line.trim().length > 0) ?? '';
  return /^not_applicable\b/i.test(firstLine.trim());
}

/**
 * No field of the payload may hand work to a human.
 *
 * The ban is absolute, so it is checked over every string the payload carries -
 * authoring prose, residual fields and the semantic review statement alike.
 */
function rejectExternalPhrasing(decisions) {
  const errors = [];
  for (const { path, text } of collectStrings(decisions)) {
    for (const phrase of FORBIDDEN_PHRASES) {
      if (text.includes(phrase)) {
        errors.push(`${path} contains the forbidden phrase "${phrase}": phrase it as a grill question carried to the seeds instead`);
      }
    }
  }
  return errors;
}

/** Every string of a payload, with the path that locates it. */
function collectStrings(value, path = 'decisions') {
  if (typeof value === 'string') {
    return [{ path, text: value }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectStrings(item, `${path}[${index}]`));
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => collectStrings(item, `${path}.${key}`));
  }
  return [];
}

/** Two topics are the same question when they read the same ignoring case and spacing. */
function normalizeTopic(topic) {
  return String(topic ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}
