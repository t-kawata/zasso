// [::TICKET::] P22-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-1 --for-spec --no-implementation-order`.
/**
 * The command-file digest — proof that an edit stayed an edit.
 *
 * `.claude/commands/*.md` may be appended to and corrected, never rewritten.
 * A whole-file hash would cry wolf on a legitimate append, so this module
 * freezes exactly the three things that must survive character for character:
 * the heading set, the Language Protocol table and the First-Class Rule line.
 *
 * It also holds a second, unrelated property: that a reverse-only section cannot
 * reach a forward step. That one is not a digest, because there is nothing to
 * freeze — a command file is a prompt rather than code, and the only thing a
 * machine can hold is whether the text says what it must say. Two lints do it:
 * placement, which refuses a reverse heading before the file's forward procedure
 * ends, and gate, which requires every reverse section to open with a sentence
 * naming a predicate from a declared table whose every entry is false in forward.
 * The rotation gate is deliberately not frozen in the digest as well: capture
 * re-derives the forward surfaces, so a key added without a capture is a stored
 * value nothing compares, which is the shape this repository has repaired twice.
 *
 * Nothing here writes: the digest is a measurement, and a measurement that
 * mutates its subject is not a measurement.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

/** Where the command definitions live, relative to a conver project root. */
export const COMMANDS_RELATIVE_DIR = '.claude/commands';

/**
 * The nine command files that existed before P22. P22-9 creates a tenth
 * (`workspacify-reverse.md`), which is a new file rather than an edit and is
 * therefore deliberately absent from this list.
 *
 * That absence has a cost worth naming: the three `Branch making-reverse commit
 * on v0.24.635` commits each added a trailing space to that file's
 * `# /workspacify-reverse` heading, and nothing detects it because the file is
 * outside this set. Widening the set is a separate decision about what the digest
 * claims to protect, and is not taken here.
 */
export const COMMAND_FILE_NAMES = [
  'workspacify-tree',
  'workspacify-allocate',
  'grill-me-for-rfc',
  'graphify-rfc',
  'boundify-graph',
  'split-to-tickets',
  'find-omissions',
  'crystalize-readme',
  'drill-rfc-down',
];

