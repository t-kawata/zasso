// [::TICKET::] P25-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-4 --for-spec --no-implementation-order`.
// [::TICKET::] P25-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-3 --for-spec --no-implementation-order`.
// @verifies C001
// @verifies C002
// @verifies C003
// [::TICKET::] P23-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-1 --for-spec --no-implementation-order`.
/**
 * The guards that hold one command file to its declared shape.
 *
 * Two test files read the tenth command file. `command.test.mjs` holds it to the
 * eight structural assertions P22-9 established; `command-procedure.test.mjs`
 * holds it to the procedure P23-1 wrote. Both need the same eight assertions and
 * the same idea of what a section is, so the assertions are defined here once
 * and imported by both. A second copy would be a second thing to drift, and the
 * two guards would then be covering different documents while each reported
 * success.
 *
 * Nothing here writes: a guard that mutates its subject is not a guard.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  compareDigests,
  digestCommandFiles,
  extractCommandFileSections,
} from '../../../.claude/scripts/workspacify-reverse/lib/command-file-digest.mjs';

/** The procedure's declared spine: `## Step 0` through `## Step 8`. */
export const EXPECTED_STEP_HEADINGS = 9;

/** The AI's judgement surface, closed to exactly this many items (ABOUT-REVERSE §6.2). */
export const JUDGEMENT_SURFACE_SIZE = 6;

/** The formulations design §5.7 forbids. The count is asserted, not assumed. */
export const FORBIDDEN_FORMULATION_COUNT = 6;

/**
 * How many command definitions the digest freezes.
 *
 * Nine were the files that existed before P22. P25-2 adds the six that name a
 * script and were never guarded — `make-ticket`, `plan-ticket`, `start-ticket`,
 * `review-ticket`, `resolve-ticket` and `consolidate-stubs` — because a definition
 * that instructs an operator to run a script is exactly what the freeze claims to
 * protect. `workspacify-reverse.md` stays outside: it is the creation P22-9 made
 * rather than an edit to a pre-P22 file, and its own shape is held by
 * `assertCommandFileStructure` instead.
 */
export const EXPECTED_FROZEN_COMMAND_FILES = 15;

/**
 * The frozen definitions that carry the First-Class Rule obligation sentence.
 *
 * Measured 2026-09-15, and recorded rather than required: the sentence is not shared
 * across the set. Four carry the PX-era wording, `consolidate-stubs` carries a
 * different law under the same opening, and the rest carry none — which is what
 * `compareDigests` already models, freezing the sentence where it exists and its
 * absence where it does not. The record exists so a fifth carrier cannot join
 * unnamed, and so removing the sentence from one of these five is reported.
 */
export const FROZEN_FIRST_CLASS_RULE_CARRIERS = Object.freeze([
  'consolidate-stubs',
  'plan-ticket',
  'resolve-ticket',
  'review-ticket',
  'start-ticket',
]);

/**
 * The command definitions that name no script.
 *
 * They are exempt from the freeze because there is nothing in them for it to bind:
 * the digest protects a definition that instructs an operator to run something. The
 * list is a decision with a reason rather than a default, so it is written down and
 * asserted — a command file that starts naming a script leaves this list, and one
 * that stops leaves it in the other direction.
 */
export const SCRIPTLESS_COMMAND_FILES = Object.freeze([
  'epush-branch',
  'jpush-branch',
  'plan',
  'sessions',
  'skill-health',
]);

/** Where the instrument's subcommands are catalogued. */
export const SCRIPTS_USED_HEADING = '## Scripts used';

/** Where the two modes of design §5.8 are declared, and which one an operational run is in. */
export const MODES_HEADING = '## Two modes, never conflated';

/** Where the AI's judgement surface is enumerated, one numbered item per decision. */
export const JUDGEMENT_HEADING = '## What the machine decides, and what you decide';

/** A level-two heading, which is what opens a section of a command file. */
const SECTION_HEADING = /^## (.*)$/;

/**
 * A numbered list item, indentation allowed: the judgement surface is nested
 * under the sentence that introduces it, so its items do not start at column one.
 */
const NUMBERED_ITEM = /^\s*\d+\. /;

/** An item of a bulleted list. */
const BULLET = /^[-*] /;

