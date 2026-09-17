/**
 * The reverse rotation's decisions, and the gate that reads them.
 *
 * The analysis measures the subject; this measures the *procedure*. The distinction
 * is the one the command file's `## Statuses and gates` section lost: it defined a
 * gate as a refusal, design §1.2 forbids refusing a subject for being an incomplete
 * conver project, and so the file forbade every gate — including the ones that check
 * whether the procedure's own Steps produced what they must. §1.2 forbids refusing
 * because of the *subject*; a Step that did not produce its document is a fact about
 * this run and says nothing about the project.
 *
 * The two later rotations already carry this: `workspacify-tree/run.mjs` and
 * `workspacify-allocate/run.mjs` both dispatch a `gate` subcommand over a
 * `DECISIONS.json` read from a derived path under the reserved root. This module is
 * the reverse rotation's, and it keeps the two properties that make theirs work:
 *
 *   - **the six come from one declaration.** `JUDGEMENT_ITEMS` is the only place the
 *     six are listed, and the command file enumerates the same six. A seventh is a
 *     defect in the procedure rather than a judgement to make, so a document
 *     answering a seventh is rejected by the schema rather than by a reader.
 *   - **nothing throws for a missing answer.** `readReverseDecisions` returns
 *     findings so that all six unanswered items are named at once. A throw names the
 *     first one, and a reader who fixes it and re-runs meets the second.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { validateAgainstSchema } from '../../workspacify-tree/lib/manifest-schema.mjs';

/** Where this rotation's schemas live, resolved from this module rather than from the caller. */
const SCHEMAS_DIRECTORY = fileURLToPath(new URL('../schemas/', import.meta.url));

/** The schema a decisions document is validated against. */
const DECISIONS_SCHEMA_FILE = 'workspacify-reverse-decisions.schema.json';

/**
 * The six decisions the AI makes, and nothing else (ABOUT-REVERSE §6.2, design §5.5).
 *
 * `id` is the key the document answers under; `label` is what a reader is told is
 * missing; `token` is the phrase the command file must carry, matched with the
 * backticks and emphasis stripped. The token exists so the two lists cannot drift:
 * a document written against the schema and a file written against the design are
 * the same six or this module's own guard fails.
 *
 * All six are decided at `## Step 5`, which is the Step a gate failure returns to.
 * That is not a coincidence to be maintained by hand — the partition is the one
 * load-bearing decision and everything else is instantiated from it.
 */
// [::TICKET::] P26-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-2 --for-spec --no-implementation-order`.
export const JUDGEMENT_ITEMS = Object.freeze([
  Object.freeze({
    id: 'package_boundary',
    label: 'the final determination of the package boundary',
    token: 'final determination of the package boundary',
    step: '## Step 5: decide the partition',
  }),
  Object.freeze({
    id: 'owner_assignment',
    label: 'owner assignment',
    token: 'owner assignment',
    step: '## Step 5: decide the partition',
  }),
  Object.freeze({
    id: 'layer_estimation',
    label: 'layer estimation',
    token: 'layer estimation',
    step: '## Step 5: decide the partition',
  }),
  Object.freeze({
    id: 'contract_meaning',
    label: 'what a contract means',
    token: 'contract means',
    step: '## Step 5: decide the partition',
  }),
  Object.freeze({
    id: 'over_splitting',
    label: 'the over-splitting decision',
    token: 'over-splitting decision',
    step: '## Step 5: decide the partition',
  }),
  Object.freeze({
    id: 'proposition_classification',
    label: 'the classification of each proposition as observed / inferred / normative / unresolved',
    token: 'classification of each proposition',
    step: '## Step 5: decide the partition',
  }),
]);

/**
 * The documents the decisions are made from, and the Step that publishes them.
 *
 * Every one is published by the entrance and by no other command, so an absent one
 * means the run did not reach the exit — which is why all of them return to the Step
 * the entrance runs in rather than to Step 4, where they are read. A reader sent to
 * Step 4 to fix a document Step 2 must publish would be sent to look at material
 * that is not there.
 */
// [::TICKET::] P26-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-2 --for-spec --no-implementation-order`.
export const DECISIONS_MATERIAL = Object.freeze([
  'ANALYSIS-SCOPE.json',
  'R0-R2-REPORT.md',
  'CLAIM-LEDGER.json',
  'R7-SERVING.md',
  'ORIGIN-LONG-SPEC.md',
  'CAPABILITY-PROFILE.json',
]);

/** The Step that runs the entrance, and so the Step an absent document returns to. */
const ENTRANCE_STEP = '## Step 2: fix the boundary and the scope';

/** The Step that decides, and so the Step a document that is absent or unreadable returns to. */
const DECISIONS_STEP = JUDGEMENT_ITEMS[0].step;

