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