/** A row of a Markdown table: the only shape an exempt region may carry a marker in. */
const TABLE_ROW = /^\|/;

/** The region every line before the first level-two heading belongs to. */
const PREAMBLE_REGION = '(preamble)';

/**
 * The formulations design §5.7 forbids, and the regions that may tabulate them.
 *
 * An exemption is a region AND a shape: it covers a table row inside that
 * region, never a sentence. The instrument catalogue and the modes table may
 * *tabulate* the experiment-only subcommands, because listing what exists and
 * saying which mode uses it is not instructing anyone to run it in the other
 * mode. Prose in those regions is audited like prose anywhere else, so a
 * precondition cannot be smuggled into the catalogue by writing it under the
 * catalogue's heading.
 *
 * No region exempts a completeness gate, in any shape: that is design §1.2, the
 * load-bearing sentence, and it is forbidden everywhere.
 */
export const FORBIDDEN_FORMULATIONS = Object.freeze([
  Object.freeze({
    id: 'incompleteness-gate',
    markers: Object.freeze(['not a conver project', 'incomplete conver project']),
    exemptIn: Object.freeze([]),
    reason: '§1.2 — incompleteness is the input, not a refusal condition',
  }),
  Object.freeze({
    id: 'must-already-be-complete',
    markers: Object.freeze(['must already be a complete']),
    exemptIn: Object.freeze([]),
    reason: '§1.2 — the exact prohibition the whole design exists to remove',
  }),
  Object.freeze({
    id: 'holdout-isolation',
    markers: Object.freeze(['holdout isolation', 'run.mjs holdout']),
    exemptIn: Object.freeze([SCRIPTS_USED_HEADING, MODES_HEADING]),
    reason: '§5.7 — it manufactures the experiment input; it does not qualify a real project',
  }),
  Object.freeze({
    id: 'scrub-detect-verify-as-step',
    markers: Object.freeze(['run.mjs scrub', 'run.mjs detect', 'run.mjs verify']),
    exemptIn: Object.freeze([SCRIPTS_USED_HEADING, MODES_HEADING]),
    reason: '§5.7 — they remove or re-detect the forward traces a pattern-2 project must carry forward',
  }),
  Object.freeze({
    id: 'oracle-compare-as-step',
    markers: Object.freeze(['oracle compare', 'run.mjs oracle']),
    exemptIn: Object.freeze([SCRIPTS_USED_HEADING, MODES_HEADING]),
    reason: '§5.7 — an answer key exists only in the paired-tree experiment',
  }),
  Object.freeze({
    id: 'regression-check-as-precondition',
    markers: Object.freeze(['run.mjs regression']),
    exemptIn: Object.freeze([SCRIPTS_USED_HEADING, MODES_HEADING]),
    reason: '§5.7 — it takes no root and measures the conver repository, not the subject',
  }),
]);

/** The digest a protected section has when a file does not carry it at all. */
const ABSENT_SECTION_DIGEST = createHash('sha256').update('').digest('hex');

/** The SHA-256 of a text, as the digest module computes it. */
// [::TICKET::] P23-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-1 --for-spec --no-implementation-order`.
function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/** Read a command file, reporting an unreadable one by path instead of throwing. */
export function readCommandFile(filePath) {
  try {
    return { text: readFileSync(filePath, 'utf8'), finding: null };
  } catch (error) {
    return {
      text: null,
      finding: {
        kind: 'unreadable-file',
        file: filePath,
        detail: `${filePath} could not be read (${error.code ?? error.message})`,
      },
    };
  }
}

/**
 * The Language Protocol table digest that the command files carrying one share.
 *
 * It is read from the files rather than written down, so a file cannot satisfy
 * the assertion by retyping the table "closely enough".
 */
// [::TICKET::] P23-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-1 --for-spec --no-implementation-order`.
function sharedLanguageProtocolDigest(projectRoot) {
  const digests = digestCommandFiles(projectRoot);
  const carried = new Set(
    Object.values(digests)
      .map((entry) => entry.languageProtocolDigest)
      .filter((digest) => digest !== ABSENT_SECTION_DIGEST),
  );
  assert.equal(carried.size, 1, 'the command files carrying a Language Protocol table carry the same one');
  return [...carried][0];
}

