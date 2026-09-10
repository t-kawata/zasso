// [::TICKET::] P22-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-1 --for-spec --no-implementation-order`.
/**
 * The command-file digest — proof that an edit stayed an edit.
 *
 * `.claude/commands/*.md` may be appended to and corrected, never rewritten.
 * A whole-file hash would cry wolf on a legitimate append, so this module
 * freezes exactly the three things that must survive character for character:
 * the heading set, the Language Protocol table and the First-Class Rule line.
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
