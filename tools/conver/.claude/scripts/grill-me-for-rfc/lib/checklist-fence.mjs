// [::TICKET::] PX-208 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-208 --for-spec --no-implementation-order`.
/**
 * checklist-fence — a generator owns a region, not a file.
 *
 * Both checklist generators end by emitting a comment instructing the reader to
 * append their own constraints, and then rewrite the entire file. The next run
 * deletes exactly what the previous run asked for. `./CheckList.md` line 137 is a
 * live specimen: a hand-written `## AI補足` section, 146 lines into a file that
 * the next `/drill-rfc-down` would truncate. The command definition documents the
 * workflow that walks into it — "the AI visually inspects all items and appends
 * supplementary notes" — and the invocation passes `--no-backup`.
 *
 * This module is the shared answer. The generator replaces the bytes between its
 * fence markers and preserves every byte outside them, including on the first run
 * against a file produced by the unfenced generator.
 *
 * The fence is an HTML comment rather than the project's `[::...::]` marker
 * idiom: `CheckList.md` is Markdown rendered for a human, where an HTML comment
 * is invisible, while `[::STUB::]` and `[::TICKET::]` are read by the
 * repository's static scanner and would be misreported as stray work markers.
 *
 * Two spellings of this logic would be two things to drift, which is the failure
 * PX-207 already made once when it fixed one sibling generator and left the other
 * — so both generators import this file and neither re-implements it.
 */

export const GENERATED_BEGIN = '<!-- checklist:generated:begin -->';
export const GENERATED_END = '<!-- checklist:generated:end -->';

/**
 * The trailing comment the generator emits as the last line of its own output.
 *
 * It is the marker a legacy file is recognised by: everything after it was
 * authored by a human or an AI session, and is what the migration preserves.
 */
export const AI_SUPPLEMENT_COMMENT =
  '<!-- AI補足欄: 上記チェック項目に加え、プロジェクト固有の制約・注意事項をここに追記すること -->';

/** Remove at most one leading and one trailing newline. */
// [::TICKET::] PX-208 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-208 --for-spec --no-implementation-order`.
function trimOneNewlineEachSide(text) {
  return text.replace(/^\n/, '').replace(/\n$/, '');
}

// [::TICKET::] PX-208 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-208 --for-spec --no-implementation-order`.
function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}

/**
 * Split a checklist file into the regions the generator owns and the regions it
 * does not.
 *
 * The three returned fields are content, not raw slices: one separator newline
 * is removed from each edge so that `generated` is the body and `after` is the
 * preserved text, rather than the newlines that delimit them.
 *
 * Returns { ok: true, before, generated, after } or { ok: false, reason }.
 */
export function readFencedRegions(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return { ok: false, reason: 'no content to read' };
  }

  const openings = countOccurrences(text, GENERATED_BEGIN);
  const closings = countOccurrences(text, GENERATED_END);

  if (openings === 0 && closings === 0) {
    return { ok: false, reason: 'no fence markers: the file carries no generator-owned region' };
  }
  if (openings !== 1 || closings !== 1) {
    return {
      ok: false,
      reason: `expected one fence pair, found ${openings} opening and ${closings} closing markers`,
    };
  }

  const openIndex = text.indexOf(GENERATED_BEGIN);
  const closeIndex = text.indexOf(GENERATED_END);
  if (closeIndex < openIndex) {
    return { ok: false, reason: 'the fence closes before it opens' };
  }

  return {
    ok: true,
    before: text.slice(0, openIndex).replace(/\n$/, ''),
    generated: trimOneNewlineEachSide(
      text.slice(openIndex + GENERATED_BEGIN.length, closeIndex),
    ),
    after: text.slice(closeIndex + GENERATED_END.length).replace(/^\n/, ''),
  };
}

/**
 * Everything after the last trailing AI-supplement comment, or null when the
 * file carries no such comment and so cannot be claimed by the generator.
 */
// [::TICKET::] PX-208 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-208 --for-spec --no-implementation-order`.
function readPreservedTextOfLegacyFile(lines) {
  const commentIndex = lines.map((line) => line.trim()).lastIndexOf(AI_SUPPLEMENT_COMMENT);
  if (commentIndex === -1) return null;
  return lines.slice(commentIndex + 1).join('\n').replace(/^\n+/, '');
}

/**
 * Compose a checklist file: the generated body inside a fence pair, and whatever
 * the generator did not author preserved outside it.
 *
 * Three shapes are accepted, and two are refused rather than guessed at.
 *
 *   absent or empty        -> created   the fence pair and the body alone
 *   one fence pair         -> replaced  the fenced region is swapped, the rest kept
 *   no fence, trailing comment present -> migrated, the fence closed after the comment
 *   no fence, no comment   -> refused   the generator cannot claim this file
 *   two or more fence pairs -> refused  which region is the generator's is ambiguous
 *
 * Returns { ok: true, action, text } or { ok: false, reason }.
 */
export function composeFencedFile({ generatedBody, existingText }) {
  const block = `${GENERATED_BEGIN}\n${generatedBody}\n${GENERATED_END}`;

  if (typeof existingText !== 'string' || existingText.length === 0) {
    return { ok: true, action: 'created', text: `${block}\n` };
  }

  const read = readFencedRegions(existingText);
  if (read.ok) {
    const prefix = read.before === '' ? '' : `${read.before}\n`;
    const suffix = read.after === '' ? '\n' : `\n${read.after}`;
    return { ok: true, action: 'replaced', text: `${prefix}${block}${suffix}` };
  }

  const preserved = readPreservedTextOfLegacyFile(existingText.split('\n'));
  if (preserved === null) {
    return {
      ok: false,
      reason:
        `${read.reason}, and no trailing AI-supplement comment was found either: ` +
        'the generator cannot tell which bytes are its own, so it refuses rather than overwrite',
    };
  }

  const suffix = preserved === '' ? '\n' : `\n${preserved}`;
  return { ok: true, action: 'migrated', text: `${block}${suffix}` };
}