/**
 * Assert the eight structural properties P22-9 established for the tenth file.
 *
 * The body is the one `command.test.mjs` carried inline, moved here unchanged:
 * the two guards must hold the file to the same eight things, and the only way
 * to guarantee that is for there to be one definition of them.
 */
export function assertCommandFileStructure(text, { projectRoot }) {
  const sections = extractCommandFileSections(text);

  assert.match(text, /^---\n/, 'the file opens with frontmatter');
  assert.match(text, /^description: /m);
  assert.match(text, /^argument-hint: /m);
  assert.match(text, /^disable-model-invocation: true$/m);

  assert.ok(sections.headings.length > 0, 'the file carries ATX headings');
  assert.equal(
    sha256(sections.languageProtocolTable),
    sharedLanguageProtocolDigest(projectRoot),
    'the Language Protocol table is the one the carrying command files share',
  );
  assert.match(sections.firstClassRuleLine, /First-Class Rule\s*—\s*\[::STUB::\]/, 'the obligation sentence is present');
  assert.equal(sections.headings.some((heading) => /Step \d/.test(heading)), true, 'a workflow section exists');

  assert.match(text, /^## Scripts used$/m, 'a script list exists');
  assert.match(text, /run\.mjs analyze/, 'the script list names the entrance');
  assert.match(text, /^## Arguments$/m, 'an argument interpretation section exists');
}

/** The level-two heading each line sits under, in file order. */
export function regionsOf(text) {
  const regions = [];
  let region = PREAMBLE_REGION;
  for (const line of text.split('\n')) {
    const heading = SECTION_HEADING.exec(line);
    if (heading !== null) {
      region = `## ${heading[1].trim()}`;
    }
    regions.push(region);
  }
  return regions;
}

/** The lines under one level-two heading, up to but excluding the next one. */
export function sectionLines(text, heading) {
  const lines = text.split('\n');
  const regions = regionsOf(text);
  return lines.filter((line, index) => regions[index] === heading && line !== heading);
}

/** The lines under one level-two heading, joined back into a text. */
export function sectionText(text, heading) {
  return sectionLines(text, heading).join('\n');
}

/**
 * Audit the file for the formulations design §5.7 forbids.
 *
 * Each finding names the formulation, the line and the section, so a reported
 * violation can be opened and read rather than merely counted.
 */
export function auditForbiddenFormulations(text) {
  const lines = text.split('\n');
  const regions = regionsOf(text);
  const findings = [];

  for (const [index, line] of lines.entries()) {
    const region = regions[index];
    const haystack = line.toLowerCase();
    for (const formulation of FORBIDDEN_FORMULATIONS) {
      if (formulation.exemptIn.includes(region) && TABLE_ROW.test(line)) {
        continue;
      }
      // One finding per formulation per line: a line naming two of a
      // formulation's markers is one occurrence of it, not two.
      const marker = formulation.markers.find((candidate) => haystack.includes(candidate.toLowerCase()));
      if (marker !== undefined) {
        findings.push({
          kind: formulation.id,
          marker,
          line: index + 1,
          region,
          reason: formulation.reason,
          text: line.trim(),
        });
      }
    }
  }
  return findings;
}

/**
 * The six decisions the AI makes, read out of the one numbered list the file
 * carries. The list is read rather than counted from prose so that a later edit
 * which adds a seventh item is caught as a number, not argued about as wording.
 */
export function extractJudgementItems(text) {
  const lines = sectionLines(text, JUDGEMENT_HEADING);
  const items = [];
  for (const line of lines) {
    if (NUMBERED_ITEM.test(line)) {
      items.push(line.trim());
      continue;
    }
    if (items.length > 0) {
      break;
    }
  }
  return items;
}

/** Assert the judgement surface is exactly the size the design licenses. */
export function assertJudgementSurface(text) {
  const items = extractJudgementItems(text);
  if (items.length !== JUDGEMENT_SURFACE_SIZE) {
    throw new Error(
      `the AI judgement surface must hold exactly six items, and this file enumerates ${items.length}`,
    );
  }
}

/** The bullets of the machine's half of the judgement section, for the split assertion. */
export function extractMachineDecisions(text) {
  return sectionLines(text, JUDGEMENT_HEADING).filter((line) => BULLET.test(line));
}

/**
 * Where an absence section and the measured closure contradict each other.
 *
 * Checked in both directions, because they are two different defects. A module the
 * walk cannot reach and the section does not name is an absence the operator is not
 * told about; a module the walk *does* reach and the section names as absent is a
 * refusal of something that is there. Neither direction can be checked by counting:
 * the assertion this replaces required six row identifiers to be present and went on
 * passing after every one of those rows had been closed, because a name that should
 * have been removed is not a name that is missing.
 *
 * The section is passed as text rather than as a path so a fixture can drive the
 * check. A guard that can only be pointed at the real file can only ever be seen to
 * pass.
 *
 * @param {{ sectionText: string, unreachable: string[], reachable: string[] }} input
 * @returns {Array<{ kind: string, module: string }>} one finding per contradiction
 */
// [::TICKET::] P25-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-2 --for-spec --no-implementation-order`.
export function findAbsenceContradictions({ sectionText: section, unreachable, reachable }) {
  const findings = [];

  for (const module of unreachable) {
    if (!section.includes(module)) {
      findings.push({ kind: 'unnamed-absence', module });
    }
  }

  for (const module of reachable) {
    if (section.includes(module)) {
      findings.push({ kind: 'reachable-named-absent', module });
    }
  }

  return findings;
}

/**
 * The sentence a command file must carry where it spells a stage identifier lowercase.
 *
 * The file writes a stage two ways and the case carries the meaning: lowercase is the
 * identifier the command line matches and `ANALYSIS_EVALUATION_ORDER` declares,
 * uppercase is the label a reader sees (`stageLabel` in `lib/scope.mjs`, which derives
 * it so a stage can never be displayed under a name it is not invoked by). One line is
 * therefore supposed to be lowercase — the block quoting the declared order — and
 * without the rule stated beside it that line reads as an inconsistency.
 *
 * It sits beside its only consumer rather than with the constants at the top because
 * `design-citations.test.mjs` pins `command-file.mjs:217` to `assertCommandFileStructure`:
 * a constant added above that line moves it, and the guard reports the drift.
 *
 * The sentence is matched rather than quoted so the wording can be improved without a
 * test edit, while the two facts it must carry — the case, and the reason — cannot be
 * dropped.
 */
export const CASE_CONVENTION = /lowercase[^.;]*identifier the command line matches[^.;]*label a reader sees/i;

/**
 * Where a command file spells a stage lowercase without stating the convention.
 *
 * The section is passed as text rather than as a path so a fixture can drive the
 * check, for the same reason `findAbsenceContradictions` takes its section that way:
 * a guard that can only be pointed at the real file can only ever be seen to pass.
 *
 * @param {{ text: string, heading: string }} input
 * @returns {Array<{ kind: string, region: string }>} one finding when the rule is unstated
 */
// [::TICKET::] PX-216 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-216 --for-spec --no-implementation-order`.
export function findUnstatedCaseConvention({ text, heading }) {
  return CASE_CONVENTION.test(sectionText(text, heading))
    ? []
    : [{ kind: 'unstated-case-convention', region: heading }];
}

/**
 * Where a command file spells a stage identifier in lowercase.
 *
 * The vocabulary is passed in rather than imported so a fixture can drive the check.
 * Matching is case sensitive and longest token first, so `r2.5` is one occurrence
 * rather than `r2` followed by `.5`, uppercase `R0` is no occurrence at all, and the
 * `r2` inside a word like `render2` is neither — a finding is a stage the command line
 * would match, not a substring that resembles one.
 *
 * @param {{ text: string, vocabulary: string[] }} input
 * @returns {Array<{ line: number, token: string, text: string }>} one finding per occurrence
 */
// [::TICKET::] PX-216 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-216 --for-spec --no-implementation-order`.
export function findLowercaseStageLines({ text, vocabulary }) {
  if (vocabulary.length === 0) {
    return [];
  }

  const alternation = [...vocabulary]
    .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .sort((left, right) => right.length - left.length)
    .join('|');
  const tokenPattern = new RegExp(`(?<![A-Za-z0-9_.])(${alternation})(?![0-9])`, 'g');
  const findings = [];

  for (const [index, line] of text.split('\n').entries()) {
    for (const match of line.matchAll(tokenPattern)) {
      findings.push({ line: index + 1, token: match[1], text: line.trim() });
    }
  }

  return findings;
}