/**
 * Which failure a reader is sent back for when more than one is reported.
 *
 * A decision cannot be made from material the run never published, so an absent
 * document outranks everything: sending a reader to Step 5 to answer questions whose
 * material is not on disk would have them decide without it. The order is written
 * down rather than left to the order findings happen to be collected in, because the
 * two are the same today and there is nothing to report it if they part.
 */
const RETURN_PRIORITY = Object.freeze([
  'absent-material',
  'invalid-decisions',
  'unrecorded-item',
  'unreadable-decisions',
  'unparseable-decisions',
]);

/** The schema, parsed once per process: it is read on every gate run and changes only with a release. */
let cachedSchema = null;

// [::TICKET::] P26-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-2 --for-spec --no-implementation-order`.
function decisionsSchema() {
  if (cachedSchema === null) {
    cachedSchema = JSON.parse(readFileSync(`${SCHEMAS_DIRECTORY}${DECISIONS_SCHEMA_FILE}`, 'utf8'));
  }
  return cachedSchema;
}

/**
 * Read the decisions document, reporting an unreadable or unparseable one by path.
 *
 * Neither is thrown. A document that is absent, unreadable and present-but-broken are
 * three different facts — the same distinction `LOGICAL_PARTITION_STATES` draws for
 * the prior partition — and a reader who is told only "it failed" cannot tell which
 * of the three they are looking at.
 *
 * @param {string} filePath — the derived decisions path
 * @returns {{ decisions: object|null, findings: Array<{ kind: string, detail: string }> }}
 */
// [::TICKET::] P26-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-2 --for-spec --no-implementation-order`.
export function readReverseDecisions(filePath) {
  if (!existsSync(filePath)) {
    return {
      decisions: null,
      findings: [{
        kind: 'unreadable-decisions',
        detail: `no decisions document is present at ${filePath}`,
        step: DECISIONS_STEP,
      }],
    };
  }

  let rawText;
  try {
    rawText = readFileSync(filePath, 'utf8');
  } catch (error) {
    return {
      decisions: null,
      findings: [{
        kind: 'unreadable-decisions',
        detail: `${filePath} is present and could not be read (${error.code ?? error.message})`,
        step: DECISIONS_STEP,
      }],
    };
  }

  try {
    return { decisions: JSON.parse(rawText), findings: [] };
  } catch (error) {
    return {
      decisions: null,
      findings: [{
        kind: 'unparseable-decisions',
        detail: `${filePath} is present and is not valid JSON (${error.message})`,
        step: DECISIONS_STEP,
      }],
    };
  }
}

/**
 * Validate a decisions document against the schema.
 *
 * The schema is what rejects a seventh answer. The design closes the judgement
 * surface to six and says a seventh is a defect in the procedure, so a document that
 * carries one is a procedure that has been widened — and no list of six names, on its
 * own, can report a seventh.
 *
 * @param {object} decisions
 * @returns {{ ok: boolean, errors: Array<{ path: string, message: string }> }}
 */
// [::TICKET::] P26-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-2 --for-spec --no-implementation-order`.
export function assertReverseDecisionsSchema(decisions) {
  const result = validateAgainstSchema(decisions, decisionsSchema());
  if (decisions === null || typeof decisions !== 'object' || Array.isArray(decisions)) {
    return { ok: result.valid, errors: result.errors };
  }

  // The sixth item cannot be checked by the required list. The design closes the
  // surface to six and calls a seventh a defect in the procedure, so a document that
  // carries one has widened a surface no list of six names can report. The shared
  // validator does not implement `additionalProperties`, and adding it there would
  // change what two other rotations' schemas mean; the check belongs to the one
  // rotation whose design states the rule.
  const licensed = new Set(JUDGEMENT_ITEMS.map((item) => item.id));
  const extra = Object.keys(decisions).filter((key) => !licensed.has(key));
  const errors = [
    ...result.errors,
    ...extra.map((key) => ({ path: `$.${key}`, message: 'property is not one of the six the design licenses' })),
  ];
  return { ok: errors.length === 0, errors };
}

/**
 * Where a decisions document, or the material it was made from, is not what it must be.
 *
 * Every unanswered item is reported rather than the first, because the six are
 * answered together and a reader fixing them one report at a time pays six round
 * trips for one edit.
 *
 * @param {{ decisions: object|null, present: string[] }} input
 * @returns {Array<{ kind: string, item?: string, label?: string, document?: string, step: string }>}
 */
// [::TICKET::] P26-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-2 --for-spec --no-implementation-order`.
export function verifyReverseDecisions({ decisions, present }) {
  const findings = DECISIONS_MATERIAL
    .filter((document) => !present.includes(document))
    .map((document) => ({ kind: 'absent-material', document, step: ENTRANCE_STEP }));

  if (decisions === null) {
    return findings;
  }

  const answered = new Set(Object.keys(decisions));
  for (const item of JUDGEMENT_ITEMS) {
    if (!answered.has(item.id)) {
      findings.push({ kind: 'unrecorded-item', item: item.id, label: item.label, step: item.step });
    }
  }

  return findings;
}