/** A line that opens an ATX heading. */
const ATX_HEADING = /^#{1,6} /;
/** A line that opens or closes a fenced code block. */
const CODE_FENCE = /^\s*(```|~~~)/;
/** A markdown table row. */
const TABLE_ROW = /^\s*\|/;
/** The heading whose table the Language Protocol lives in. */
const LANGUAGE_PROTOCOL_HEADING = /^#{1,6} .*Language Protocol/i;
/**
 * The obligation sentence itself, not any heading that happens to share its
 * wording: `grill-me-for-rfc.md` carries a `## ★ First-Class Rules` section
 * heading that is a different thing, and freezing it here would be a lying
 * match.
 */
const FIRST_CLASS_RULE = /First-Class Rule\s*—\s*\[::STUB::\]/;

/** The digest of a protected section a file does not carry. */
const ABSENT_SECTION_DIGEST = sha256Hex('');

/** A heading that opens a reverse-only section. */
const REVERSE_HEADING = /^#{1,6} .*[Rr]everse/;

/**
 * The headings that mark a file's forward procedure.
 *
 * The last line matching one of these is where the forward steps end, and a
 * reverse heading may not appear before it: a section that reaches the reader
 * before the steps finish can remove one, and `boundify-graph.md` did exactly
 * that with "Step 3 is not run at all" placed immediately above Step 3.
 *
 * Four shapes rather than one because the nine files do not agree on a
 * convention: four use `## Step N`, and the rest use `## Workflow`,
 * `## Analysis Procedure`, `## Execution Steps` and `## Step-by-Step Inspection
 * Procedure`. A file that changes its convention would silently satisfy the
 * placement rule by having no anchor at all, so `lintRotationPlacement` reports
 * a file with no anchor rather than passing it — an omission that produces
 * silence is the defect this whole module exists to remove.
 */
export const FORWARD_PROCEDURE_HEADING_PATTERNS = Object.freeze([
  /^## Step \d/,
  /^## .*Procedure/,
  /^## .*Steps?\b/,
  /^## Workflow/,
]);

/**
 * The one sentence every reverse section opens with.
 *
 * The predicate is named in backticks so it can be read out of the sentence and
 * compared against the declared table. A sentence shaped like this that names
 * something undeclared fails, so the shape alone cannot satisfy the rule.
 */
export const ROTATION_GATE_PATTERN = /\*\*Rotation gate\*\* — this section runs only when `([^`]+)` holds\./;

/**
 * The predicates a reverse-only section may gate on.
 *
 * Each entry declares that it does not hold in the forward rotation, which is
 * what makes every gate false in forward by construction rather than by
 * argument. `rejectInadmissiblePredicates` refuses an entry that declares
 * otherwise, and refuses a kind outside the vocabulary, so the table cannot be
 * widened into the rotation it is meant to be invisible to.
 *
 * What the table does not do is prove its entries are right. It records a
 * decision; a reader reviews the decision. The reasons below are measurements,
 * taken on 2026-09-11, and each names the file the measurement was taken from.
 */
export const DECLARED_ROTATION_PREDICATES = Object.freeze([
  {
    name: 'reverse-decisions-mode',
    kind: 'argument',
    forwardDefault: false,
    reason:
      'The run invokes `run.mjs reverse`. The forward rotation invokes `finalize`, and `resolveTreeMode` ' +
      'and `resolveAllocateMode` return FORWARD for an absent, an empty or an unrecognised input ' +
      '(workspacify-tree/lib/reverse-mode.mjs:40, workspacify-allocate/lib/reverse-mode.mjs:69).',
  },
  {
    name: 'measured-tree-root',
    kind: 'argument',
    forwardDefault: false,
    reason:
      'The run is given `--root`, a project tree that already exists. The forward rotation generates the ' +
      'tree from a Dirs-Tree and has no `--root` to give (rfc-graph/reverse-boundify.js, ' +
      'workspacify-tree/run.mjs, tickets/lib/reverse-split.js).',
  },
  {
    name: 'reverse-seed-index',
    kind: 'artifact',
    forwardDefault: false,
    reason:
      'The RFC-SEED carries `reverse_index` inside its machine-injected section 1. A forward seed carries ' +
      'none, and `reverseIndexOf` returns null for it (grill-me-for-rfc/reverse-questions.js:63,146).',
  },
  {
    name: 'return-refs-reverse-mode',
    kind: 'argument',
    forwardDefault: false,
    reason:
      '`return-refs.js` is invoked with `--mode=reverse`. Without the flag the artefact is returned itself ' +
      'and no return reference is written (tickets/lib/return-refs.js:609,617,683).',
  },
  {
    name: 'claim-ledger',
    kind: 'artifact',
    forwardDefault: false,
    reason:
      '`CLAIM-LEDGER.json` is written at R3.5. The forward rotation produces none, and `staleness.mjs` ' +
      'takes `--claim-ledger` as a required argument with no `mode` option of any kind ' +
      '(workspacify-reverse/lib/staleness.mjs:73).',
  },
]);

/** The kinds a declared predicate may have. */
const ROTATION_PREDICATE_KINDS = Object.freeze(['artifact', 'argument']);

/**
 * How long a predicate's reason must be before it counts as written down.
 *
 * Twenty characters is a floor against a shrug, not a standard of quality: it
 * separates "not needed" from a sentence naming the file the measurement came
 * from. The judgement is named here rather than left as a literal inside the
 * comparison, so a reader who disagrees changes one place.
 */
const MINIMUM_REASON_LENGTH = 20;

/**
 * The name a finding carries when it is about the table rather than about a file.
 *
 * The table is a declaration, not a file, and a finding that named one of the nine
 * command files for a defect in the table would send its reader to the wrong place.
 */
const ROTATION_PREDICATE_TABLE = 'DECLARED_ROTATION_PREDICATES';

// [::TICKET::] PX-210 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-210 --for-spec --no-implementation-order`.
function sha256Hex(text) {
  return createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

/**
 * Split one command file into the three sections whose loss must be detected.
 *
 * Headings inside fenced code blocks are ignored: a `# comment` in a shell
 * example is not a section of the document.
 *
 * @param {string} text - the command file's contents
 * @returns {{headings: string[], languageProtocolTable: string, firstClassRuleLine: string}}
 */
export function extractCommandFileSections(text) {
  const lines = text.split('\n');
  const headings = [];
  let insideFence = false;

  for (const line of lines) {
    if (CODE_FENCE.test(line)) {
      insideFence = !insideFence;
      continue;
    }
    if (!insideFence && ATX_HEADING.test(line)) {
      headings.push(line.trimEnd());
    }
  }

  return {
    headings,
    languageProtocolTable: extractLanguageProtocolTable(lines),
    firstClassRuleLine: lines.find((line) => FIRST_CLASS_RULE.test(line)) ?? '',
  };
}

/** Collect the contiguous table rows that follow the Language Protocol heading. */
function extractLanguageProtocolTable(lines) {
  const headingIndex = lines.findIndex((line) => LANGUAGE_PROTOCOL_HEADING.test(line));
  if (headingIndex === -1) {
    return '';
  }

  const rows = [];
  let insideFence = false;
  for (const line of lines.slice(headingIndex + 1)) {
    if (CODE_FENCE.test(line)) {
      insideFence = !insideFence;
      continue;
    }
    if (insideFence) {
      continue;
    }
    if (TABLE_ROW.test(line)) {
      rows.push(line.trimEnd());
      continue;
    }
    if (rows.length > 0) {
      break;
    }
  }
  return rows.join('\n');
}


/**
 * Digest the three protected sections of every command file.
 *
 * @param {string} projectRoot - conver project root holding `.claude/commands`
 * @returns {Record<string, {headings: string[], languageProtocolDigest: string, firstClassRuleDigest: string, documentDigest: string}>}
 */
export function digestCommandFiles(projectRoot) {
  const digests = {};
  for (const name of COMMAND_FILE_NAMES) {
    const filePath = join(projectRoot, COMMANDS_RELATIVE_DIR, `${name}.md`);
    if (!existsSync(filePath)) {
      continue;
    }
    const sections = extractCommandFileSections(readFileSync(filePath, 'utf8'));
    digests[name] = {
      headings: sections.headings,
      languageProtocolDigest: sha256Hex(sections.languageProtocolTable),
      firstClassRuleDigest: sha256Hex(sections.firstClassRuleLine),
      documentDigest: sha256Hex(JSON.stringify(sections)),
    };
  }
  return digests;
}

/**
 * Compare a frozen digest set against what the files say now.
 *
 * A file that no longer exists is reported rather than thrown: the gate's job
 * is to name the loss, and an unhandled exception names nothing.
 *
 * @param {object} baseline - the frozen `commandFileDigests` map
 * @param {object} current - the freshly computed map
 * @returns {Array<{file: string, kind: string, detail: string, heading?: string}>}
 */
export function compareDigests(baseline, current) {
  const findings = [];
  const relativePathOf = (name) => join(COMMANDS_RELATIVE_DIR, `${name}.md`);

  for (const name of Object.keys(baseline).sort()) {
    const frozen = baseline[name];
    const observed = current[name];

    if (!observed) {
      findings.push({
        file: relativePathOf(name),
        kind: 'missing-file',
        detail: `${relativePathOf(name)} no longer exists`,
      });
      continue;
    }

    const observedHeadings = new Set(observed.headings);
    for (const heading of frozen.headings) {
      if (!observedHeadings.has(heading)) {
        findings.push({
          file: relativePathOf(name),
          kind: 'missing-heading',
          heading,
          detail: `${relativePathOf(name)} lost the heading "${heading}"`,
        });
      }
    }

    // A section the file never carried cannot be "lost", so its later arrival is
    // an addition rather than a finding. A section it did carry must survive.
    if (frozen.languageProtocolDigest !== ABSENT_SECTION_DIGEST && observed.languageProtocolDigest !== frozen.languageProtocolDigest) {
      findings.push({
        file: relativePathOf(name),
        kind: 'changed-language-protocol',
        detail: `${relativePathOf(name)} changed its Language Protocol table`,
      });
    }

    if (frozen.firstClassRuleDigest !== ABSENT_SECTION_DIGEST && observed.firstClassRuleDigest !== frozen.firstClassRuleDigest) {
      findings.push({
        file: relativePathOf(name),
        kind: 'changed-first-class-rule',
        detail: `${relativePathOf(name)} changed its First-Class Rule line`,
      });
    }

  }

  return findings;
}

/**
 * The first non-blank line after a file's single reverse heading, or null when
 * the file carries no reverse heading or more than one.
 *
 * More than one is reported rather than resolved: a file with two reverse
 * sections has two gates, and picking either would be a choice the lint is not
 * entitled to make.
 */
// [::TICKET::] PX-210 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-210 --for-spec --no-implementation-order`.
function readSoleGateLine(lines) {
  const headingIndexes = [];
  for (const [index, line] of lines.entries()) {
    if (REVERSE_HEADING.test(line)) {
      headingIndexes.push(index);
    }
  }

  if (headingIndexes.length !== 1) {
    return { headingIndexes, gateLine: null };
  }

  const [headingIndex] = headingIndexes;
  return {
    headingIndexes,
    gateLine: lines.slice(headingIndex + 1).find((line) => line.trim().length > 0) ?? '',
  };
}

/**
 * Read the command files a lint runs over: the nine named ones under a project
 * root, or an injected list.
 *
 * Injection is the point. A lint that can only be pointed at the real tree can
 * only ever be seen to pass, and a check nobody has watched fail is a check
 * nobody has watched work.
 *
 * A file that cannot be read carries `lines: null` and a reason rather than
 * throwing. A lint over fixed names must not allow a missing file to read like a
 * file that passed — which is what an exception would do, by naming nothing — nor
 * like a file that was skipped, which names nothing either. The caller reports
 * it.
 *
 * @returns {Array<{name: string, path: string, lines: string[]|null, unreadableReason?: string}>}
 */
// [::TICKET::] PX-210 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-210 --for-spec --no-implementation-order`.
function readCommandFiles({ projectRoot, files }) {
  const targets = files ?? COMMAND_FILE_NAMES.map((name) => ({
    name,
    path: join(projectRoot, COMMANDS_RELATIVE_DIR, `${name}.md`),
  }));

  return targets.map(({ name, path }) => {
    try {
      return { name, path, lines: readFileSync(path, 'utf8').split('\n') };
    } catch (error) {
      return { name, path, lines: null, unreadableReason: error.message };
    }
  });
}

/** The finding a lint emits for a file it could not read, or null when it could. */
// [::TICKET::] PX-210 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-210 --for-spec --no-implementation-order`.
function reportUnreadable(file) {
  if (file.lines !== null) {
    return null;
  }
  return {
    file: file.path,
    kind: 'unreadable-file',
    detail: `${file.path} could not be read, so nothing about it was checked: ${file.unreadableReason}`,
  };
}

/**
 * The files whose reverse heading appears before their forward procedure ends.
 *
 * Appending a reverse section is permitted; placing it inside the steps is not,
 * because a reader walking the steps meets it before the work is done and a
 * section there can remove a step. `boundify-graph.md` did: "Step 3 is not run
 * at all" sat immediately above the Step 3 heading.
 *
 * A file with no forward procedure heading is reported rather than passed. It
 * would otherwise satisfy the placement rule by having nothing to violate.
 *
 * @param {{ projectRoot?: string, files?: Array<{name: string, path: string}> }} args
 * @returns {Array<{file: string, kind: string, heading?: string, detail: string}>}
 */
export function lintRotationPlacement({ projectRoot, files } = {}) {
  const findings = [];

  for (const file of readCommandFiles({ projectRoot, files })) {
    const unreadable = reportUnreadable(file);
    if (unreadable !== null) {
      findings.push(unreadable);
      continue;
    }

    const anchorLines = file.lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => FORWARD_PROCEDURE_HEADING_PATTERNS.some((pattern) => pattern.test(line)));

    const reverseIndexes = file.lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => REVERSE_HEADING.test(line));

    if (reverseIndexes.length === 0) {
      continue;
    }

    if (anchorLines.length === 0) {
      findings.push({
        file: file.path,
        kind: 'no-procedure-anchor',
        detail:
          `${file.path} carries a reverse heading and no forward procedure heading, so the placement rule ` +
          'has nothing to anchor on and the file cannot be checked by it',
      });
      continue;
    }

    const procedureEnd = Math.max(...anchorLines.map(({ index }) => index));
    for (const { line, index } of reverseIndexes) {
      if (index < procedureEnd) {
        findings.push({
          file: file.path,
          kind: 'misplaced-reverse-section',
          heading: line.trimEnd(),
          detail:
            `${file.path} places "${line.trim()}" at line ${index + 1}, before its forward procedure ends ` +
            `at line ${procedureEnd + 1}`,
        });
      }
    }
  }

  return findings;
}