/**
 * Where a document is present and answers the wrong question.
 *
 * A schema violation is not a missing answer, and the two are reported in different
 * words: "not answered" tells a reader to supply something, "not accepted as written"
 * tells them what they supplied is not what was asked for. A seventh key is the case
 * this exists for — it is the one failure no list of six names can report.
 *
 * @param {object|null} decisions
 * @returns {Array<{ kind: string, detail: string, step: string }>}
 */
// [::TICKET::] P26-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-2 --for-spec --no-implementation-order`.
export function findSchemaViolations(decisions) {
  return assertReverseDecisionsSchema(decisions).errors.map((error) => ({
    kind: 'invalid-decisions',
    detail: `${error.path}: ${error.message}`,
    step: JUDGEMENT_ITEMS[0].step,
  }));
}

/**
 * The English a reader is given when the decisions are not yet what they must be.
 *
 * The rule this text exists for is `run.mjs:479`'s: a gate's job is to name what is
 * wrong. So it names the file, every answer that is missing, every document that is
 * missing, where the schema is, and which Step to return to — and it never asks a
 * question, because the operator reading it is an AI forbidden from answering one.
 *
 * @param {Array<object>} findings — from `verifyReverseDecisions`
 * @param {{ path: string }} input
 * @returns {string}
 */
// [::TICKET::] P26-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-2 --for-spec --no-implementation-order`.
export function renderDecisionsAdvice(findings, { path }) {
  const unrecorded = findings.filter((finding) => finding.kind === 'unrecorded-item');
  const absent = findings.filter((finding) => finding.kind === 'absent-material');
  const invalid = findings.filter((finding) => finding.kind === 'invalid-decisions');
  const unreadable = findings.filter((finding) => finding.kind.startsWith('unreadable') || finding.kind === 'unparseable-decisions');

  const lines = ['The reverse rotation’s decisions are not yet what the procedure must leave behind.', ''];
  lines.push(`  Read from: ${path}`);

  for (const finding of unreadable) {
    lines.push(`  ${finding.detail}`);
  }
  if (unrecorded.length > 0) {
    lines.push('  Not answered:');
    for (const finding of unrecorded) lines.push(`    - ${finding.label}`);
  }
  if (invalid.length > 0) {
    lines.push('  Not accepted as written:');
    for (const finding of invalid) lines.push(`    - ${finding.detail}`);
  }
  if (absent.length > 0) {
    lines.push('  Not published by the run:');
    for (const finding of absent) lines.push(`    - ${finding.document}`);
  }

  lines.push('');
  lines.push('What to do: write the six answers into that file, each with the material the decision was');
  lines.push(`  made from beside it. The schema is ${DECISIONS_SCHEMA_FILE} beside this rotation, and the`);
  lines.push('  surface is closed to six — a seventh answer is a defect in the procedure, not a judgement.');
  if (absent.length > 0) {
    lines.push('  The documents listed as not published are written by the entrance, so run it again');
    lines.push('  before answering: a decision made without its material is not a decision this gate can read.');
  }
  lines.push('');
  const returnStep = RETURN_PRIORITY
    .flatMap((kind) => findings.filter((finding) => finding.kind === kind))
    .find((finding) => finding.step)?.step ?? ENTRANCE_STEP;
  lines.push(`Return to: ${returnStep}`);
  lines.push('Then re-run: node .claude/scripts/workspacify-reverse/run.mjs gate');

  return lines.join('\n');
}

/**
 * The English a reader is given when every decision is recorded.
 *
 * It names each of the six and the material they rest on, because a verdict that
 * said only "ok" would leave the reader unable to tell a document that answered six
 * questions from one that answered the same question six times.
 *
 * The decisions themselves are not a parameter: the caller reaches this only when the
 * gate found nothing to report, so a signature that took them would be claiming to
 * check something it does not, and a branch that printed `NOT ANSWERED` would be a
 * line nothing can reach.
 *
 * @param {{ path: string }} input
 * @returns {string}
 */
// [::TICKET::] P26-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-2 --for-spec --no-implementation-order`.
export function renderDecisionsVerdict({ path }) {
  const lines = ['The six decisions the design licenses are recorded.', '', `  Read from: ${path}`];
  for (const item of JUDGEMENT_ITEMS) {
    lines.push(`    - ${item.label}`);
  }
  lines.push('');
  lines.push(`  Material: ${DECISIONS_MATERIAL.length} document(s) the run published are present beside it.`);
  lines.push('');
  lines.push('Next: ## Step 6: record the seam (patterns 2 and 3), then ## Step 7: hand over.');
  return lines.join('\n');
}