/**
 * The reverse sections whose first line is not a gate naming a declared predicate.
 *
 * The gate is the sentence that says when the section runs. Without one the
 * reader decides, and the two decisions made so far were both wrong: one named
 * a property of the project ("already contains an implementation") that this
 * repository satisfies, and three named a `mode` variable that exists in none of
 * the commands, in none of the scripts they call, and in no artifact.
 *
 * @param {{ projectRoot?: string, files?: Array<{name: string, path: string}> }} args
 * @returns {Array<{file: string, kind: string, heading?: string, predicate?: string, detail: string}>}
 */
export function lintRotationGates({ projectRoot, files, predicates = DECLARED_ROTATION_PREDICATES } = {}) {
  const findings = [];

  // The table is checked here rather than only in a test, so an entry that holds
  // in the forward rotation fails on the path a ticket takes — the same call the
  // regression gate makes — and not only where a developer remembers to look.
  for (const entry of rejectInadmissiblePredicates(predicates)) {
    findings.push({
      file: ROTATION_PREDICATE_TABLE,
      kind: 'inadmissible-predicate',
      predicate: entry.name,
      detail:
        `the declared predicate "${entry.name}" is not admissible: its kind must be "artifact" or ` +
        '"argument", it must declare forwardDefault false, and it must carry a reason',
    });
  }

  const declared = new Set(predicates.map((entry) => entry.name));

  for (const file of readCommandFiles({ projectRoot, files })) {
    const unreadable = reportUnreadable(file);
    if (unreadable !== null) {
      findings.push(unreadable);
      continue;
    }

    const { headingIndexes, gateLine } = readSoleGateLine(file.lines);

    if (headingIndexes.length === 0) {
      continue;
    }

    if (headingIndexes.length > 1) {
      findings.push({
        file: file.path,
        kind: 'multiple-reverse-headings',
        detail: `${file.path} carries ${headingIndexes.length} reverse headings, so it has more than one gate`,
      });
      continue;
    }

    const heading = file.lines[headingIndexes[0]].trimEnd();
    if (gateLine === null || gateLine === '') {
      findings.push({
        file: file.path,
        kind: 'missing-gate',
        heading,
        detail: `${file.path} carries a reverse section that opens with no sentence saying when it runs`,
      });
      continue;
    }

    const named = ROTATION_GATE_PATTERN.exec(gateLine)?.[1];
    if (named === undefined) {
      findings.push({
        file: file.path,
        kind: 'missing-gate',
        heading,
        detail: `${file.path} opens its reverse section with a line that is not a rotation gate: "${gateLine.trim()}"`,
      });
      continue;
    }

    if (!declared.has(named)) {
      findings.push({
        file: file.path,
        kind: 'undeclared-predicate',
        heading,
        predicate: named,
        detail: `${file.path} gates its reverse section on "${named}", which is not in the declared predicate table`,
      });
    }
  }

  return findings;
}

/**
 * The declared entries that may not gate a reverse-only section.
 *
 * An entry that holds in the forward rotation would allow a reverse section to
 * fire during one, which is the failure this whole rule exists to make unavailable.
 * An entry whose kind is outside the vocabulary is refused for the same reason a
 * missing reason is: a decision that does not say what it is cannot be reviewed.
 *
 * @param {Array<object>} predicates
 * @returns {Array<object>} the entries refused, in the order they were declared
 */
export function rejectInadmissiblePredicates(predicates) {
  return predicates.filter(
    (entry) =>
      !ROTATION_PREDICATE_KINDS.includes(entry.kind) ||
      entry.forwardDefault !== false ||
      typeof entry.reason !== 'string' ||
      entry.reason.trim().length < MINIMUM_REASON_LENGTH,
  );
}
